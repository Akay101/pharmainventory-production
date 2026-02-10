const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');

// GET /api/products
router.get('/', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, page = 1, limit = 50 } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const products = await db.collection('products')
      .find(query, { projection: { _id: 0 } })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection('products').countDocuments(query);

    res.json({
      products,
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

// POST /api/products
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, description, low_stock_threshold, image_url } = req.body;
    const db = mongoose.connection.db;

    const productId = uuidv4();
    const productData = {
      id: productId,
      pharmacy_id: req.user.pharmacy_id,
      name,
      description: description || null,
      low_stock_threshold: low_stock_threshold || 10,
      image_url: image_url || null,
      created_at: new Date().toISOString()
    };

    await db.collection('products').insertOne(productData);
    const { _id, ...product } = productData;

    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    next(error);
  }
});

// PUT /api/products/:product_id
router.put('/:product_id', auth, async (req, res, next) => {
  try {
    const { name, description, low_stock_threshold, image_url } = req.body;
    const db = mongoose.connection.db;

    const result = await db.collection('products').updateOne(
      { id: req.params.product_id, pharmacy_id: req.user.pharmacy_id },
      { $set: { name, description, low_stock_threshold, image_url } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: 'Product not found' });
    }

    const product = await db.collection('products').findOne(
      { id: req.params.product_id },
      { projection: { _id: 0 } }
    );

    res.json({ message: 'Product updated', product });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/products/:product_id
router.delete('/:product_id', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const result = await db.collection('products').deleteOne(
      { id: req.params.product_id, pharmacy_id: req.user.pharmacy_id }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: 'Product not found' });
    }

    res.json({ message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
