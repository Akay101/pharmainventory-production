const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { takeFromStock, returnToStock } = require("../services/stock");
const { acceptImages, scanForBilling } = require("../services/ai/scanService");
const { matchForBilling } = require("../services/ai/inventoryMatch");
const { generateBillPDF } = require("../services/pdf");
const { uploadToR2 } = require("../services/r2");
const billShare = require("../services/billShare");
const { sendBillEmail } = require("../services/email");
const { logActivity } = require("../utils/activityLogger");
const { requireSubscription } = require("../middleware/subscription");
const {
  getGlobalDoctorsCollection,
  getCached,
  setCached,
} = require("../utils/globalDb");

const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Generate bill number
const generateBillNo = () => {
  // Timestamp in IST (servers run in UTC), e.g. BILL-20261022143005
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `BILL-${ist.getUTCFullYear()}${p(ist.getUTCMonth() + 1)}${p(ist.getUTCDate())}${p(ist.getUTCHours())}${p(ist.getUTCMinutes())}${p(ist.getUTCSeconds())}`;
};

// Two counters billing in the same second would otherwise share a number
const uniqueBillNo = async (db, pharmacyId) => {
  const base = generateBillNo();
  let candidate = base;
  for (let i = 2; await db.collection("bills").findOne({ pharmacy_id: pharmacyId, bill_no: candidate }, { projection: { _id: 1 } }); i++) {
    candidate = `${base}-${i}`;
  }
  return candidate;
};

// MRP is GST-inclusive, so a line's amount is qty x MRP less its discount.
// Computed here rather than trusted from the client.
const lineAmounts = (item) => {
  const quantity = parseInt(item.quantity) || 1;
  const unitPrice = parseFloat(item.unit_price) || 0;
  const discountPercent = Math.min(100, Math.max(0, parseFloat(item.discount_percent) || 0));
  const purchasePrice = parseFloat(item.purchase_price) || 0;
  const gross = quantity * unitPrice;
  const itemDiscount = gross * (discountPercent / 100);
  const itemTotal = Math.round((gross - itemDiscount) * 100) / 100;
  return { quantity, unitPrice, discountPercent, purchasePrice, itemTotal, itemProfit: itemTotal - purchasePrice * quantity };
};

// GET /api/bills
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db; // Forces reload for updated customer_ids

    const {
      search,
      customer_id,
      is_paid,
      is_advance_paid,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      sort_by = "billing_date",
      sort_order = "desc",
      highlight_id,
    } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { bill_no: { $regex: escapedSearch, $options: "i" } },
        { customer_name: { $regex: escapedSearch, $options: "i" } },
        { customer_mobile: { $regex: escapedSearch, $options: "i" } },
        { customer_email: { $regex: escapedSearch, $options: "i" } },
        { doctor: { $regex: escapedSearch, $options: "i" } },
        { notes: { $regex: escapedSearch, $options: "i" } },
        { billing_date: { $regex: escapedSearch, $options: "i" } },
        { "items.product_name": { $regex: escapedSearch, $options: "i" } },
        { "items.batch_no": { $regex: escapedSearch, $options: "i" } },
      ];
    }

    if (customer_id) {
      query.customer_id = customer_id;
    }

    // 💰 Paid filter
    if (is_paid !== undefined) {
      query.is_paid = is_paid === "true";
    }

    if (is_advance_paid !== undefined) {
      query.is_advance_paid = is_advance_paid === "true";
    }

    // 📅 Date range filter (billing_date)
    if (start_date || end_date) {
      query.billing_date = {};
      if (start_date) query.billing_date.$gte = start_date;
      if (end_date) query.billing_date.$lte = end_date;
    }

    const sortDir = sort_order === "asc" ? 1 : -1;

    // 🧠 Smart sorting logic
    const sortOptions =
      sort_by === "billing_date"
        ? { billing_date: sortDir, created_at: sortDir }
        : { [sort_by]: sortDir };

    let pageNum = parseInt(page);
    if (highlight_id) {
      const allBillsIds = await db
        .collection("bills")
        .find(query)
        .sort(sortOptions)
        .project({ id: 1 })
        .toArray();
      const targetIndex = allBillsIds.findIndex((b) => b.id === highlight_id);
      if (targetIndex !== -1) {
        pageNum = Math.floor(targetIndex / parseInt(limit)) + 1;
      }
    }

    const skip = (parseInt(pageNum) - 1) * parseInt(limit);

    const bills = await db
      .collection("bills")
      .find(query, { projection: { _id: 0 } })
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection("bills").countDocuments(query);

    // Ensure totals always exist
    const processedBills = bills.map((bill) => ({
      ...bill,
      grand_total: bill.grand_total || bill.total_amount || 0,
      total_amount: bill.total_amount || bill.grand_total || 0,
    }));

    res.json({
      bills: processedBills,
      pagination: {
        page: pageNum,
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / parseInt(limit)) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/bills/insights
router.get("/insights", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { start_date, end_date } = req.query;

    if (!start_date && !end_date) {
      return res.status(400).json({ detail: "Date range required for insights" });
    }

    const query = { pharmacy_id: req.user.pharmacy_id };
    
    // Date filter
    query.billing_date = {};
    if (start_date) query.billing_date.$gte = start_date;
    if (end_date) query.billing_date.$lte = end_date;

    // 1. Core Summary Metrics
    const summaryResult = await db.collection("bills").aggregate([
      { $match: query },
      { 
        $group: { 
          _id: null, 
          total_revenue: { $sum: "$grand_total" },
          total_profit: { $sum: "$profit" },
          total_bills: { $sum: 1 },
          unpaid_bills: { 
            $sum: { $cond: [{ $eq: ["$is_paid", false] }, 1, 0] } 
          },
          unpaid_amount: { 
            $sum: { $cond: [{ $eq: ["$is_paid", false] }, "$grand_total", 0] } 
          }
        } 
      }
    ]).toArray();

    // 2. Top 10 Products by Revenue
    const topProductsResult = await db.collection("bills").aggregate([
      { $match: query },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product_name",
          total_profit: { $sum: "$items.profit" },
          total_revenue: { $sum: "$items.item_total" },
          total_quantity: { $sum: "$items.quantity" }
        }
      },
      { $sort: { total_revenue: -1 } },
      { $limit: 10 }
    ]).toArray();

    const summary = summaryResult.length > 0 ? summaryResult[0] : {
      total_revenue: 0,
      total_profit: 0,
      total_bills: 0,
      unpaid_bills: 0,
      unpaid_amount: 0
    };

    res.json({
      summary,
      top_products: topProductsResult.map(p => ({
        name: p._id,
        profit: p.total_profit,
        revenue: p.total_revenue,
        quantity: p.total_quantity
      }))
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/bills/doctors
router.get("/doctors", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, page = 1, limit = 20 } = req.query;
    const pharmacyId = req.user.pharmacy_id;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNum - 1) * limitNum;

    const trimmedSearch = (search || "").trim();
    const cacheKey = `docs:${pharmacyId}:${trimmedSearch.toLowerCase()}:${pageNum}:${limitNum}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const localQuery = { pharmacy_id: pharmacyId };
    if (trimmedSearch) {
      localQuery.name = { $regex: escapeRegex(trimmedSearch), $options: "i" };
    }

    const [localData, rawGlobal] = await Promise.all([
      (async () => {
        const [localCount, localDocs] = await Promise.all([
          db.collection("doctors").countDocuments(localQuery).catch(() => 0),
          db.collection("doctors")
            .find(localQuery, { projection: { _id: 0 } })
            .sort({ name: 1 })
            .skip(skip)
            .limit(limitNum)
            .toArray()
            .catch(() => [])
        ]);
        return {
          localCount,
          localDoctors: localDocs.map((d) => ({ ...d, source: "local" }))
        };
      })(),

      (async () => {
        try {
          const globalDocCol = await getGlobalDoctorsCollection();
          if (!globalDocCol) return [];
          if (trimmedSearch) {
            const escapedSearch = escapeRegex(trimmedSearch);
            const isMultiWord = trimmedSearch.includes(" ");
            let results = [];

            if (isMultiWord) {
              results = await globalDocCol
                .find({ $text: { $search: trimmedSearch } }, { score: { $meta: "textScore" } })
                .sort({ score: { $meta: "textScore" } })
                .limit(limitNum)
                .toArray()
                .catch(() => []);
            }

            if (results.length < limitNum) {
              const prefixMatches = await globalDocCol
                .find(
                  { full_name: { $regex: `^${escapedSearch}`, $options: "i" } }
                )
                .limit(limitNum - results.length)
                .toArray()
                .catch(() => []);

              const seenIds = new Set(results.map(r => String(r._id)));
              for (const pm of prefixMatches) {
                if (!seenIds.has(String(pm._id))) {
                  seenIds.add(String(pm._id));
                  results.push(pm);
                }
              }
            }

            if (results.length < limitNum) {
              const subMatches = await globalDocCol
                .find({
                  $or: [
                    { full_name: { $regex: escapedSearch, $options: "i" } },
                    { clinic_hospital: { $regex: escapedSearch, $options: "i" } },
                  ]
                })
                .limit(limitNum - results.length)
                .toArray()
                .catch(() => []);

              const seenIds = new Set(results.map(r => String(r._id)));
              for (const sm of subMatches) {
                if (!seenIds.has(String(sm._id))) {
                  seenIds.add(String(sm._id));
                  results.push(sm);
                }
              }
            }
            return results;
          } else {
            return await globalDocCol
              .find({})
              .sort({ practitioner_id: 1 })
              .skip(skip)
              .limit(limitNum)
              .toArray()
              .catch(() => []);
          }
        } catch (err) {
          console.warn("Global doctors search error:", err.message);
          return [];
        }
      })()
    ]);

    const { localCount, localDoctors } = localData;
    const seenNames = new Set(localDoctors.map((d) => (d.name || "").toLowerCase()));

    const globalDoctors = (rawGlobal || [])
      .filter((gd) => !seenNames.has((gd.full_name || gd.name || "").toLowerCase()))
      .map((gd) => ({
        id: gd.practitioner_code || (gd.practitioner_id ? `DOC-${gd.practitioner_id}` : (gd.id || String(gd._id))),
        global_id: gd.practitioner_code || (gd.practitioner_id ? `DOC-${gd.practitioner_id}` : (gd.id || String(gd._id))),
        name: gd.full_name || gd.name,
        full_name: gd.full_name || gd.name,
        license_number: gd.medical_registration_no || gd.license_number || "",
        registration_no: gd.medical_registration_no || gd.registration_no || "",
        clinic: gd.clinic_hospital || gd.clinic || "",
        locality: gd.locality || "",
        city: gd.city || "",
        state: gd.state || "",
        source: "global",
      }));

    const combinedDoctors = [...localDoctors, ...globalDoctors];
    const hasMore = combinedDoctors.length >= limitNum;
    const totalCount = localCount + (hasMore ? skip + limitNum + 10 : combinedDoctors.length);

    const responseData = {
      doctors: combinedDoctors,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limitNum) || 1,
        has_more: hasMore,
      },
    };

    if (combinedDoctors.length > 0) {
      setCached(cacheKey, responseData);
    }
    res.json(responseData);
  } catch (error) {
    next(error);
  }
});

// POST /api/bills/doctors/ensure-global
router.post("/doctors/ensure-global", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { name, license_number, registration_no, clinic, city, state } = req.body;
    const db = mongoose.connection.db;
    const pharmacyId = req.user.pharmacy_id;

    if (!name || !name.trim()) {
      return res.status(400).json({ detail: "Doctor name required" });
    }

    const cleanName = name.trim();
    let localDoc = await db.collection("doctors").findOne({
      pharmacy_id: pharmacyId,
      name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, "i") },
    });

    if (localDoc) {
      return res.json({ doctor: localDoc, existed: true });
    }

    const newDoc = {
      id: uuidv4(),
      pharmacy_id: pharmacyId,
      name: cleanName,
      license_number: license_number || registration_no || "",
      clinic: clinic || "",
      city: city || "",
      state: state || "",
      created_at: new Date().toISOString(),
    };
    await db.collection("doctors").insertOne(newDoc);
    res.status(201).json({ doctor: newDoc, existed: false });
  } catch (err) {
    next(err);
  }
});

// GET /api/bills/drafts - Fetch all draft bills for pharmacy
router.get("/drafts", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const drafts = await db
      .collection("bill_drafts")
      .find({ pharmacy_id: req.user.pharmacy_id })
      .sort({ created_at: -1 })
      .toArray();

    res.json({ drafts });
  } catch (error) {
    next(error);
  }
});

// POST /api/bills/drafts - Save a new draft bill
router.post("/drafts", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      customer_id,
      customer_name,
      customer_mobile,
      customer_email,
      doctor,
      billing_date,
      is_paid,
      payment_mode,
      items,
    } = req.body;

    const draftId = uuidv4();
    const draftNo = `DRAFT-${Date.now().toString().slice(-6)}`;

    const draftData = {
      id: draftId,
      draft_no: draftNo,
      pharmacy_id: req.user.pharmacy_id,
      customer_id: customer_id || null,
      customer_name: customer_name || "Walk-in Customer",
      customer_mobile: customer_mobile || "",
      customer_email: customer_email || "",
      doctor: doctor || "",
      billing_date: billing_date || new Date().toISOString().slice(0, 10),
      is_paid: is_paid !== undefined ? is_paid : true,
      payment_mode: payment_mode || "Cash",
      items: items || [],
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };

    await db.collection("bill_drafts").insertOne(draftData);

    const { _id, ...draft } = draftData;
    res.status(201).json({ message: "Draft bill created successfully", draft });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/bills/drafts/:draft_id - Delete a draft bill
router.delete("/drafts/:draft_id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { draft_id } = req.params;

    const query = {
      pharmacy_id: req.user.pharmacy_id,
      $or: [
        { id: draft_id },
        ...(mongoose.Types.ObjectId.isValid(draft_id)
          ? [{ _id: new mongoose.Types.ObjectId(draft_id) }]
          : []),
      ],
    };

    await db.collection("bill_drafts").deleteOne(query);
    res.json({ message: "Draft bill deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// POST /api/bills
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const {
      customer_id,
      customer_name,
      customer_mobile,
      customer_email,
      doctor,
      items,
      discount_percent = 0,
      notes,
      is_paid = true,
      due_date,
      billing_date,
      payment_mode,
      is_advance_paid = false,
      advance_amount = 0,
      draft_id,
    } = req.body;
    const db = mongoose.connection.db;

    // Validate payment mode against mandatory settings preference
    const userPrefs = await db.collection("user_settings").findOne({ user_id: req.user.id });
    const preferences = userPrefs?.preferences || {};
    const isModeMandatory = preferences.billing_payment_mode_mandatory === true;

    const isPaidFlag = is_paid === true || is_paid === 'true';
    const isAdvancePaidFlag = is_advance_paid === true || is_advance_paid === 'true';
    if (isModeMandatory && (isPaidFlag || isAdvancePaidFlag) && (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))) {
      return res.status(400).json({ detail: "Payment mode is mandatory" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ detail: "At least one item is required" });
    }

    const billId = uuidv4();
    const billNo = await uniqueBillNo(db, req.user.pharmacy_id);
    let subtotal = 0;
    let totalProfit = 0;
    const processedItems = [];

    for (const item of items) {
      const { quantity, unitPrice, discountPercent, purchasePrice, itemTotal, itemProfit } = lineAmounts(item);

      subtotal += itemTotal;
      totalProfit += itemProfit;

      // Units that actually came off the shelf; any extra is negative billing
      const stockDeducted = await takeFromStock(db, req.user.pharmacy_id, item.inventory_id, quantity);

      processedItems.push({
        inventory_id: item.inventory_id || null,
        product_name: item.product_name,
        batch_no: item.batch_no || null,
        hsn_no: item.hsn_no || null,
        expiry_date: item.expiry_date || null,
        quantity,
        units_per_pack: parseInt(item.units_per_pack) || null,
        unit_price: unitPrice,
        purchase_price: purchasePrice,
        discount_percent: discountPercent,
        line_discount: Math.round((quantity * unitPrice - itemTotal) * 100) / 100,
        item_total: itemTotal,
        profit: itemProfit,
        is_manual: !item.inventory_id, // Mark as manual if no inventory_id
        stock_deducted: stockDeducted,
        cgst: parseFloat(item.cgst) || 0,
        sgst: parseFloat(item.sgst) || 0,
        delivery_status: is_advance_paid ? "Pending" : "Delivered",
      });
    }

    const discountAmount = subtotal * (discount_percent / 100);
    const totalAmount = subtotal - discountAmount;
    totalProfit -= discountAmount;

    // 💰 Distribute bill-level discount to individual items proportionally for consistency
    if (discountAmount > 0 && subtotal > 0) {
      processedItems.forEach(item => {
        const itemProportion = item.item_total / subtotal;
        const itemDiscountShare = discountAmount * itemProportion;
        item.item_total -= itemDiscountShare;
        item.profit -= itemDiscountShare;
      });
    }

    // Handle customer
    let finalCustomerId = customer_id;
    if (!customer_id && customer_name) {
      const existingCustomer = await db.collection("customers").findOne({
        pharmacy_id: req.user.pharmacy_id,
        $or: [{ name: customer_name }, { mobile: customer_mobile }].filter(
          (c) => c.name || c.mobile
        ),
      });

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
      } else {
        finalCustomerId = uuidv4();
        await db.collection("customers").insertOne({
          id: finalCustomerId,
          pharmacy_id: req.user.pharmacy_id,
          name: customer_name,
          mobile: customer_mobile || null,
          email: customer_email || null,
          total_debt: 0,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Calculate final customer debt and advance increments
    let activeDebt = 0;
    let activeAdvance = 0;
    const totalPaid = is_paid ? totalAmount : (is_advance_paid ? (Number(advance_amount) || 0) : 0);

    if (is_advance_paid) {
      activeAdvance = totalPaid;
      activeDebt = 0;
    } else {
      activeDebt = is_paid ? 0 : totalAmount;
      activeAdvance = 0;
    }

    if (finalCustomerId) {
      await db
        .collection("customers")
        .updateOne(
          { id: finalCustomerId },
          { $inc: { total_debt: activeDebt, total_advance: activeAdvance } }
        );
    }

    // Calculate inventory vs negative billing stats
    const inventoryBilledQty = processedItems.reduce(
      (sum, item) => (item.is_manual ? sum : sum + item.quantity),
      0
    );
    const negativeBilledQty = processedItems
      .filter((item) => item.is_manual)
      .reduce((sum, item) => sum + item.quantity, 0);

    const billData = {
      id: billId,
      bill_no: billNo,
      pharmacy_id: req.user.pharmacy_id,
      customer_id: finalCustomerId || null,
      customer_name: customer_name || "Walk-in",
      customer_mobile: customer_mobile || null,
      customer_email: customer_email || null,
      billing_date: billing_date || new Date().toISOString().slice(0, 10),
      items: processedItems,
      subtotal,
      discount_percent,
      discount_amount: discountAmount,
      grand_total: totalAmount, // Use grand_total for consistency with existing data
      total_amount: totalAmount, // Keep for backward compatibility
      total_cost: processedItems.reduce(
        (sum, i) => sum + i.purchase_price * i.quantity,
        0
      ),
      profit: totalProfit,
      inventory_billed_qty: inventoryBilledQty,
      negative_billed_qty: negativeBilledQty,
      is_paid,
      is_advance_paid: is_advance_paid || false,
      advance_amount: is_advance_paid ? (Number(advance_amount) || 0) : 0,
      total_paid: totalPaid,
      payments: is_paid 
        ? [{ amount: totalAmount, payment_mode: payment_mode || "Cash", paid_at: new Date().toISOString() }]
        : (is_advance_paid && Number(advance_amount) > 0 
          ? [{ amount: Number(advance_amount), payment_mode: payment_mode || "Cash", paid_at: new Date().toISOString() }]
          : []),
      delivery_status: is_advance_paid ? "Pending" : "Delivered",
      due_date: due_date || null,
      payment_date: is_paid ? new Date().toISOString() : null,
      payment_mode: payment_mode || null,
      notes: notes || null,
      doctor: doctor || null,
      pdf_url: null,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };

    await db.collection("bills").insertOne(billData);

    // Upsert doctor to pharmacy list
    if (doctor && doctor.trim()) {
      const docName = doctor.trim();
      await db.collection("doctors").updateOne(
        { pharmacy_id: req.user.pharmacy_id, name: { $regex: new RegExp(`^${docName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } },
        {
          $setOnInsert: {
            id: uuidv4(),
            pharmacy_id: req.user.pharmacy_id,
            name: docName,
            created_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }

    // If created from a draft bill, cleanup draft record
    if (draft_id) {
      try {
        await db.collection("bill_drafts").deleteOne({
          pharmacy_id: req.user.pharmacy_id,
          $or: [
            { id: draft_id },
            ...(mongoose.Types.ObjectId.isValid(draft_id)
              ? [{ _id: new mongoose.Types.ObjectId(draft_id) }]
              : []),
          ],
        });
      } catch (e) {
        console.error("Failed to cleanup draft bill:", e);
      }
    }

    // Handle Optional Restock / Refill Reminder
    const reminderConfig = req.body.refill_reminder || req.body.restock_reminder;
    if (reminderConfig && (reminderConfig.enabled === true || reminderConfig.enabled === 'true')) {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const bDate = billing_date || todayStr;
        const daysSupply = Math.max(1, parseInt(reminderConfig.days_supply) || 30);
        const remindBeforeDays = parseInt(reminderConfig.remind_before_days) || 5;

        let targetDate = reminderConfig.refill_target_date;
        if (!targetDate) {
          const d = new Date(bDate);
          d.setDate(d.getDate() + daysSupply);
          targetDate = d.toISOString().slice(0, 10);
        }

        let reminderDate = reminderConfig.reminder_date;
        if (!reminderDate) {
          const d = new Date(targetDate);
          d.setDate(d.getDate() - remindBeforeDays);
          reminderDate = d.toISOString().slice(0, 10);
        }

        // Per medicine: units sold, dose per day (decimals, e.g. 0.5) and how many days that lasts
        const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) * 1000) / 1000 : null);
        const reminderItems = Array.isArray(reminderConfig.items) && reminderConfig.items.length > 0
          ? reminderConfig.items.slice(0, 100).map((i) => ({
              product_name: String(i.product_name || "").slice(0, 200),
              batch_no: i.batch_no || null,
              quantity: num(i.quantity),
              unit_price: num(i.unit_price),
              dose_per_day: num(i.dose_per_day),
              days_supply: parseInt(i.days_supply) || daysSupply,
              runs_out_on: /^\d{4}-\d{2}-\d{2}$/.test(i.runs_out_on || "") ? i.runs_out_on : null,
            }))
          : processedItems.map(i => ({
              product_name: i.product_name,
              batch_no: i.batch_no || null,
              quantity: i.quantity,
              unit_price: i.unit_price,
              days_supply: daysSupply,
            }));

        const reminderId = uuidv4();
        await db.collection("reminders").insertOne({
          id: reminderId,
          pharmacy_id: req.user.pharmacy_id,
          customer_id: finalCustomerId || null,
          customer_name: customer_name || "Customer",
          customer_mobile: customer_mobile || null,
          bill_id: billId,
          bill_no: billNo,
          items: reminderItems,
          billing_date: bDate,
          refill_target_date: targetDate,
          reminder_date: reminderDate,
          notes: reminderConfig.notes || `Refill reminder for Bill #${billNo}`,
          is_active: true,
          status: "PENDING",
          notified_at: null,
          completed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // If reminder date is already due today, process immediately
        if (reminderDate <= todayStr) {
          const { checkAndProcessDueReminders } = require("../services/notifications");
          await checkAndProcessDueReminders(db, req.user.pharmacy_id);
        }
      } catch (remErr) {
        console.error("Failed to create refill reminder from bill:", remErr);
      }
    }

    const { _id, ...bill } = billData;
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "BILLING", billId, `Created Bill ${billNo} for ₹${totalAmount}`, `/billing`);

    res.status(201).json({ message: "Bill created", id: billId, bill_no: billNo, bill });
  } catch (error) {
    next(error);
  }
});

// GET /api/bills/:bill_id
router.get("/:bill_id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const bill = await db
      .collection("bills")
      .findOne(
        { id: req.params.bill_id, pharmacy_id: req.user.pharmacy_id },
        { projection: { _id: 0 } }
      );

    if (!bill) {
      return res.status(404).json({ detail: "Bill not found" });
    }

    res.json(bill);
  } catch (error) {
    next(error);
  }
});

// PUT /api/bills/:bill_id
router.put("/:bill_id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const {
      customer_id,
      customer_name,
      customer_mobile,
      customer_email,
      doctor,
      items,
      discount_percent = 0,
      notes,
      is_paid,
      due_date,
      billing_date,
      payment_mode,
      is_advance_paid,
      advance_amount,
    } = req.body;

    const db = mongoose.connection.db;

    // Validate payment mode against mandatory settings preference
    const userPrefs = await db.collection("user_settings").findOne({ user_id: req.user.id });
    const preferences = userPrefs?.preferences || {};
    const isModeMandatory = preferences.billing_payment_mode_mandatory === true;

    const isPaidFlag = is_paid === true || is_paid === 'true';
    const isAdvancePaidFlag = is_advance_paid === true || is_advance_paid === 'true';
    if (isModeMandatory && (isPaidFlag || isAdvancePaidFlag) && (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))) {
      return res.status(400).json({ detail: "Payment mode is mandatory" });
    }

    const bill = await db.collection("bills").findOne({
      id: req.params.bill_id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (!bill) {
      return res.status(404).json({ detail: "Bill not found" });
    }

    /* ---------------- Reverse old inventory ---------------- */

    for (const oldItem of bill.items || []) {
      await returnToStock(db, req.user.pharmacy_id, oldItem);
    }

    /* ---------------- Process new items ---------------- */

    let subtotal = 0;
    let totalProfit = 0;
    const processedItems = [];

    for (const item of items) {
      const { quantity, unitPrice, discountPercent, purchasePrice, itemTotal, itemProfit } = lineAmounts(item);

      subtotal += itemTotal;
      totalProfit += itemProfit;

      const isAdvance = is_advance_paid !== undefined ? is_advance_paid : bill.is_advance_paid;
      let finalDeliveryStatus = "Delivered";
      if (isAdvance) {
        const matchingOld = bill.items?.find(o => o.product_name === item.product_name && o.batch_no === item.batch_no);
        finalDeliveryStatus = matchingOld ? (matchingOld.delivery_status || "Pending") : "Pending";
      }

      const stockDeducted = await takeFromStock(db, req.user.pharmacy_id, item.inventory_id, quantity);

      processedItems.push({
        inventory_id: item.inventory_id || null,
        product_name: item.product_name,
        batch_no: item.batch_no || null,
        hsn_no: item.hsn_no || null,
        expiry_date: item.expiry_date || null,
        quantity,
        units_per_pack: parseInt(item.units_per_pack) || null,
        unit_price: unitPrice,
        purchase_price: purchasePrice,
        discount_percent: discountPercent,
        line_discount: Math.round((quantity * unitPrice - itemTotal) * 100) / 100,
        item_total: itemTotal,
        profit: itemProfit,
        is_manual: !item.inventory_id,
        stock_deducted: stockDeducted,
        cgst: parseFloat(item.cgst) || 0,
        sgst: parseFloat(item.sgst) || 0,
        delivery_status: finalDeliveryStatus,
      });
    }

    /* ---------------- Calculate totals ---------------- */

    const discountAmount = subtotal * (discount_percent / 100);
    const totalAmount = subtotal - discountAmount;
    totalProfit -= discountAmount;

    // 💰 Distribute bill-level discount to individual items proportionally for consistency
    if (discountAmount > 0 && subtotal > 0) {
      processedItems.forEach(item => {
        const itemProportion = item.item_total / subtotal;
        const itemDiscountShare = discountAmount * itemProportion;
        item.item_total -= itemDiscountShare;
        item.profit -= itemDiscountShare;
      });
    }

    const totalCost = processedItems.reduce(
      (sum, i) => sum + i.purchase_price * i.quantity,
      0
    );

    const inventoryBilledQty = processedItems.reduce(
      (sum, item) => (item.is_manual ? sum : sum + item.quantity),
      0
    );

    const negativeBilledQty = processedItems
      .filter((item) => item.is_manual)
      .reduce((sum, item) => sum + item.quantity, 0);

    /* ---------------- Handle customer ---------------- */

    let finalCustomerId = customer_id;

    if (!customer_id && customer_name) {
      const existingCustomer = await db.collection("customers").findOne({
        pharmacy_id: req.user.pharmacy_id,
        $or: [{ name: customer_name }, { mobile: customer_mobile }].filter(
          (c) => c.name || c.mobile
        ),
      });

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
      } else {
        finalCustomerId = uuidv4();

        await db.collection("customers").insertOne({
          id: finalCustomerId,
          pharmacy_id: req.user.pharmacy_id,
          name: customer_name,
          mobile: customer_mobile || null,
          email: customer_email || null,
          total_debt: 0,
          created_at: new Date().toISOString(),
        });
      }
    }

    /* ---------------- Adjust customer debt and advance ---------------- */

    // Calculate old active values
    const oldPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? bill.total_amount : (bill.advance_amount || 0));
    let oldDeliveredValue = 0;
    if (bill.is_advance_paid) {
      oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
    } else {
      oldDeliveredValue = bill.total_amount;
    }
    const oldDebt = Math.max(0, oldDeliveredValue - oldPaid);
    const oldAdvance = Math.max(0, oldPaid - oldDeliveredValue);

    // Calculate new active values
    let finalIsPaid = is_paid !== undefined ? is_paid : bill.is_paid;
    const finalIsAdvancePaid = is_advance_paid !== undefined ? is_advance_paid : bill.is_advance_paid;
    const finalAdvanceAmount = is_advance_paid !== undefined ? (Number(advance_amount) || 0) : (bill.advance_amount || 0);

    // A credit bill that stays on credit keeps the part-payments already
    // recorded against it; editing items must not wipe them.
    const keepRecordedPayments = !finalIsPaid && !finalIsAdvancePaid && !bill.is_paid && !bill.is_advance_paid && (Number(bill.total_paid) || 0) > 0;
    const recordedPaid = keepRecordedPayments ? Number(bill.total_paid) || 0 : 0;
    if (keepRecordedPayments && recordedPaid >= totalAmount) finalIsPaid = true;

    const newPaid = keepRecordedPayments ? recordedPaid : finalIsPaid ? totalAmount : (finalIsAdvancePaid ? finalAdvanceAmount : 0);
    let newDeliveredValue = 0;
    if (finalIsAdvancePaid) {
      newDeliveredValue = processedItems.reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
    } else {
      newDeliveredValue = totalAmount;
    }
    const newDebt = Math.max(0, newDeliveredValue - newPaid);
    const newAdvance = Math.max(0, newPaid - newDeliveredValue);

    // Deltas
    const deltaDebt = newDebt - oldDebt;
    const deltaAdvance = newAdvance - oldAdvance;

    if (bill.customer_id && bill.customer_id !== finalCustomerId) {
      // Customer changed
      await db.collection("customers").updateOne(
        { id: bill.customer_id },
        { $inc: { total_debt: -oldDebt, total_advance: -oldAdvance } }
      );
      if (finalCustomerId) {
        await db.collection("customers").updateOne(
          { id: finalCustomerId },
          { $inc: { total_debt: newDebt, total_advance: newAdvance } }
        );
      }
    } else if (finalCustomerId) {
      await db.collection("customers").updateOne(
        { id: finalCustomerId },
        { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
      );
    }

    /* ---------------- Update bill ---------------- */

    let finalPayments = bill.payments || [];
    if (keepRecordedPayments) {
      // unchanged
    } else if (finalIsPaid) {
      finalPayments = [{ amount: totalAmount, payment_mode: payment_mode || bill.payment_mode || "Cash", paid_at: new Date().toISOString() }];
    } else if (finalIsAdvancePaid) {
      if (finalPayments.length === 0 && finalAdvanceAmount > 0) {
        finalPayments = [{ amount: finalAdvanceAmount, payment_mode: payment_mode || bill.payment_mode || "Cash", paid_at: new Date().toISOString() }];
      } else if (finalPayments.length > 0 && finalAdvanceAmount !== bill.advance_amount) {
        finalPayments[0] = { ...finalPayments[0], amount: finalAdvanceAmount };
      }
    } else {
      finalPayments = [];
    }

    // Short-book marks live on the stored lines; the edit form doesn't send them
    for (const item of processedItems) {
      const old = (bill.items || []).find((o) => o.short_book && o.product_name === item.product_name && (o.batch_no || null) === (item.batch_no || null));
      if (old) item.short_book = old.short_book;
    }

    const updates = {
      customer_id: finalCustomerId || null,
      customer_name: customer_name || "Walk-in",
      customer_mobile: customer_mobile || null,
      customer_email: customer_email || null,
      billing_date: billing_date || bill.billing_date,
      items: processedItems,
      subtotal,
      discount_percent,
      discount_amount: discountAmount,
      grand_total: totalAmount,
      total_amount: totalAmount,
      total_cost: totalCost,
      profit: totalProfit,
      inventory_billed_qty: inventoryBilledQty,
      negative_billed_qty: negativeBilledQty,
      is_paid: finalIsPaid,
      is_advance_paid: finalIsAdvancePaid,
      advance_amount: finalAdvanceAmount,
      total_paid: newPaid,
      payments: finalPayments,
      delivery_status: finalIsAdvancePaid 
        ? (processedItems.every(i => i.delivery_status === "Delivered") 
          ? "Delivered" 
          : (processedItems.some(i => i.delivery_status === "Delivered") ? "Partially Delivered" : "Pending"))
        : "Delivered",
      due_date: due_date || null,
      payment_date: finalIsPaid ? new Date().toISOString() : null,
      payment_mode: payment_mode || null,
      notes: notes || null,
      doctor: doctor || null,
      updated_at: new Date().toISOString(),
    };

    // Calculate Edit History Changes
    const changes = [];
    const compareField = (fieldName, label, formatter = (v) => v) => {
      const oldVal = bill[fieldName];
      const newVal = updates[fieldName];
      const normalizedOld = (oldVal === undefined || oldVal === null) ? "" : oldVal;
      const normalizedNew = (newVal === undefined || newVal === null) ? "" : newVal;
      if (normalizedOld !== normalizedNew) {
        changes.push({
          field: fieldName,
          old_value: formatter(oldVal),
          new_value: formatter(newVal),
          description: `Changed ${label} from "${formatter(oldVal) || "none"}" to "${formatter(newVal) || "none"}"`
        });
      }
    };

    compareField("customer_name", "Customer Name");
    compareField("customer_mobile", "Customer Mobile");
    compareField("doctor", "Doctor");
    compareField("discount_percent", "Discount %", (v) => v !== undefined && v !== null ? `${v}%` : "0%");
    compareField("grand_total", "Grand Total", (v) => v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00");
    compareField("is_paid", "Payment Status", (v) => v ? "Paid" : "Unpaid");
    compareField("is_advance_paid", "Is Advance Paid", (v) => v ? "Yes" : "No");
    compareField("advance_amount", "Advance Amount", (v) => v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00");
    compareField("payment_mode", "Payment Mode");
    compareField("due_date", "Due Date", (v) => v ? new Date(v).toLocaleDateString() : "");
    compareField("billing_date", "Billing Date", (v) => v ? new Date(v).toLocaleDateString() : "");

    // Items Comparison
    const oldItemsMap = {};
    const oldCounts = {};
    (bill.items || []).forEach(item => {
      const pId = item.inventory_id || item.product_name;
      oldCounts[pId] = (oldCounts[pId] || 0) + 1;
      const key = `${pId}_${oldCounts[pId]}`;
      oldItemsMap[key] = item;
    });

    const newItemsMap = {};
    const newCounts = {};
    processedItems.forEach(item => {
      const pId = item.inventory_id || item.product_name;
      newCounts[pId] = (newCounts[pId] || 0) + 1;
      const key = `${pId}_${newCounts[pId]}`;
      newItemsMap[key] = item;
    });

    const itemChanges = [];
    processedItems.forEach(item => {
      const pId = item.inventory_id || item.product_name;
      const count = newCounts[pId] || 0;
      const key = `${pId}_${count}`;
      const oldItem = oldItemsMap[key];
      if (!oldItem) {
        itemChanges.push(`Added item ${item.product_name} (Qty: ${item.quantity})`);
      } else {
        const changesList = [];
        
        const checkItemField = (oldField, newField, label, formatter = (v) => v) => {
          const oldVal = oldItem[oldField];
          const newVal = item[newField];
          const normalizedOld = (oldVal === undefined || oldVal === null) ? "" : String(oldVal).trim();
          const normalizedNew = (newVal === undefined || newVal === null) ? "" : String(newVal).trim();
          if (normalizedOld !== normalizedNew) {
            changesList.push(`${label}: ${formatter(oldVal) || "none"} -> ${formatter(newVal) || "none"}`);
          }
        };

        if (parseInt(oldItem.quantity) !== parseInt(item.quantity)) {
          changesList.push(`Qty: ${oldItem.quantity} -> ${item.quantity}`);
        }

        checkItemField("batch_no", "batch_no", "Batch");
        checkItemField("expiry_date", "expiry_date", "Expiry");
        checkItemField("cgst", "cgst", "CGST", (v) => `${v}%`);
        checkItemField("sgst", "sgst", "SGST", (v) => `${v}%`);
        checkItemField("discount_percent", "discount_percent", "Discount", (v) => `${v}%`);

        const oldPrice = oldItem.unit_price || 0;
        const newPrice = item.unit_price || 0;
        if (parseFloat(oldPrice).toFixed(2) !== parseFloat(newPrice).toFixed(2)) {
          changesList.push(`Rate: ₹${parseFloat(oldPrice).toFixed(2)} -> ₹${parseFloat(newPrice).toFixed(2)}`);
        }

        if (changesList.length > 0) {
          itemChanges.push(`Updated item ${item.product_name} (${changesList.join(", ")})`);
        }
      }
    });

    (bill.items || []).forEach(item => {
      const pId = item.inventory_id || item.product_name;
      const key = `${pId}_${oldCounts[pId] || 1}`;
      if (!newItemsMap[key]) {
        itemChanges.push(`Removed item ${item.product_name}`);
      }
    });

    if (itemChanges.length > 0) {
      changes.push({
        field: "items",
        description: itemChanges.join("; ")
      });
    }

    if (changes.length > 0) {
      const historyEntry = {
        updated_at: new Date().toISOString(),
        updated_by_id: req.user.id,
        updated_by_name: req.user.name,
        updated_by_avatar: req.user.image_url || null,
        changes: changes
      };
      updates.history = [...(bill.history || []), historyEntry];
    }

    await db
      .collection("bills")
      .updateOne({ id: req.params.bill_id }, { $set: updates });

    // Upsert doctor to pharmacy list
    if (doctor && doctor.trim()) {
      const docName = doctor.trim();
      await db.collection("doctors").updateOne(
        { pharmacy_id: req.user.pharmacy_id, name: { $regex: new RegExp(`^${docName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } },
        {
          $setOnInsert: {
            id: uuidv4(),
            pharmacy_id: req.user.pharmacy_id,
            name: docName,
            created_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }
      
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Updated Bill ${bill.bill_no}`, `/billing`);

    const updated = await db
      .collection("bills")
      .findOne({ id: req.params.bill_id }, { projection: { _id: 0 } });

    res.json({ message: "Bill updated", bill: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/bills/:bill_id
router.delete(
  "/:bill_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { restore_inventory } = req.query;
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      // Restore inventory if requested
      if (restore_inventory === "true") {
        for (const item of bill.items || []) {
          await returnToStock(db, req.user.pharmacy_id, item);
        }
      }

      // Update customer debt and advance
      if (bill.customer_id) {
        const totalPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? bill.total_amount : (bill.advance_amount || 0));
        let deliveredValue = 0;
        if (bill.is_advance_paid) {
          deliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
        } else {
          deliveredValue = bill.total_amount;
        }
        const activeDebt = Math.max(0, deliveredValue - totalPaid);
        const activeAdvance = Math.max(0, totalPaid - deliveredValue);

        await db
          .collection("customers")
          .updateOne(
            { id: bill.customer_id },
            { $inc: { total_debt: -activeDebt, total_advance: -activeAdvance } }
          );
      }

      await db.collection("bills").deleteOne({ id: req.params.bill_id });
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "DELETE", "BILLING", req.params.bill_id, `Deleted Bill ${bill.bill_no}`, `/billing`);
      res.json({
        message: "Bill deleted",
        inventory_restored: restore_inventory === "true",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/mark-paid
router.post(
  "/:bill_id/mark-paid",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      if (bill.is_paid) {
        return res.status(400).json({ detail: "Bill already paid" });
      }

      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const oldPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? grandTotal : (bill.advance_amount || 0));
      let oldDeliveredValue = 0;
      if (bill.is_advance_paid) {
        oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      } else {
        oldDeliveredValue = grandTotal;
      }
      const oldDebt = Math.max(0, oldDeliveredValue - oldPaid);
      const oldAdvance = Math.max(0, oldPaid - oldDeliveredValue);

      // Fully paid updates
      const newPaid = grandTotal;
      const newDebt = 0;
      const newAdvance = Math.max(0, newPaid - oldDeliveredValue);

      const deltaDebt = newDebt - oldDebt;
      const deltaAdvance = newAdvance - oldAdvance;

      if (bill.customer_id) {
        await db.collection("customers").updateOne(
          { id: bill.customer_id },
          { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
        );
      }

      await db
        .collection("bills")
        .updateOne(
          { id: req.params.bill_id },
          { $set: { is_paid: true, total_paid: newPaid, paid_at: new Date().toISOString() } }
        );
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Marked Bill ${bill.bill_no} as Paid`, `/billing`);

      res.json({ message: "Bill marked as paid" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/pdf
router.post(
  "/:bill_id/pdf",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      const pharmacyDoc = await db
        .collection("pharmacies")
        .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

      const pharmacy = pharmacyDoc ? {
        id: pharmacyDoc.id || null,
        name: pharmacyDoc.name || "",
        location: pharmacyDoc.location || "",
        license_no: pharmacyDoc.license_no || "",
        years_old: pharmacyDoc.years_old || null,
        logo_url: pharmacyDoc.logo_url || null,
        contact: pharmacyDoc.contact || "",
        pan: pharmacyDoc.pan || "",
        bank_name: pharmacyDoc.bank_name || "",
        bank_ifsc: pharmacyDoc.bank_ifsc || "",
        bank_acc_no: pharmacyDoc.bank_acc_no || "",
        bank_holder: pharmacyDoc.bank_holder || "",
        upi_id: pharmacyDoc.upi_id || "",
        gst_no: pharmacyDoc.gst_no || "",
        created_at: pharmacyDoc.created_at || null
      } : {
        id: null,
        name: "",
        location: "",
        license_no: "",
        years_old: null,
        logo_url: null,
        contact: "",
        pan: "",
        bank_name: "",
        bank_ifsc: "",
        bank_acc_no: "",
        bank_holder: "",
        upi_id: "",
        gst_no: ""
      };

      // Generate PDF (upi_qr: true/false = with/without the UPI payment QR)
      const upiQr = req.body?.upi_qr === undefined ? undefined : req.body.upi_qr === true || req.body.upi_qr === "true";
      if (upiQr && !String(pharmacyDoc?.upi_id || "").trim()) {
        return res.status(400).json({ detail: "Add your UPI ID in Settings to put a payment QR on bills", code: "NO_UPI_ID" });
      }
      const pdfBuffer = await generateBillPDF(bill, pharmacy, { upiQr });

      // Upload to R2
      const key = `bills/${req.user.pharmacy_id}/${bill.bill_no}.pdf`;
      const pdfUrl = await uploadToR2(key, pdfBuffer, "application/pdf");

      // Update bill with PDF URL
      await db
        .collection("bills")
        .updateOne({ id: req.params.bill_id }, { $set: { pdf_url: pdfUrl } });

      // With and without QR share one file name: make the browser fetch this one
      res.json({ pdf_url: `${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}v=${Date.now()}`, upi_qr: !!upiQr });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/share {phone?} - WhatsApp: expiring PDF link,
// ready message, and the wa.me link when the number is valid
router.post("/:bill_id/share", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const bill = await db.collection("bills").findOne({ id: req.params.bill_id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } });
    if (!bill) return res.status(404).json({ detail: "Bill not found" });
    const pharmacy = await db.collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, name: 1, upi_id: 1 } });

    const link = await billShare.getOrCreateLink(db, { bill, pharmacyId: req.user.pharmacy_id, userId: req.user.id });
    const url = `${billShare.publicBase(req)}/api/public/bill/${link.token}`;
    const message = billShare.buildMessage({ bill, pharmacy, url, expiresAt: link.expires_at });
    const raw = req.body?.phone !== undefined ? req.body.phone : bill.customer_mobile;
    const phone = billShare.normalizeMobile(raw);
    res.json({
      url,
      expires_at: link.expires_at,
      message,
      phone,
      phone_given: String(raw || "").trim(),
      wa_url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null,
    });
    logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "SHARE", "BILLING", bill.id, `Shared bill ${bill.bill_no}${phone ? ` with +${phone}` : ""}`, "/billing").catch(() => {});
  } catch (error) {
    next(error);
  }
});

// DELETE /api/bills/:bill_id/share - stop every shared link of this bill
router.delete("/:bill_id/share", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const bill = await db.collection("bills").findOne({ id: req.params.bill_id, pharmacy_id: req.user.pharmacy_id }, { projection: { id: 1 } });
    if (!bill) return res.status(404).json({ detail: "Bill not found" });
    res.json({ revoked: await billShare.revokeLinks(db, { billId: bill.id, pharmacyId: req.user.pharmacy_id }) });
  } catch (error) {
    next(error);
  }
});

// POST /api/bills/:bill_id/email
router.post(
  "/:bill_id/email",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      if (!bill.customer_email) {
        return res.status(400).json({ detail: "Customer email not available" });
      }

      let pdfUrl = bill.pdf_url;

      // Generate PDF if not exists
      if (!pdfUrl) {
        const pharmacyDoc = await db
          .collection("pharmacies")
          .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

        const pharmacy = pharmacyDoc ? {
          id: pharmacyDoc.id || null,
          name: pharmacyDoc.name || "",
          location: pharmacyDoc.location || "",
          license_no: pharmacyDoc.license_no || "",
          years_old: pharmacyDoc.years_old || null,
          logo_url: pharmacyDoc.logo_url || null,
          contact: pharmacyDoc.contact || "",
          pan: pharmacyDoc.pan || "",
          bank_name: pharmacyDoc.bank_name || "",
          bank_ifsc: pharmacyDoc.bank_ifsc || "",
          bank_acc_no: pharmacyDoc.bank_acc_no || "",
          bank_holder: pharmacyDoc.bank_holder || "",
          upi_id: pharmacyDoc.upi_id || "",
          gst_no: pharmacyDoc.gst_no || "",
          created_at: pharmacyDoc.created_at || null
        } : {
          id: null,
          name: "",
          location: "",
          license_no: "",
          years_old: null,
          logo_url: null,
          contact: "",
          pan: "",
          bank_name: "",
          bank_ifsc: "",
          bank_acc_no: "",
          bank_holder: "",
          upi_id: "",
          gst_no: ""
        };

        const pdfBuffer = await generateBillPDF(bill, pharmacy);
        const key = `bills/${req.user.pharmacy_id}/${bill.bill_no}.pdf`;
        pdfUrl = await uploadToR2(key, pdfBuffer, "application/pdf");

        await db
          .collection("bills")
          .updateOne({ id: req.params.bill_id }, { $set: { pdf_url: pdfUrl } });
      }

      // Send email
      const sent = await sendBillEmail(
        bill.customer_email,
        bill.customer_name,
        bill.bill_no,
        pdfUrl,
        bill.total_amount,
        { pharmacyName: pharmacyDoc?.name || "Pharmacy Store" }
      );

      if (!sent) {
        return res.status(500).json({ detail: "Failed to send email" });
      }

      res.json({ message: "Email sent successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/record-payment
router.post(
  "/:bill_id/record-payment",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { amount, payment_mode } = req.body;

      const paymentAmount = Number(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ detail: "Invalid payment amount" });
      }

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const currentPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? grandTotal : (bill.advance_amount || 0));
      const remainingUnpaid = Math.max(0, grandTotal - currentPaid);

      if (paymentAmount > remainingUnpaid) {
        return res.status(400).json({ detail: `Payment amount ₹${paymentAmount} exceeds remaining unpaid balance of ₹${remainingUnpaid}` });
      }

      // Calculate old debt/advance
      let oldDeliveredValue = 0;
      if (bill.is_advance_paid) {
        oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      } else {
        oldDeliveredValue = grandTotal;
      }
      const oldDebt = Math.max(0, oldDeliveredValue - currentPaid);
      const oldAdvance = Math.max(0, currentPaid - oldDeliveredValue);

      // New paid amount
      const newPaid = currentPaid + paymentAmount;
      const isPaid = newPaid >= grandTotal;

      // New debt/advance
      const newDebt = Math.max(0, oldDeliveredValue - newPaid);
      const newAdvance = Math.max(0, newPaid - oldDeliveredValue);

      const deltaDebt = newDebt - oldDebt;
      const deltaAdvance = newAdvance - oldAdvance;

      if (bill.customer_id) {
        await db.collection("customers").updateOne(
          { id: bill.customer_id },
          { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
        );
      }

      let paymentsList = bill.payments || [];
      if (paymentsList.length === 0 && currentPaid > 0) {
        paymentsList = [
          {
            amount: currentPaid,
            payment_mode: bill.payment_mode || "Cash",
            paid_at: bill.created_at || bill.billing_date || new Date().toISOString()
          }
        ];
      }
      paymentsList.push({
        amount: paymentAmount,
        payment_mode: payment_mode || "Cash",
        paid_at: new Date().toISOString()
      });

      await db.collection("bills").updateOne(
        { id: req.params.bill_id },
        { 
          $set: { 
            total_paid: newPaid,
            is_paid: isPaid,
            payment_date: new Date().toISOString(),
            payment_mode: payment_mode || bill.payment_mode,
            payments: paymentsList
          } 
        }
      );

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Recorded payment of ₹${paymentAmount} for Bill ${bill.bill_no}`, `/billing`);

      res.json({ message: "Payment recorded successfully", total_paid: newPaid, is_paid: isPaid });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/update-delivery
router.post(
  "/:bill_id/update-delivery",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { items_delivery } = req.body; // Array of { item_index: number, delivery_status: "Pending" | "Delivered" }

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const currentPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? grandTotal : (bill.advance_amount || 0));

      // Calculate old stats
      let oldDeliveredValue = 0;
      if (bill.is_advance_paid) {
        oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      } else {
        oldDeliveredValue = grandTotal;
      }
      const oldDebt = Math.max(0, oldDeliveredValue - currentPaid);
      const oldAdvance = Math.max(0, currentPaid - oldDeliveredValue);

      // Update bill items
      const updatedItems = [...bill.items];
      items_delivery.forEach(({ item_index, delivery_status }) => {
        if (updatedItems[item_index]) {
          updatedItems[item_index].delivery_status = delivery_status;
          if (delivery_status === "Delivered") {
            updatedItems[item_index].delivered_at = new Date().toISOString();
          } else {
            delete updatedItems[item_index].delivered_at;
          }
        }
      });

      // Calculate new stats
      const newDeliveredValue = updatedItems.reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      const newDebt = Math.max(0, newDeliveredValue - currentPaid);
      const newAdvance = Math.max(0, currentPaid - newDeliveredValue);

      const deltaDebt = newDebt - oldDebt;
      const deltaAdvance = newAdvance - oldAdvance;

      if (bill.customer_id) {
        await db.collection("customers").updateOne(
          { id: bill.customer_id },
          { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
        );
      }

      const allDelivered = updatedItems.every(i => i.delivery_status === "Delivered");
      const someDelivered = updatedItems.some(i => i.delivery_status === "Delivered");
      const overallDeliveryStatus = allDelivered ? "Delivered" : (someDelivered ? "Partially Delivered" : "Pending");

      await db.collection("bills").updateOne(
        { id: req.params.bill_id },
        { 
          $set: { 
            items: updatedItems,
            delivery_status: overallDeliveryStatus
          } 
        }
      );

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Updated delivery status of Bill ${bill.bill_no} to ${overallDeliveryStatus}`, `/billing`);

      res.json({ message: "Delivery status updated successfully", delivery_status: overallDeliveryStatus });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/match-inventory - Smart batch-first inventory matching for billing
// POST /api/bills/match-inventory - map scanned lines to stock (batch first, then name)
router.post("/match-inventory", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ success: true, matches: [] });
    }
    const db = mongoose.connection.db;
    const matches = await Promise.all(
      items.slice(0, 100).map(async (item) => {
        const scanned = {
          product_name: String(item?.product_name || item?.name || "").trim(),
          batch_no: String(item?.batch_no || item?.batch || "").trim(),
        };
        const m = await matchForBilling(db, req.user.pharmacy_id, scanned);
        const hit = m.match_type !== "negative_billing" ? m.matched_item : null;
        return {
          scanned_name: scanned.product_name,
          scanned_batch: scanned.batch_no,
          match_type: m.match_type,
          confidence: m.confidence,
          batch_match: hit && m.match_type.startsWith("batch") ? { ...hit, type: m.match_type } : null,
          exact_name_match: hit && m.match_type === "name_matched" ? { ...hit, type: "name_exact" } : null,
          matched_item: m.matched_item,
          suggestions: [
            ...(hit ? [{ ...hit, score: m.confidence, is_batch_match: m.match_type.startsWith("batch"), is_high_confidence: true }] : []),
            ...m.alternatives.map((a) => ({ ...a, score: 50, is_high_confidence: false })),
          ],
        };
      })
    );
    res.json({ success: true, matches });
  } catch (error) {
    next(error);
  }
});

// POST /api/bills/scan-product - read a pack photo and map it to stock
router.post("/scan-product", auth, requireSubscription(), acceptImages(6), scanForBilling);

module.exports = router;
