const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');

// GET /api/suppliers
router.get('/', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, page = 1, limit = 50 } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contact: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const suppliers = await db.collection('suppliers')
      .find(query, { projection: { _id: 0 } })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection('suppliers').countDocuments(query);

    res.json({
      suppliers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / parseInt(limit)) || 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers
router.post('/', auth, async (req, res, next) => {
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
      created_at: new Date().toISOString()
    };

    await db.collection('suppliers').insertOne(supplierData);
    const { _id, ...supplier } = supplierData;

    res.status(201).json({ message: 'Supplier created', supplier });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:supplier_id
router.get('/:supplier_id', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const supplier = await db.collection('suppliers').findOne(
      { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
      { projection: { _id: 0 } }
    );

    if (!supplier) {
      return res.status(404).json({ detail: 'Supplier not found' });
    }

    // Get purchases from this supplier
    const purchases = await db.collection('purchases')
      .find({ supplier_id: req.params.supplier_id })
      .sort({ created_at: -1 })
      .limit(10)
      .project({ _id: 0 })
      .toArray();

    res.json({ supplier, purchases });
  } catch (error) {
    next(error);
  }
});

// PUT /api/suppliers/:supplier_id
router.put('/:supplier_id', auth, async (req, res, next) => {
  try {
    const { name, contact, email, address, gst_no, notes } = req.body;
    const db = mongoose.connection.db;

    const result = await db.collection('suppliers').updateOne(
      { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
      { $set: { name, contact, email, address, gst_no, notes } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: 'Supplier not found' });
    }

    const supplier = await db.collection('suppliers').findOne(
      { id: req.params.supplier_id },
      { projection: { _id: 0 } }
    );

    res.json({ message: 'Supplier updated', supplier });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/suppliers/:supplier_id
router.delete('/:supplier_id', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const result = await db.collection('suppliers').deleteOne(
      { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: 'Supplier not found' });
    }

    res.json({ message: 'Supplier deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
