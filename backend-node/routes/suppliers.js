const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { queueGlobalCheck } = require("../services/globalReview");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { logActivity } = require("../utils/activityLogger");

const { requireSubscription } = require("../middleware/subscription");
const { catalogLimiter, GLOBAL_PAGE_SIZE, GLOBAL_MAX_PAGES, MIN_GLOBAL_QUERY } = require("../middleware/security");
const {
  getGlobalDistributorsCollection,
  getCached,
  setCached,
  clearCachePattern,
} = require("../utils/globalDb");

const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET /api/suppliers
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, page = 1, limit = 50, highlight_id, include_global } = req.query;
    const pharmacyId = req.user.pharmacy_id;

    let pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 500);
    let skip = (pageNum - 1) * limitNum;
    const trimmedSearch = String(search || "").trim();
    // Global distributors only for a real search, a few small pages deep
    const shouldIncludeGlobal =
      (include_global === "true" || include_global === "1") &&
      trimmedSearch.length >= MIN_GLOBAL_QUERY &&
      pageNum <= GLOBAL_MAX_PAGES;
    const cacheKey = `sups:${pharmacyId}:${trimmedSearch.toLowerCase()}:${pageNum}:${limitNum}:${shouldIncludeGlobal}`;
    if (shouldIncludeGlobal) {
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);
    }

    const query = { pharmacy_id: pharmacyId };
    if (trimmedSearch) {
      const escapedSearch = escapeRegex(trimmedSearch);
      query.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { contact: { $regex: escapedSearch, $options: "i" } },
        { phone: { $regex: escapedSearch, $options: "i" } },
        { gstin: { $regex: escapedSearch, $options: "i" } },
        { gst_no: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    if (highlight_id && !shouldIncludeGlobal) {
      const allSups = await db
        .collection("suppliers")
        .find(query)
        .project({ id: 1 })
        .toArray();
      const targetIndex = allSups.findIndex((s) => s.id === highlight_id);
      if (targetIndex !== -1) {
        pageNum = Math.floor(targetIndex / limitNum) + 1;
        skip = (pageNum - 1) * limitNum;
      }
    }

    const localCount = await db.collection("suppliers").countDocuments(query);

    let localSuppliers = [];
    if (skip < localCount) {
      localSuppliers = await db
        .collection("suppliers")
        .find(query, { projection: { _id: 0 } })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray();
    }

    // Augment local suppliers with total owed
    if (localSuppliers.length > 0) {
      const supplierIds = localSuppliers.map((s) => s.id);
      const purchases = await db
        .collection("purchases")
        .find({ supplier_id: { $in: supplierIds }, payment_status: { $ne: "Paid" } })
        .project({ _id: 0, supplier_id: 1, total_amount: 1, amount_paid: 1, payment_status: 1 })
        .toArray();

      const owedBySupplier = {};
      purchases.forEach((p) => {
        const remaining = (p.total_amount || 0) - (p.amount_paid || 0);
        if (remaining > 0) {
          owedBySupplier[p.supplier_id] = (owedBySupplier[p.supplier_id] || 0) + remaining;
        }
      });

      localSuppliers = localSuppliers.map((s) => ({
        ...s,
        source: "local",
        is_local: true,
        badge: "Your Supplier",
        total_amount_owed: owedBySupplier[s.id] || 0,
      }));
    } else {
      localSuppliers = localSuppliers.map((s) => ({
        ...s,
        source: "local",
        is_local: true,
        badge: "Your Supplier",
        total_amount_owed: 0,
      }));
    }

    let globalSuppliers = [];
    let globalCount = 0;

    if (shouldIncludeGlobal) {
      try {
        const globalDistCol = await getGlobalDistributorsCollection();
        if (globalDistCol) {
          // Pre-fetch all local suppliers for this pharmacy to accurately cross-reference and badge
          const allLocalSups = await db
            .collection("suppliers")
            .find({ pharmacy_id: pharmacyId }, { projection: { id: 1, name: 1, gst_no: 1, gstin: 1, global_code: 1 } })
            .toArray();

          const localCodeMap = new Map();
          const localGstMap = new Map();
          const localNameMap = new Map();

          for (const ls of allLocalSups) {
            if (ls.global_code) localCodeMap.set(String(ls.global_code).trim().toLowerCase(), ls);
            if (ls.id) localCodeMap.set(String(ls.id).trim().toLowerCase(), ls);
            const gst = (ls.gst_no || ls.gstin || "").trim().toUpperCase();
            if (gst) localGstMap.set(gst, ls);
            const nm = (ls.name || "").trim().toLowerCase();
            if (nm) localNameMap.set(nm, ls);
          }

          const slotsNeeded = Math.min(limitNum - localSuppliers.length, GLOBAL_PAGE_SIZE);
          const globalSkip = Math.max(0, skip - localCount);

          if (trimmedSearch) {
            const escapedSearch = escapeRegex(trimmedSearch);
            const isMultiWord = trimmedSearch.includes(" ");

            if (slotsNeeded > 0) {
              let rawGlobal = [];

              if (isMultiWord) {
                try {
                  rawGlobal = await globalDistCol
                    .find(
                      { $text: { $search: trimmedSearch } },
                      { score: { $meta: "textScore" } }
                    )
                    .sort({ score: { $meta: "textScore" } })
                    .limit(slotsNeeded)
                    .toArray();
                } catch (e) {}
              }

              if (rawGlobal.length < slotsNeeded) {
                try {
                  const seenIds = new Set(rawGlobal.map((r) => String(r._id)));
                  const prefixMatches = await globalDistCol
                    .find(
                      { agency_name: { $regex: `^${escapedSearch}`, $options: "i" } }
                    )
                    .limit(slotsNeeded - rawGlobal.length)
                    .toArray();
                  for (const pm of prefixMatches) {
                    if (!seenIds.has(String(pm._id))) {
                      seenIds.add(String(pm._id));
                      rawGlobal.push(pm);
                    }
                  }
                } catch (e) {}
              }

              if (rawGlobal.length < slotsNeeded) {
                try {
                  const seenIds = new Set(rawGlobal.map((r) => String(r._id)));
                  const subMatches = await globalDistCol
                    .find({
                      $or: [
                        { agency_name: { $regex: escapedSearch, $options: "i" } },
                        { gst_number: { $regex: escapedSearch, $options: "i" } },
                        { city: { $regex: escapedSearch, $options: "i" } },
                      ],
                      _id: { $nin: Array.from(seenIds).map((id) => new mongoose.Types.ObjectId(id)) },
                    })
                    .limit(slotsNeeded - rawGlobal.length)
                    .toArray();
                  rawGlobal.push(...subMatches);
                } catch (e) {}
              }

              globalSuppliers = rawGlobal;
            }

            const hasMoreGlobal = globalSuppliers.length >= slotsNeeded;
            globalCount = hasMoreGlobal ? globalSkip + slotsNeeded + 10 : globalSuppliers.length;
          }

          // Map global distributors to supplier contract with accurate badging
          globalSuppliers = globalSuppliers.map((gd) => {
            const loc = [gd.locality, gd.city, gd.state].filter(Boolean).join(", ");
            const code = (gd.supplier_code || `DST-${gd.supplier_id}`).trim().toLowerCase();
            const gst = (gd.gst_number || "").trim().toUpperCase();
            const nm = (gd.agency_name || "").trim().toLowerCase();

            const matchedLocal = localCodeMap.get(code) || (gst && localGstMap.get(gst)) || (nm && localNameMap.get(nm));

            if (matchedLocal) {
              return {
                id: matchedLocal.id,
                global_id: gd.supplier_code || `DST-${gd.supplier_id}`,
                name: matchedLocal.name || gd.agency_name,
                contact: gd.contact_number || "",
                phone: gd.contact_number || "",
                gstin: gd.gst_number || "",
                gst_no: gd.gst_number || "",
                pan_number: gd.pan_number || "",
                locality: gd.locality || "",
                city: gd.city || "",
                state: gd.state || "",
                address: loc,
                source: "local",
                is_local: true,
                badge: "Your Supplier",
                total_amount_owed: 0,
              };
            }

            return {
              id: gd.supplier_code || `DST-${gd.supplier_id}`,
              global_id: gd.supplier_code || `DST-${gd.supplier_id}`,
              name: gd.agency_name,
              contact: gd.contact_number || "",
              phone: gd.contact_number || "",
              gstin: gd.gst_number || "",
              gst_no: gd.gst_number || "",
              pan_number: gd.pan_number || "",
              locality: gd.locality || "",
              city: gd.city || "",
              state: gd.state || "",
              address: loc,
              source: "global",
              is_local: false,
              badge: "Global Distributor",
              total_amount_owed: 0,
            };
          });
        }
      } catch (err) {
        console.warn("Global distributors fetch error:", err.message);
      }
    }

    // Deduplicate so local records and global records don't produce duplicate items
    const seenSupplierKeys = new Set();
    const combinedSuppliers = [];
    for (const s of [...localSuppliers, ...globalSuppliers]) {
      const key = s.is_local ? `local_${s.id}` : `global_${s.global_id || s.id}`;
      if (!seenSupplierKeys.has(key)) {
        seenSupplierKeys.add(key);
        combinedSuppliers.push(s);
      }
    }

    const totalCount = localCount + globalCount;

    const responseData = {
      suppliers: combinedSuppliers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limitNum) || 1,
        has_more: skip + limitNum < totalCount,
      },
    };

    if (shouldIncludeGlobal && combinedSuppliers.length > 0) {
      setCached(cacheKey, responseData);
    }

    res.json(responseData);
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers/ensure-global
// Seamlessly syncs / links a selected global distributor into the pharmacy's local suppliers
router.post("/ensure-global", auth, requireSubscription(), catalogLimiter, async (req, res, next) => {
  try {
    const { global_id, name, phone, contact, gstin, gst_no, address, city, state } = req.body;
    const db = mongoose.connection.db;
    const pharmacyId = req.user.pharmacy_id;

    if (!name || !name.trim()) {
      return res.status(400).json({ detail: "Supplier name is required" });
    }

    const trimmedName = name.trim();
    const cleanGst = (gstin || gst_no || "").trim();

    // 1. Check if already exists in local suppliers (by global_code, GSTIN, or Name)
    let localSupplier = null;
    if (global_id) {
      localSupplier = await db.collection("suppliers").findOne({
        pharmacy_id: pharmacyId,
        global_code: global_id,
      });
    }
    if (!localSupplier && cleanGst) {
      localSupplier = await db.collection("suppliers").findOne({
        pharmacy_id: pharmacyId,
        $or: [{ gst_no: cleanGst }, { gstin: cleanGst }],
      });
    }
    if (!localSupplier) {
      localSupplier = await db.collection("suppliers").findOne({
        pharmacy_id: pharmacyId,
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
      });
    }

    if (localSupplier) {
      const { _id, ...sup } = localSupplier;
      return res.json({ supplier: sup, existed: true });
    }

    // 2. Insert new local supplier record linked to global distributor
    const supplierId = uuidv4();
    const newSupplier = {
      id: supplierId,
      pharmacy_id: pharmacyId,
      name: trimmedName,
      contact: (phone || contact || "").trim() || null,
      phone: (phone || contact || "").trim() || null,
      email: null,
      address: address || [city, state].filter(Boolean).join(", ") || null,
      city: city || null,
      state: state || null,
      gst_no: cleanGst || null,
      gstin: cleanGst || null,
      global_code: global_id || null,
      created_at: new Date().toISOString(),
    };

    await db.collection("suppliers").insertOne(newSupplier);
    if (!global_id) queueGlobalCheck("distributor", pharmacyId, newSupplier);
    await logActivity(
      db,
      pharmacyId,
      req.user.id,
      req.user.name,
      "CREATE",
      "SUPPLIERS",
      supplierId,
      `Linked Global Distributor ${newSupplier.name}`,
      `/suppliers`
    );

    clearCachePattern(`sups:${pharmacyId}`);

    res.status(201).json({ supplier: newSupplier, existed: false });
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { name, contact, email, address, gst_no, notes } = req.body;
    const db = mongoose.connection.db;

    const supplierId = uuidv4();
    const supplierData = {
      id: supplierId,
      pharmacy_id: req.user.pharmacy_id,
      name,
      contact: contact || null,
      email: email || null,
      address: address || null,
      gst_no: gst_no || null,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    await db.collection("suppliers").insertOne(supplierData);
    queueGlobalCheck("distributor", req.user.pharmacy_id, supplierData);
    const { _id, ...supplier } = supplierData;
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "SUPPLIERS", supplierId, `Added Supplier ${name}`, `/suppliers`);

    clearCachePattern(`sups:${req.user.pharmacy_id}`);

    res.status(201).json({ message: "Supplier created", supplier });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:supplier_id
router.get(
  "/:supplier_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const supplier = await db
        .collection("suppliers")
        .findOne(
          { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
          { projection: { _id: 0 } }
        );

      if (!supplier) {
        return res.status(404).json({ detail: "Supplier not found" });
      }

      // Get purchases from this supplier
      const purchases = await db
        .collection("purchases")
        .find({ supplier_id: req.params.supplier_id })
        .sort({ created_at: -1 })
        .project({ _id: 0 })
        .toArray();

      // Calculate total amount owed
      let totalAmountOwed = 0;
      purchases.forEach((p) => {
        const total = p.total_amount || 0;
        const paid = p.amount_paid || 0;
        if (p.payment_status !== "Paid" && total > paid) {
          totalAmountOwed += (total - paid);
        }
      });

      res.json({ supplier, purchases, total_amount_owed: totalAmountOwed });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/suppliers/:supplier_id
router.put(
  "/:supplier_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { name, contact, email, address, gst_no, notes } = req.body;
      const db = mongoose.connection.db;

      const result = await db
        .collection("suppliers")
        .updateOne(
          { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
          { $set: { name, contact, email, address, gst_no, notes } }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({ detail: "Supplier not found" });
      }
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "SUPPLIERS", req.params.supplier_id, `Updated Supplier ${name}`, `/suppliers`);

      clearCachePattern(`sups:${req.user.pharmacy_id}`);

      const supplier = await db
        .collection("suppliers")
        .findOne({ id: req.params.supplier_id }, { projection: { _id: 0 } });

      res.json({ message: "Supplier updated", supplier });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/suppliers/:supplier_id
router.delete(
  "/:supplier_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const result = await db.collection("suppliers").deleteOne({
        id: req.params.supplier_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ detail: "Supplier not found" });
      }
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "DELETE", "SUPPLIERS", req.params.supplier_id, `Deleted Supplier`, `/suppliers`);

      clearCachePattern(`sups:${req.user.pharmacy_id}`);

      res.json({ message: "Supplier deleted" });
    } catch (error) {
      next(error);
    }
  }
);
// POST /api/suppliers/:supplier_id/pay-all
router.post(
  "/:supplier_id/pay-all",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const purchases = await db.collection("purchases").find({
        supplier_id: req.params.supplier_id,
        pharmacy_id: req.user.pharmacy_id,
        payment_status: { $ne: "Paid" }
      }).toArray();

      if (purchases.length === 0) {
        return res.status(400).json({ detail: "No outstanding balances to pay" });
      }

      const timestamp = new Date().toISOString();
      let totalPaid = 0;

      for (const purchase of purchases) {
        const remaining = (purchase.total_amount || 0) - (purchase.amount_paid || 0);
        if (remaining > 0) {
          totalPaid += remaining;
          await db.collection("purchases").updateOne(
            { id: purchase.id },
            { 
              $set: { 
                payment_status: "Paid",
                amount_paid: purchase.total_amount,
                updated_at: timestamp
              },
              $push: {
                payments: {
                  amount: remaining,
                  date: timestamp,
                  notes: "Bulk Cleared via Supplier Dues",
                  recorded_by: req.user.id
                }
              }
            }
          );
        }
      }

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "PAYMENT", "SUPPLIERS", req.params.supplier_id, `Cleared all outstanding dues (₹${totalPaid.toFixed(2)})`, `/suppliers`);

      res.json({ message: "All outstanding dues cleared successfully", total_paid: totalPaid });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/suppliers/:supplier_id/pay-part
router.post(
  "/:supplier_id/pay-part",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { amount, notes } = req.body;
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ detail: "Amount must be greater than 0" });
      }

      let remainingAmount = parseFloat(amount);
      const timestamp = new Date().toISOString();

      // Fetch unpaid purchases sorted by oldest first (FIFO)
      const purchases = await db.collection("purchases")
        .find({
          supplier_id: req.params.supplier_id,
          pharmacy_id: pharmacyId,
          payment_status: { $ne: "Paid" }
        })
        .sort({ created_at: 1 }) // Oldest first
        .toArray();

      if (purchases.length === 0) {
        return res.status(400).json({ detail: "No outstanding balances to pay" });
      }

      let totalApplied = 0;
      const updatedPurchases = [];

      for (const purchase of purchases) {
        if (remainingAmount <= 0) break;

        const purchaseTotal = purchase.total_amount || 0;
        const purchasePaid = purchase.amount_paid || 0;
        const purchaseDue = Math.max(0, purchaseTotal - purchasePaid);

        if (purchaseDue <= 0) continue;

        const paymentToApply = Math.min(remainingAmount, purchaseDue);
        const newPaidAmount = purchasePaid + paymentToApply;
        const newStatus = newPaidAmount >= purchaseTotal ? "Paid" : "Partial";

        await db.collection("purchases").updateOne(
          { id: purchase.id },
          {
            $set: {
              amount_paid: parseFloat(newPaidAmount.toFixed(2)),
              payment_status: newStatus,
              updated_at: timestamp
            },
            $push: {
              payments: {
                id: uuidv4(),
                amount: parseFloat(paymentToApply.toFixed(2)),
                date: timestamp,
                notes: notes || "Partial Payment (Supplier Level)",
                recorded_by: req.user.id
              }
            }
          }
        );

        totalApplied += paymentToApply;
        remainingAmount -= paymentToApply;
        updatedPurchases.push(purchase.id);
      }

      await logActivity(
        db, 
        pharmacyId, 
        req.user.id, 
        req.user.name, 
        "PAYMENT", 
        "SUPPLIERS", 
        req.params.supplier_id, 
        `Paid ₹${totalApplied.toFixed(2)} towards outstanding dues across ${updatedPurchases.length} purchases`, 
        `/suppliers`
      );

      res.json({ 
        message: "Payment processed successfully", 
        total_applied: totalApplied, 
        remaining_payment_unused: remainingAmount,
        purchases_updated: updatedPurchases.length 
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/suppliers/merge-preview
router.post("/merge-preview", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { supplier_ids } = req.body;
    if (!supplier_ids || !Array.isArray(supplier_ids)) {
      return res.status(400).json({ detail: "supplier_ids must be an array" });
    }

    const db = mongoose.connection.db;
    
    const preview = [];
    let totalPurchases = 0;
    
    for (const id of supplier_ids) {
      const supplier = await db.collection("suppliers").findOne({ id, pharmacy_id: req.user.pharmacy_id });
      if (!supplier) continue;

      const purchasesCount = await db.collection("purchases").countDocuments({ supplier_id: id, pharmacy_id: req.user.pharmacy_id });
      
      preview.push({
        id,
        name: supplier.name,
        purchases: purchasesCount
      });
      totalPurchases += purchasesCount;
    }
    
    res.json({ preview, totalPurchases });
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers/merge
router.post("/merge", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { supplier_ids, new_name } = req.body;
    if (!supplier_ids || !Array.isArray(supplier_ids) || supplier_ids.length < 2) {
      return res.status(400).json({ detail: "Must select at least 2 suppliers to merge" });
    }
    if (!new_name || new_name.trim() === "") {
      return res.status(400).json({ detail: "New supplier name is required" });
    }

    const db = mongoose.connection.db;

    const originalSuppliers = await db.collection("suppliers").find({
      id: { $in: supplier_ids },
      pharmacy_id: req.user.pharmacy_id
    }).toArray();

    if (originalSuppliers.length === 0) {
       return res.status(400).json({ detail: "No valid suppliers found to merge" });
    }

    const baseSupplier = originalSuppliers[0];
    const newId = uuidv4();

    const timestamp = new Date().toISOString();
    const merge_history = [];
    
    for (const s of originalSuppliers) {
      // Also fetch total purchases to keep static log on the history object
      const purchasesCount = await db.collection("purchases").countDocuments({ supplier_id: s.id, pharmacy_id: req.user.pharmacy_id });
      merge_history.push({
          id: s.id,
          name: s.name,
          purchases: purchasesCount,
          merged_at: timestamp
      });
    }

    const newSupplier = {
      id: newId,
      pharmacy_id: req.user.pharmacy_id,
      name: new_name.trim(),
      contact: baseSupplier.contact || null,
      email: baseSupplier.email || null,
      address: baseSupplier.address || null,
      gst_no: baseSupplier.gst_no || null,
      notes: "Merged Supplier",
      merge_history,
      created_at: timestamp
    };

    await db.collection("suppliers").insertOne(newSupplier);

    // Update relational DB links
    await db.collection("purchases").updateMany(
      { supplier_id: { $in: supplier_ids }, pharmacy_id: req.user.pharmacy_id },
      { $set: { supplier_id: newId, supplier_name: new_name.trim() } }
    );

    await db.collection("inventory").updateMany(
      { supplier_id: { $in: supplier_ids }, pharmacy_id: req.user.pharmacy_id },
      { $set: { supplier_id: newId, supplier_name: new_name.trim() } }
    );

    await db.collection("medicines").updateMany(
      { supplier_id: { $in: supplier_ids }, pharmacy_id: req.user.pharmacy_id },
      { $set: { supplier_id: newId, supplier_name: new_name.trim() } }
    );

    await db.collection("suppliers").deleteMany({
      id: { $in: supplier_ids },
      pharmacy_id: req.user.pharmacy_id
    });

    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "MERGE", "SUPPLIERS", newId, `Merged ${originalSuppliers.length} suppliers into '${new_name}'`, `/suppliers`);

    res.json({ message: "Suppliers merged successfully", supplier: newSupplier });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:supplier_id/csv-template - Fetch saved CSV template for supplier
router.get(
  "/:supplier_id/csv-template",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const supplier = await db.collection("suppliers").findOne(
        { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
        { projection: { _id: 0, id: 1, name: 1, csv_template: 1 } }
      );

      if (!supplier) {
        return res.status(404).json({ detail: "Supplier not found" });
      }

      res.json({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        csv_template: supplier.csv_template || null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/suppliers/:supplier_id/csv-template - Save or update CSV template for supplier
router.post(
  "/:supplier_id/csv-template",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { mapped_fields } = req.body;
      const db = mongoose.connection.db;

      if (!mapped_fields || typeof mapped_fields !== "object") {
        return res.status(400).json({ detail: "mapped_fields object is required" });
      }

      const timestamp = new Date().toISOString();
      const csvTemplateData = {
        mapped_fields,
        updated_at: timestamp,
        updated_by: req.user.id,
      };

      const result = await db.collection("suppliers").updateOne(
        { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
        { $set: { csv_template: csvTemplateData, updated_at: timestamp } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ detail: "Supplier not found" });
      }

      await logActivity(
        db,
        req.user.pharmacy_id,
        req.user.id,
        req.user.name,
        "UPDATE",
        "SUPPLIERS",
        req.params.supplier_id,
        `Updated CSV mapping template for Supplier`,
        `/suppliers`
      );

      res.json({
        message: "CSV mapping template saved successfully",
        csv_template: csvTemplateData,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/suppliers/:supplier_id/csv-template - Reset CSV template for supplier
router.delete(
  "/:supplier_id/csv-template",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const result = await db.collection("suppliers").updateOne(
        { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
        { $unset: { csv_template: "" } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ detail: "Supplier not found" });
      }

      res.json({ message: "CSV mapping template removed successfully" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
