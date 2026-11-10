// A small, believable demo pharmacy for guided tours. Every tour starts
// from a fresh copy (createDemoStore), so a tour can create, edit and delete
// freely: nothing here ever reaches the server.

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const monthsAhead = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n, 28);
  return iso(d);
};

// Medicines with their batches (prices per unit, GST split into CGST + SGST)
const MEDICINES = [
  {
    product_name: "Dolo 650 Tablet",
    salt_composition: "Paracetamol (650mg)",
    manufacturer: "Micro Labs Ltd",
    hsn_no: "30049099",
    units_per_pack: 15,
    pack_type: "Strip",
    cgst: 6,
    sgst: 6,
    batches: [
      { batch_no: "DL24091", expiry: 20, available_quantity: 145, mrp: 2.13, purchase_price: 1.42, supplier_name: "Shree Ganesh Pharma" },
      { batch_no: "DL25022", expiry: 2, available_quantity: 30, mrp: 2.13, purchase_price: 1.38, supplier_name: "Arihant Medico" },
    ],
  },
  {
    product_name: "Pan-D Capsule",
    salt_composition: "Pantoprazole (40mg) + Domperidone (30mg)",
    manufacturer: "Alkem Laboratories",
    hsn_no: "30049039",
    units_per_pack: 15,
    pack_type: "Strip",
    cgst: 6,
    sgst: 6,
    batches: [{ batch_no: "PD3318", expiry: 14, available_quantity: 90, mrp: 13.27, purchase_price: 8.9, supplier_name: "Shree Ganesh Pharma" }],
  },
  {
    product_name: "Shelcal 500 Tablet",
    salt_composition: "Calcium Carbonate (1250mg) + Vitamin D3 (250IU)",
    manufacturer: "Torrent Pharmaceuticals",
    hsn_no: "30045090",
    units_per_pack: 15,
    pack_type: "Strip",
    cgst: 6,
    sgst: 6,
    batches: [{ batch_no: "SC7741", expiry: 18, available_quantity: 60, mrp: 8.2, purchase_price: 5.6, supplier_name: "Arihant Medico" }],
  },
  {
    product_name: "Okacet 10 Tablet",
    salt_composition: "Cetirizine (10mg)",
    manufacturer: "Cipla Ltd",
    hsn_no: "30049099",
    units_per_pack: 10,
    pack_type: "Strip",
    cgst: 6,
    sgst: 6,
    batches: [{ batch_no: "OK1209", expiry: 11, available_quantity: 8, mrp: 1.99, purchase_price: 1.2, supplier_name: "Shree Ganesh Pharma" }],
  },
  {
    product_name: "Electral Powder",
    salt_composition: "Oral Rehydration Salts",
    manufacturer: "FDC Ltd",
    hsn_no: "30049099",
    units_per_pack: 1,
    pack_type: "Sachet",
    cgst: 6,
    sgst: 6,
    batches: [{ batch_no: "EL0921", expiry: 9, available_quantity: 40, mrp: 22.5, purchase_price: 16.8, supplier_name: "Arihant Medico" }],
  },
  {
    product_name: "Volini Gel 30g",
    salt_composition: "Diclofenac + Linseed Oil + Methyl Salicylate + Menthol",
    manufacturer: "Sun Pharmaceutical",
    hsn_no: "30049099",
    units_per_pack: 1,
    pack_type: "Tube",
    cgst: 9,
    sgst: 9,
    batches: [{ batch_no: "VG5530", expiry: 16, available_quantity: 12, mrp: 145, purchase_price: 104, supplier_name: "Shree Ganesh Pharma" }],
  },
];

const CUSTOMERS = [
  { name: "Ramesh Kumar", mobile: "9876500011", email: "", total_debt: 240, tier: "regular" },
  { name: "Sunita Sharma", mobile: "9812300022", email: "sunita@example.com", total_debt: 0 },
  { name: "Mohd. Irfan", mobile: "9900100033", email: "", total_debt: 0 },
  { name: "Kavita Joshi", mobile: "9988700044", email: "", total_debt: 515.5 },
];

const DOCTORS = [
  { name: "Dr. Anil Mehta", clinic: "Mehta Clinic", city: "Jaipur", state: "Rajasthan", license_number: "RMC-24519", source: "local" },
  { name: "Dr. Priya Verma", clinic: "City Care Hospital", city: "Jaipur", state: "Rajasthan", license_number: "RMC-31877", source: "global" },
  { name: "Dr. S. K. Gupta", clinic: "Gupta Nursing Home", city: "Ajmer", state: "Rajasthan", license_number: "RMC-11902", source: "global" },
];

let seq = 0;
const uid = (p) => `demo-${p}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const round2 = (n) => Math.round(n * 100) / 100;

// One bill line priced the way the billing page prices it (MRP is GST-inclusive)
export function priceLine({ unit_price, quantity, discount_percent = 0, cgst = 0, sgst = 0, purchase_price = 0 }) {
  const gst = (Number(cgst) || 0) + (Number(sgst) || 0);
  const excl = unit_price / (1 + gst / 100);
  const total = quantity * excl * (1 - discount_percent / 100) * (1 + gst / 100);
  const profit = (unit_price - purchase_price) * quantity - quantity * unit_price * (discount_percent / 100);
  return { item_total: round2(total), profit: round2(profit) };
}

export function createDemoStore() {
  seq = 0;
  const inventory = [];
  const products = MEDICINES.map((m) => {
    const product_id = uid("prod");
    m.batches.forEach((b) => {
      inventory.push({
        id: uid("inv"),
        product_id,
        product_name: m.product_name,
        salt_composition: m.salt_composition,
        manufacturer: m.manufacturer,
        hsn_no: m.hsn_no,
        units_per_pack: m.units_per_pack,
        pack_type: m.pack_type,
        batch_no: b.batch_no,
        expiry_date: monthsAhead(b.expiry),
        available_quantity: b.available_quantity,
        quantity: b.available_quantity,
        mrp: b.mrp,
        mrp_per_unit: b.mrp,
        purchase_price: b.purchase_price,
        cost_per_unit: b.purchase_price,
        cgst: m.cgst,
        sgst: m.sgst,
        supplier_name: b.supplier_name,
        schedule_h1: false,
        created_at: daysAgo(30).toISOString(),
      });
    });
    return { id: product_id, ...m };
  });

  const customers = CUSTOMERS.map((c) => ({ id: uid("cust"), ...c, created_at: daysAgo(90).toISOString() }));
  const doctors = DOCTORS.map((d) => ({ id: uid("doc"), ...d }));

  const store = { inventory, products, customers, doctors, bills: [], drafts: [], billNo: 1040, shortbook: [] };

  // A few past bills so the list, filters and customer history have something to show
  // Oldest first, so bill numbers follow the dates (INV-1041 … INV-1045)
  const past = [
    { c: 0, d: 0, days: 5, lines: [["Pan-D Capsule", 30]], paid: false, advance: 200 },
    { c: 2, d: 2, days: 2, lines: [["Okacet 10 Tablet", 10], ["Dolo 650 Tablet", 15]], paid: true, mode: "Card" },
    { c: 3, d: null, days: 1, lines: [["Volini Gel 30g", 1], ["Electral Powder", 4]], paid: false, credit: true, paidNow: 100 },
    { c: 1, d: 1, days: 0, lines: [["Shelcal 500 Tablet", 30]], paid: true, mode: "Cash" },
    { c: 0, d: 0, days: 0, lines: [["Dolo 650 Tablet", 10], ["Pan-D Capsule", 15]], paid: true, mode: "UPI" },
  ];
  past.forEach((p) => {
    const cust = customers[p.c];
    const items = p.lines.map(([name, qty]) => {
      const inv = inventory.find((i) => i.product_name === name);
      return lineFromInventory(inv, qty, 0);
    });
    insertBill(store, {
      customer: cust,
      doctor: p.d === null ? null : doctors[p.d].name,
      items,
      billing_date: iso(daysAgo(p.days)),
      is_paid: !!p.paid,
      payment_mode: p.mode || null,
      is_credit: !!p.credit,
      paid_now: p.paidNow || 0,
      is_advance_paid: !!p.advance,
      advance_amount: p.advance || 0,
    });
  });
  return store;
}

function lineFromInventory(inv, quantity, discount_percent) {
  const { item_total, profit } = priceLine({ unit_price: inv.mrp, quantity, discount_percent, cgst: inv.cgst, sgst: inv.sgst, purchase_price: inv.purchase_price });
  return {
    inventory_id: inv.id,
    product_name: inv.product_name,
    batch_no: inv.batch_no,
    hsn_no: inv.hsn_no,
    expiry_date: inv.expiry_date,
    quantity,
    unit_price: inv.mrp,
    mrp_per_unit: inv.mrp,
    purchase_price: inv.purchase_price,
    discount_percent,
    cgst: inv.cgst,
    sgst: inv.sgst,
    units_per_pack: inv.units_per_pack,
    item_total,
    profit,
    delivery_status: "Delivered",
  };
}

// Adds a bill the way the server would (totals, stock, customer dues)
export function insertBill(store, input) {
  const items = (input.items || []).map((it) => {
    const qty = parseInt(it.quantity) || 1;
    const priced = priceLine({ unit_price: Number(it.unit_price) || 0, quantity: qty, discount_percent: Number(it.discount_percent) || 0, cgst: it.cgst, sgst: it.sgst, purchase_price: Number(it.purchase_price) || 0 });
    return { ...it, quantity: qty, sold_units: qty, mrp_per_unit: it.unit_price, total: priced.item_total, item_total: priced.item_total, profit: priced.profit, delivery_status: input.is_advance_paid ? "Pending" : it.delivery_status || "Delivered" };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.item_total, 0));
  const discount_percent = Number(input.discount_percent) || 0;
  const discount_amount = round2((subtotal * discount_percent) / 100);
  const grand_total = round2(subtotal - discount_amount);
  const profit = round2(items.reduce((s, i) => s + i.profit, 0) - discount_amount);

  let customer = input.customer || store.customers.find((c) => c.id === input.customer_id);
  if (!customer && input.customer_name && input.customer_name !== "Walk-in") {
    customer = { id: uid("cust"), name: input.customer_name, mobile: input.customer_mobile || "", email: input.customer_email || "", total_debt: 0, created_at: new Date().toISOString() };
    store.customers.unshift(customer);
  }

  // Stock goes down as the bill is made
  items.forEach((it) => {
    const inv = store.inventory.find((i) => i.id === it.inventory_id);
    if (inv) inv.available_quantity = Math.max(0, inv.available_quantity - it.quantity);
  });

  const paidAmount = input.is_paid ? grand_total : input.is_advance_paid ? Number(input.advance_amount) || 0 : input.is_credit ? Number(input.paid_now) || 0 : 0;
  const due = round2(Math.max(0, grand_total - paidAmount));
  if (customer && due > 0) customer.total_debt = round2((customer.total_debt || 0) + due);

  const created = new Date(input.billing_date ? `${input.billing_date}T${new Date().toTimeString().slice(0, 8)}` : Date.now());
  const bill = {
    id: uid("bill"),
    bill_no: `INV-${++store.billNo}`,
    customer_id: customer?.id || null,
    customer_name: customer?.name || input.customer_name || "Walk-in",
    customer_mobile: customer?.mobile || input.customer_mobile || "",
    customer_email: customer?.email || input.customer_email || "",
    doctor: input.doctor || null,
    billing_date: input.billing_date || iso(new Date()),
    created_at: created.toISOString(),
    items,
    subtotal,
    discount_percent,
    discount_amount,
    grand_total,
    total_amount: grand_total,
    profit,
    is_paid: !!input.is_paid || due === 0,
    payment_mode: input.payment_mode || null,
    is_advance_paid: !!input.is_advance_paid,
    delivery_status: input.is_advance_paid ? "Pending" : "Delivered",
    advance_amount: Number(input.advance_amount) || 0,
    is_credit: !!input.is_credit,
    paid_amount: paidAmount,
    total_paid: paidAmount,
    remaining_amount: due,
    payments: paidAmount > 0 ? [{ amount: paidAmount, mode: input.payment_mode || "Cash", date: created.toISOString(), type: input.is_advance_paid ? "advance" : "payment" }] : [],
    inventory_billed_qty: items.reduce((s, i) => s + i.quantity, 0),
    negative_billed_qty: 0,
    schedule_h1_items: [],
    demo: true,
  };
  store.bills.unshift(bill);
  return bill;
}

export { iso, daysAgo, round2, uid };
