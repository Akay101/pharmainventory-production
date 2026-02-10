const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');

// GET /api/inventory
router.get('/', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, low_stock, expiring_soon, page = 1, limit = 50, sort_by = 'created_at', sort_order = 'desc' } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id, available_quantity: { $gt: 0 } };
    if (search) {
      query.$or = [
        { product_name: { $regex: search, $options: 'i' } },
        { batch_no: { $regex: search, $options: 'i' } },
        { salt_composition: { $regex: search, $options: 'i' } }
      ];
    }

    const sortDir = sort_order === 'asc' ? 1 : -1;
    let allInventory = await db.collection('inventory')
      .find(query, { projection: { _id: 0 } })
      .sort({ [sort_by]: sortDir })
      .toArray();

    // Filter low stock
    if (low_stock === 'true') {
      const products = await db.collection('products')
        .find({ pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } })
        .toArray();
      
      const thresholds = {};
      products.forEach(p => thresholds[p.id] = p.low_stock_threshold || 10);

      const productStock = {};
      allInventory.forEach(item => {
        const pid = item.product_id || '';
        productStock[pid] = (productStock[pid] || 0) + item.available_quantity;
      });

      const lowStockProducts = Object.keys(productStock).filter(
        pid => productStock[pid] <= (thresholds[pid] || 10)
      );

      allInventory = allInventory.filter(i => lowStockProducts.includes(i.product_id));
    }

    // Filter expiring soon
    if (expiring_soon === 'true') {
      const cutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      allInventory = allInventory.filter(i => (i.expiry_date || '9999-12-31') <= cutoff);
    }

    const total = allInventory.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const inventory = allInventory.slice(skip, skip + parseInt(limit));

    res.json({
      inventory,
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

// GET /api/inventory/search
router.get('/search', auth, async (req, res, next) => {
  try {
    const { q, limit = 15 } = req.query;
    const db = mongoose.connection.db;

    if (!q || q.length < 1) {
      return res.status(400).json({ detail: 'Search query required' });
    }

    const query = {
      pharmacy_id: req.user.pharmacy_id,
      available_quantity: { $gt: 0 },
      $or: [
        { product_name: { $regex: q, $options: 'i' } },
        { batch_no: { $regex: q, $options: 'i' } },
        { salt_composition: { $regex: q, $options: 'i' } }
      ]
    };

    let inventory = await db.collection('inventory')
      .find(query, { projection: { _id: 0 } })
      .limit(parseInt(limit) * 2)
      .toArray();

    // Rank results
    const searchLower = q.toLowerCase();
    inventory.sort((a, b) => {
      const aName = (a.product_name || '').toLowerCase();
      const bName = (b.product_name || '').toLowerCase();
      const aSalt = (a.salt_composition || '').toLowerCase();
      const bSalt = (b.salt_composition || '').toLowerCase();

      // Exact match
      if (aName === searchLower) return -1;
      if (bName === searchLower) return 1;
      // Starts with name
      if (aName.startsWith(searchLower) && !bName.startsWith(searchLower)) return -1;
      if (!aName.startsWith(searchLower) && bName.startsWith(searchLower)) return 1;
      // Starts with salt
      if (aSalt.startsWith(searchLower) && !bSalt.startsWith(searchLower)) return -1;
      if (!aSalt.startsWith(searchLower) && bSalt.startsWith(searchLower)) return 1;
      return 0;
    });

    res.json({ inventory: inventory.slice(0, parseInt(limit)), count: Math.min(inventory.length, parseInt(limit)) });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/alerts
router.get('/alerts', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    
    const inventory = await db.collection('inventory')
      .find({ pharmacy_id: req.user.pharmacy_id, available_quantity: { $gt: 0 } }, { projection: { _id: 0 } })
      .toArray();

    const products = await db.collection('products')
      .find({ pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } })
      .toArray();

    const thresholds = {};
    products.forEach(p => thresholds[p.id] = p.low_stock_threshold || 10);

    // Aggregate stock by product
    const productStock = {};
    inventory.forEach(item => {
      const pid = item.product_id || item.product_name;
      if (!productStock[pid]) {
        productStock[pid] = { name: item.product_name, total: 0, items: [] };
      }
      productStock[pid].total += item.available_quantity;
      productStock[pid].items.push(item);
    });

    // Low stock items
    const lowStock = Object.values(productStock)
      .filter(p => p.total <= (thresholds[p.id] || 10))
      .map(p => ({ product_name: p.name, available_quantity: p.total, threshold: thresholds[p.id] || 10 }));

    // Expiring soon (90 days)
    const cutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expiringSoon = inventory
      .filter(i => i.expiry_date && i.expiry_date <= cutoff)
      .map(i => ({
        product_name: i.product_name,
        batch_no: i.batch_no,
        expiry_date: i.expiry_date,
        available_quantity: i.available_quantity
      }));

    // Expired items
    const today = new Date().toISOString().split('T')[0];
    const expired = inventory
      .filter(i => i.expiry_date && i.expiry_date < today)
      .map(i => ({
        product_name: i.product_name,
        batch_no: i.batch_no,
        expiry_date: i.expiry_date,
        available_quantity: i.available_quantity
      }));

    res.json({ low_stock_alerts: lowStock, expiry_alerts: expiringSoon, expired });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
