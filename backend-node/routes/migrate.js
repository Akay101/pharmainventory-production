const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/migrate/template/:data_type
router.get('/template/:data_type', auth, adminOnly, (req, res) => {
  const { data_type } = req.params;

  const templates = {
    suppliers: {
      name: 'Supplier Name',
      contact: '9876543210',
      email: 'supplier@email.com',
      address: 'Full Address',
      gst_no: 'GST Number'
    },
    customers: {
      name: 'Customer Name',
      mobile: '9876543210',
      email: 'customer@email.com',
      address: 'Full Address'
    },
    products: {
      name: 'Product Name',
      description: 'Product Description',
      low_stock_threshold: 10
    },
    inventory: {
      product_name: 'Medicine Name',
      batch_no: 'BATCH001',
      expiry_date: '2025-12-31',
      quantity: 100,
      available_quantity: 100,
      purchase_price: 10.5,
      mrp: 15.0
    }
  };

  if (!templates[data_type]) {
    return res.status(400).json({ detail: 'Invalid data type' });
  }

  res.json({ template: templates[data_type] });
});

// POST /api/migrate/:data_type
router.post('/:data_type', auth, adminOnly, async (req, res, next) => {
  try {
    const { data_type } = req.params;
    const { data } = req.body;
    const db = mongoose.connection.db;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ detail: 'Data array required' });
    }

    const validTypes = ['suppliers', 'customers', 'products', 'inventory'];
    if (!validTypes.includes(data_type)) {
      return res.status(400).json({ detail: 'Invalid data type' });
    }

    let imported = 0;
    let skipped = 0;

    for (const item of data) {
      try {
        const docData = {
          id: uuidv4(),
          pharmacy_id: req.user.pharmacy_id,
          ...item,
          created_at: new Date().toISOString()
        };

        await db.collection(data_type).insertOne(docData);
        imported++;
      } catch (e) {
        console.error(`Migration error for item:`, e);
        skipped++;
      }
    }

    res.json({
      message: `Migration complete`,
      imported,
      skipped,
      total: data.length
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/migrate/export/:data_type
router.post('/export/:data_type', auth, adminOnly, async (req, res, next) => {
  try {
    const { data_type } = req.params;
    const db = mongoose.connection.db;

    const validTypes = ['suppliers', 'customers', 'products', 'inventory', 'purchases', 'bills'];
    if (!validTypes.includes(data_type)) {
      return res.status(400).json({ detail: 'Invalid data type' });
    }

    const data = await db.collection(data_type)
      .find({ pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } })
      .toArray();

    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
