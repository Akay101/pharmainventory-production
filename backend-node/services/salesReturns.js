// Sales returns: goods a customer brings back against a bill.
//
// A return is its own document (a credit note, `sales_returns`) and it also
// nets the bill down, so every total that reads the bill (dashboard, reports,
// dues, payment-mode sums) sees what was actually sold without knowing about
// returns:
//   - each returned line loses the units, amount and profit returned
//   - the bill total, profit and cost drop by the same amounts
//   - what the customer still owed on the bill is reduced first
//   - anything they had already paid for the returned goods is refunded, in
//     money (a negative payment on the bill) or as advance credit
// The figures as invoiced are kept on the bill (`original_*`) for the bill PDF.
//
// Returned units go back to their batch when the goods can be sold again
// (`restock`); damaged or expired goods are written off instead.
//
// A return can be cancelled while it is the latest on its bill: the bill's
// lines and totals go back to the snapshot taken before it, the refund entry
// is removed, and restocked units come off the shelf again.
const { v4: uuidv4 } = require("uuid");
const { inventoryIdQuery } = require("./stock");

const COLLECTION = "sales_returns";
const ACTIVE = "Completed";
const CANCELLED = "Cancelled";
const REFUND_MODES = ["Cash", "UPI", "Card", "Advance"];
const REASONS = ["Customer returned", "Wrong item", "Damaged", "Expired", "Doctor changed prescription", "Other"];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nowIso = () => new Date().toISOString();
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

class HttpError extends Error {
  constructor(status, detail, extra = {}) {
    super(detail);
    this.status = status;
    this.extra = extra;
  }
}

// ── Bill money, the same way the bill routes work it out ────────────────────

const billGrand = (b) => Number(b.grand_total ?? b.total_amount) || 0;
const billPaid = (b) => (b.total_paid !== undefined ? Number(b.total_paid) || 0 : b.is_paid ? billGrand(b) : Number(b.advance_amount) || 0);
const deliveredValue = (b) =>
  b.is_advance_paid ? (b.items || []).reduce((s, i) => (i.delivery_status === "Delivered" ? s + (Number(i.item_total) || 0) : s), 0) : billGrand(b);
const debtAndAdvance = (b) => {
  const dv = deliveredValue(b);
  const p = billPaid(b);
  return { debt: Math.max(0, dv - p), advance: Math.max(0, p - dv) };
};

const realInventory = (id) => !!id && !String(id).startsWith("negative-");
const isExpired = (d) => typeof d === "string" && /^\d{4}-\d{2}/.test(d) && d.slice(0, 10) < istToday();

// Lines carry the bill-level discount already (newer bills) or not (older
// ones); this factor turns a line's amount into what was actually charged.
function chargeFactor(bill) {
  const lines = (bill.items || []).reduce((s, i) => s + (Number(i.item_total) || 0), 0);
  if (lines <= 0) return 1;
  const f = (billGrand(bill) - (Number(bill.round_off) || 0)) / lines;
  return Number.isFinite(f) && f > 0 && f < 2 ? f : 1;
}

// Why a bill can't take a return right now, or null
function blockReason(bill) {
  if (!bill) return "Bill not found";
  if ((bill.items || []).some((i) => i.delivery_status === "Pending")) {
    return "Some items on this bill are not delivered yet. Deliver them (or edit the bill) before taking a return.";
  }
  if (bill.return_status === "Returned" || billGrand(bill) <= 0) return "Everything on this bill has already been returned";
  return null;
}

// What each line can still give back
function returnableLines(bill) {
  const factor = chargeFactor(bill);
  return (bill.items || []).map((it, index) => {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const value = round2((Number(it.item_total) || 0) * factor);
    return {
      line_index: index,
      inventory_id: it.inventory_id || null,
      product_name: it.product_name,
      batch_no: it.batch_no || null,
      expiry_date: it.expiry_date || null,
      units_per_pack: Number(it.units_per_pack) || null,
      unit_price: Number(it.unit_price) || 0,
      sold_qty: Number(it.original_quantity ?? it.quantity) || 0,
      returned_qty: Number(it.returned_qty) || 0,
      returnable_qty: qty,
      returnable_value: value,
      refund_per_unit: qty > 0 ? round2(value / qty) : 0,
      can_restock: realInventory(it.inventory_id),
      expired: isExpired(it.expiry_date),
    };
  });
}

function publicBill(bill) {
  const { _id, ...b } = bill;
  const paid = billPaid(b);
  return {
    id: b.id,
    bill_no: b.bill_no,
    billing_date: b.billing_date,
    customer_id: b.customer_id || null,
    customer_name: b.customer_name || "Walk-in",
    customer_mobile: b.customer_mobile || null,
    grand_total: round2(billGrand(b)),
    original_grand_total: round2(b.original_grand_total ?? billGrand(b)),
    total_paid: round2(paid),
    due: round2(Math.max(0, billGrand(b) - paid)),
    is_paid: !!b.is_paid,
    returned_amount: round2(b.returned_amount || 0),
    return_status: b.return_status || null,
    blocked: blockReason(b),
    lines: returnableLines(b),
  };
}

async function nextReturnNo(db, pharmacyId, session) {
  const ym = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7).replace("-", "");
  const prefix = `SR-${ym}-`;
  const last = await db
    .collection(COLLECTION)
    .find({ pharmacy_id: pharmacyId, return_no: { $regex: `^${prefix}` } }, { session, projection: { return_no: 1 } })
    .sort({ return_no: -1 })
    .limit(1)
    .toArray();
  const n = last.length ? parseInt(String(last[0].return_no).slice(prefix.length, prefix.length + 4), 10) || 0 : 0;
  // The desktop app tags its numbers, as with bills, so offline counters can't collide
  const tag = process.env.DAVADESK_BILL_TAG ? `-${process.env.DAVADESK_BILL_TAG}` : "";
  return `${prefix}${String(n + 1).padStart(4, "0")}${tag}`;
}

// Moves up to `units` onto (+) or off (-) a batch's shelf. Returns how many moved.
async function moveStock(db, session, pharmacyId, inventoryId, units) {
  if (!realInventory(inventoryId) || !units) return 0;
  if (units > 0) {
    const r = await db
      .collection("inventory")
      .updateOne(inventoryIdQuery(pharmacyId, inventoryId), { $inc: { available_quantity: units, sales_returned_quantity: units }, $set: { updated_at: nowIso() } }, { session });
    return r.matchedCount ? units : 0;
  }
  const take = -units;
  const before = await db
    .collection("inventory")
    .findOneAndUpdate(
      inventoryIdQuery(pharmacyId, inventoryId),
      [
        {
          $set: {
            available_quantity: { $max: [0, { $subtract: [{ $ifNull: ["$available_quantity", 0] }, take] }] },
            sales_returned_quantity: { $max: [0, { $subtract: [{ $ifNull: ["$sales_returned_quantity", 0] }, take] }] },
            updated_at: nowIso(),
          },
        },
      ],
      { session, returnDocument: "before" }
    );
  if (!before) return 0;
  return -Math.min(take, Math.max(0, Number(before.available_quantity) || 0));
}

const SNAPSHOT_FIELDS = [
  "items",
  "grand_total",
  "total_amount",
  "subtotal",
  "discount_amount",
  "profit",
  "total_cost",
  "inventory_billed_qty",
  "negative_billed_qty",
  "returned_amount",
  "return_status",
  "is_paid",
  "payment_date",
];

/**
 * Creates a return against a bill.
 * input: { bill_id, items: [{ line_index, quantity, restock }], full, reason,
 *          notes, refund_mode, return_date }
 */
async function createReturn(db, session, user, input) {
  const pharmacyId = user.pharmacy_id;
  const bill = await db.collection("bills").findOne({ id: input.bill_id, pharmacy_id: pharmacyId }, { session });
  if (!bill) throw new HttpError(404, "Bill not found");
  const blocked = blockReason(bill);
  if (blocked) throw new HttpError(400, blocked);

  const lines = returnableLines(bill);
  const factor = chargeFactor(bill);
  const reason = REASONS.includes(input.reason) ? input.reason : "Customer returned";

  // What is being returned, per bill line
  let wanted;
  if (input.full) {
    wanted = lines.filter((l) => l.returnable_qty > 0).map((l) => ({ line: l, qty: l.returnable_qty, restock: input.restock_all !== false && l.can_restock && !l.expired }));
  } else {
    if (!Array.isArray(input.items) || !input.items.length) throw new HttpError(400, "Pick at least one item to return");
    const seen = new Set();
    wanted = [];
    for (const raw of input.items) {
      const idx = Number(raw?.line_index);
      const line = lines[idx];
      if (!Number.isInteger(idx) || !line) throw new HttpError(400, "An item to return is not on this bill");
      if (seen.has(idx)) throw new HttpError(400, `${line.product_name} is listed twice`);
      seen.add(idx);
      const qty = Number(raw.quantity);
      if (!qty) continue;
      if (!Number.isInteger(qty) || qty < 0) throw new HttpError(400, `Enter whole units to return for ${line.product_name}`);
      if (qty > line.returnable_qty) {
        throw new HttpError(400, `${line.product_name}: only ${line.returnable_qty} unit(s) can be returned${line.returned_qty ? ` (${line.returned_qty} already returned)` : ""}`);
      }
      wanted.push({ line, qty, restock: raw.restock !== false && raw.restock !== "false" && line.can_restock });
    }
    if (!wanted.length) throw new HttpError(400, "Enter how many units of at least one item are coming back");
  }
  if (!wanted.length) throw new HttpError(400, "Nothing left on this bill to return");

  const snapshot = Object.fromEntries(SNAPSHOT_FIELDS.filter((f) => bill[f] !== undefined).map((f) => [f, bill[f]]));
  const before = debtAndAdvance(bill);
  const grandBefore = billGrand(bill);
  const paidBefore = billPaid(bill);
  const items = (bill.items || []).map((it) => ({ ...it }));

  const returnLines = [];
  let total = 0;
  let cost = 0;
  let profitOut = 0;
  for (const { line, qty, restock } of wanted) {
    const it = items[line.line_index];
    const lineQty = Number(it.quantity) || 0;
    const whole = qty === lineQty;
    const charged = whole ? line.returnable_value : round2(line.refund_per_unit * qty);
    const pp = Number(it.purchase_price) || 0;
    const lineCost = round2(pp * qty);

    if (it.original_quantity === undefined) {
      it.original_quantity = lineQty;
      it.original_item_total = it.item_total;
      it.original_line_discount = it.line_discount;
      it.original_profit = it.profit;
    }
    const itemTotalOut = whole ? Number(it.item_total) || 0 : charged / factor;
    const keep = lineQty > 0 ? (lineQty - qty) / lineQty : 0;
    it.quantity = lineQty - qty;
    it.item_total = whole ? 0 : round2((Number(it.item_total) || 0) - itemTotalOut);
    if (it.line_discount !== undefined) it.line_discount = round2((Number(it.line_discount) || 0) * keep);
    it.profit = whole ? 0 : round2((Number(it.profit) || 0) - (itemTotalOut - lineCost));
    it.returned_qty = (Number(it.returned_qty) || 0) + qty;
    it.returned_amount = round2((Number(it.returned_amount) || 0) + charged);

    let restocked = 0;
    let sdDelta = 0;
    if (restock) {
      restocked = await moveStock(db, session, pharmacyId, it.inventory_id, qty);
      if (it.stock_deducted !== undefined) {
        const sd = Number(it.stock_deducted) || 0;
        sdDelta = Math.min(sd, restocked);
        it.stock_deducted = sd - sdDelta;
      }
    }

    total += charged;
    cost += lineCost;
    profitOut += charged - lineCost;
    returnLines.push({
      line_index: line.line_index,
      inventory_id: it.inventory_id || null,
      product_name: it.product_name,
      batch_no: it.batch_no || null,
      expiry_date: it.expiry_date || null,
      units_per_pack: Number(it.units_per_pack) || null,
      quantity: qty,
      unit_price: Number(it.unit_price) || 0,
      refund_per_unit: line.refund_per_unit,
      amount: round2(charged),
      purchase_price: pp,
      restock: restocked > 0,
      restocked_units: restocked,
      written_off_units: qty - restocked,
      stock_deducted_delta: sdDelta,
    });
  }

  const everything = items.every((it) => (Number(it.quantity) || 0) <= 0);
  // Returning everything left gives back the whole bill total, round-off included
  if (everything) total = grandBefore;
  total = round2(total);
  if (total <= 0 && !everything) throw new HttpError(400, "These items were billed at ₹0, so there is nothing to refund. Pick other items.");

  const grandAfter = everything ? 0 : round2(grandBefore - total);
  const due = round2(Math.max(0, grandBefore - paidBefore));
  const adjusted = round2(Math.min(total, due));
  const refund = round2(Math.max(0, paidBefore - grandAfter));

  let refundMode = null;
  if (refund > 0) {
    refundMode = REFUND_MODES.includes(input.refund_mode) ? input.refund_mode : null;
    if (!refundMode) throw new HttpError(400, `₹${refund.toFixed(2)} is to be given back. Choose how: Cash, UPI, Card or as advance credit.`, { refund });
    if (refundMode === "Advance" && !bill.customer_id) {
      throw new HttpError(400, "This is a walk-in bill, so the refund can't be kept as advance. Refund it in Cash, UPI or Card.");
    }
  }

  const ret = {
    id: uuidv4(),
    pharmacy_id: pharmacyId,
    return_no: await nextReturnNo(db, pharmacyId, session),
    bill_id: bill.id,
    bill_no: bill.bill_no,
    billing_date: bill.billing_date || null,
    customer_id: bill.customer_id || null,
    customer_name: bill.customer_name || "Walk-in",
    customer_mobile: bill.customer_mobile || null,
    return_date: /^\d{4}-\d{2}-\d{2}$/.test(input.return_date || "") ? input.return_date : istToday(),
    type: everything ? "full" : "partial",
    reason,
    notes: String(input.notes || "").slice(0, 500),
    items: returnLines,
    total_units: returnLines.reduce((s, l) => s + l.quantity, 0),
    total_amount: total,
    profit_reversed: round2(everything ? Number(bill.profit) || 0 : profitOut),
    bill_total_before: round2(grandBefore),
    bill_total_after: grandAfter,
    paid_before: round2(paidBefore),
    adjusted_against_due: adjusted,
    refund_amount: refund,
    refund_mode: refundMode,
    status: ACTIVE,
    bill_snapshot: snapshot,
    created_by: user.id,
    created_by_name: user.name || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  // The bill, netted down
  const firstReturn = bill.original_grand_total === undefined;
  const linesBefore = (bill.items || []).reduce((s, i) => s + (Number(i.item_total) || 0), 0);
  const linesAfter = items.reduce((s, i) => s + (Number(i.item_total) || 0), 0);
  const scale = linesBefore > 0 ? linesAfter / linesBefore : 0;
  const returnedQtyInv = returnLines.filter((l) => realInventory(l.inventory_id)).reduce((s, l) => s + l.quantity, 0);
  const returnedQtyManual = ret.total_units - returnedQtyInv;
  const paidAfter = round2(paidBefore - refund);
  const isPaid = round2(grandAfter - paidAfter) <= 0;

  const $set = {
    items,
    grand_total: grandAfter,
    total_amount: grandAfter,
    subtotal: everything ? 0 : round2((Number(bill.subtotal) || 0) * scale),
    discount_amount: everything ? 0 : round2((Number(bill.discount_amount) || 0) * scale),
    total_cost: everything ? 0 : round2(Math.max(0, (Number(bill.total_cost) || 0) - cost)),
    profit: everything ? 0 : round2((Number(bill.profit) || 0) - profitOut),
    inventory_billed_qty: Math.max(0, (Number(bill.inventory_billed_qty) || 0) - returnedQtyInv),
    negative_billed_qty: Math.max(0, (Number(bill.negative_billed_qty) || 0) - returnedQtyManual),
    returned_amount: round2((Number(bill.returned_amount) || 0) + total),
    return_status: everything ? "Returned" : "Partially Returned",
    has_returns: true,
    last_return_at: ret.created_at,
    total_paid: paidAfter,
    is_paid: isPaid,
    updated_at: nowIso(),
  };
  if (isPaid && !bill.is_paid) $set.payment_date = nowIso();
  if (firstReturn) {
    $set.original_grand_total = round2(grandBefore);
    $set.original_subtotal = bill.subtotal;
    $set.original_discount_amount = bill.discount_amount;
    $set.original_profit = bill.profit;
    $set.original_total_cost = bill.total_cost;
  }
  const $push = { sales_returns: { id: ret.id, return_no: ret.return_no, amount: total, refund_amount: refund, refund_mode: refundMode, at: ret.created_at } };
  if (refund > 0) {
    let payments = bill.payments || [];
    // Old bills: what was paid becomes the first entry, so the list still adds up
    if (!payments.length && paidBefore > 0) {
      payments = [{ amount: round2(paidBefore), payment_mode: bill.payment_mode || "Cash", paid_at: bill.created_at || bill.billing_date || nowIso() }];
    }
    $set.payments = [
      ...payments,
      {
        amount: -refund,
        payment_mode: refundMode,
        paid_at: ret.created_at,
        by: user.name || null,
        kind: "refund",
        sales_return_id: ret.id,
        note: refundMode === "Advance" ? `Refund for ${ret.return_no} kept as advance` : `Refund for ${ret.return_no}`,
      },
    ];
  }
  await db.collection("bills").updateOne({ id: bill.id, pharmacy_id: pharmacyId }, { $set, $push }, { session });

  // The customer's balances follow the bill
  if (bill.customer_id) {
    const after = debtAndAdvance({ ...bill, ...$set });
    const inc = { total_debt: round2(after.debt - before.debt), total_advance: round2(after.advance - before.advance) };
    const update = { $inc: inc };
    if (refundMode === "Advance") {
      update.$inc.advance_credit = refund;
      update.$push = {
        advance_ledger: {
          $each: [{ id: uuidv4(), type: "return", amount: refund, payment_mode: "Sales return", bill_id: bill.id, bill_no: bill.bill_no, sales_return_id: ret.id, return_no: ret.return_no, at: ret.created_at, by: user.name || null }],
          $slice: -500,
        },
      };
    }
    await db.collection("customers").updateOne({ id: bill.customer_id, pharmacy_id: pharmacyId }, update, { session });
  }

  await db.collection(COLLECTION).insertOne({ ...ret }, { session });
  return ret;
}

// Undoes a return. Only the latest live return on a bill can be undone.
async function cancelReturn(db, session, user, returnId, note) {
  const pharmacyId = user.pharmacy_id;
  const ret = await db.collection(COLLECTION).findOne({ id: returnId, pharmacy_id: pharmacyId }, { session });
  if (!ret) throw new HttpError(404, "Sales return not found");
  if (ret.status === CANCELLED) throw new HttpError(400, "This return is already cancelled");
  const bill = await db.collection("bills").findOne({ id: ret.bill_id, pharmacy_id: pharmacyId }, { session });
  if (!bill) throw new HttpError(400, "The bill for this return was deleted, so it can't be undone");

  const later = await db.collection(COLLECTION).findOne(
    { pharmacy_id: pharmacyId, bill_id: bill.id, status: ACTIVE, created_at: { $gt: ret.created_at } },
    { session, projection: { return_no: 1 } }
  );
  if (later) throw new HttpError(400, `${later.return_no} was made on this bill after this one. Cancel that first.`);

  if (ret.refund_mode === "Advance" && ret.refund_amount > 0 && bill.customer_id) {
    const c = await db.collection("customers").findOne({ id: bill.customer_id, pharmacy_id: pharmacyId }, { session, projection: { advance_credit: 1 } });
    const credit = round2(c?.advance_credit || 0);
    if (credit + 0.001 < ret.refund_amount) {
      throw new HttpError(400, `The ₹${ret.refund_amount.toFixed(2)} refund went to advance and only ₹${credit.toFixed(2)} of it is left, so this return can't be undone.`);
    }
  }

  const before = debtAndAdvance(bill);
  const snap = ret.bill_snapshot || {};
  const items = (snap.items || bill.items || []).map((it) => ({ ...it }));

  // Restocked units come off the shelf again (as many as are still there)
  const shortfalls = [];
  for (const l of ret.items || []) {
    if (!l.restocked_units) continue;
    const moved = -(await moveStock(db, session, pharmacyId, l.inventory_id, -l.restocked_units));
    const short = l.restocked_units - moved;
    const it = items[l.line_index];
    if (short > 0) {
      shortfalls.push({ product_name: l.product_name, batch_no: l.batch_no, units: short });
      if (it && it.stock_deducted !== undefined) it.stock_deducted = Math.max(0, (Number(it.stock_deducted) || 0) - short);
    }
  }

  const payments = (bill.payments || []).filter((p) => p.sales_return_id !== ret.id);
  const paidAfter = round2(billPaid(bill) + (Number(ret.refund_amount) || 0));
  const restored = { ...snap, items };
  const grandAfter = billGrand({ ...bill, ...restored });
  const otherReturns = (bill.sales_returns || []).filter((r) => r.id !== ret.id);

  const $set = {
    ...restored,
    payments,
    total_paid: paidAfter,
    is_paid: round2(grandAfter - paidAfter) <= 0,
    sales_returns: otherReturns,
    has_returns: otherReturns.length > 0,
    updated_at: nowIso(),
  };
  const $unset = {};
  if (!otherReturns.length) {
    for (const f of ["original_grand_total", "original_subtotal", "original_discount_amount", "original_profit", "original_total_cost", "return_status", "returned_amount", "last_return_at"]) {
      delete $set[f];
      $unset[f] = "";
    }
    $set.items = items.map(({ original_quantity, original_item_total, original_line_discount, original_profit, returned_qty, returned_amount, ...rest }) => rest);
  }
  await db.collection("bills").updateOne({ id: bill.id, pharmacy_id: pharmacyId }, Object.keys($unset).length ? { $set, $unset } : { $set }, { session });

  if (bill.customer_id) {
    const after = debtAndAdvance({ ...bill, ...$set });
    const update = { $inc: { total_debt: round2(after.debt - before.debt), total_advance: round2(after.advance - before.advance) } };
    if (ret.refund_mode === "Advance" && ret.refund_amount > 0) {
      update.$inc.advance_credit = -ret.refund_amount;
      update.$push = {
        advance_ledger: {
          $each: [{ id: uuidv4(), type: "return_cancelled", amount: ret.refund_amount, payment_mode: "Sales return", bill_id: bill.id, bill_no: bill.bill_no, sales_return_id: ret.id, return_no: ret.return_no, at: nowIso(), by: user.name || null }],
          $slice: -500,
        },
      };
    }
    await db.collection("customers").updateOne({ id: bill.customer_id, pharmacy_id: pharmacyId }, update, { session });
  }

  await db.collection(COLLECTION).updateOne(
    { id: ret.id },
    { $set: { status: CANCELLED, cancelled_at: nowIso(), cancelled_by: user.id, cancelled_by_name: user.name || null, cancel_note: String(note || "").slice(0, 300), stock_shortfall: shortfalls, updated_at: nowIso() } },
    { session }
  );
  return { ret, shortfalls };
}

// The bill as invoiced, for its PDF: the original lines and total, with the
// balance still owed today, and the returns noted under the bill.
function invoicedView(bill) {
  if (!bill || bill.original_grand_total === undefined) return bill;
  const items = (bill.items || []).map((it) =>
    it.original_quantity === undefined
      ? it
      : { ...it, quantity: it.original_quantity, item_total: it.original_item_total, line_discount: it.original_line_discount, profit: it.original_profit }
  );
  const original = Number(bill.original_grand_total) || 0;
  const due = Math.max(0, billGrand(bill) - billPaid(bill));
  const list = (bill.sales_returns || []).map((r) => `${r.return_no} ₹${round2(r.amount).toFixed(2)}`).join(", ");
  const note = `Returned: ${list}. Net bill ₹${round2(billGrand(bill)).toFixed(2)}.`;
  return {
    ...bill,
    items,
    grand_total: original,
    total_amount: original,
    subtotal: bill.original_subtotal ?? bill.subtotal,
    discount_amount: bill.original_discount_amount ?? bill.discount_amount,
    total_paid: round2(original - due),
    notes: bill.notes ? `${bill.notes} · ${note}` : note,
  };
}

module.exports = {
  COLLECTION,
  ACTIVE,
  CANCELLED,
  REFUND_MODES,
  REASONS,
  HttpError,
  round2,
  publicBill,
  blockReason,
  createReturn,
  cancelReturn,
  invoicedView,
};
