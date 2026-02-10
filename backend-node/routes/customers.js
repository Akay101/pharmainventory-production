const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/customers
router.get('/', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, has_debt, page = 1, limit = 50 } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    let customers = await db.collection('customers')
      .find(query, { projection: { _id: 0 } })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    if (has_debt === 'true') {
      customers = customers.filter(c => (c.total_debt || 0) > 0);
    }

    const total = await db.collection('customers').countDocuments(query);

    res.json({
      customers,
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

// POST /api/customers
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, mobile, email, address } = req.body;
    const db = mongoose.connection.db;

    const customerId = uuidv4();
    const customerData = {
      id: customerId,
      pharmacy_id: req.user.pharmacy_id,
      name,
      mobile: mobile || null,
      email: email || null,
      address: address || null,
      total_debt: 0,
      created_at: new Date().toISOString()
    };

    await db.collection('customers').insertOne(customerData);
    const { _id, ...customer } = customerData;

    res.status(201).json({ message: 'Customer created', customer });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/search
router.get('/search', auth, async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;
    const db = mongoose.connection.db;

    const customers = await db.collection('customers')
      .find({
        pharmacy_id: req.user.pharmacy_id,
        $or: [
          { name: { $regex: q || '', $options: 'i' } },
          { mobile: { $regex: q || '', $options: 'i' } }
        ]
      }, { projection: { _id: 0 } })
      .limit(parseInt(limit))
      .toArray();

    res.json({ customers });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/:customer_id
router.get('/:customer_id', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const customer = await db.collection('customers').findOne(
      { id: req.params.customer_id, pharmacy_id: req.user.pharmacy_id },
      { projection: { _id: 0 } }
    );

    if (!customer) {
      return res.status(404).json({ detail: 'Customer not found' });
    }

    // Get bills
    const bills = await db.collection('bills')
      .find({ customer_id: req.params.customer_id })
      .sort({ created_at: -1 })
      .project({ _id: 0 })
      .toArray();

    res.json({ customer, bills });
  } catch (error) {
    next(error);
  }
});

// PUT /api/customers/:customer_id
router.put('/:customer_id', auth, async (req, res, next) => {
  try {
    const { name, mobile, email, address } = req.body;
    const db = mongoose.connection.db;

    const result = await db.collection('customers').updateOne(
      { id: req.params.customer_id, pharmacy_id: req.user.pharmacy_id },
      { $set: { name, mobile, email, address } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: 'Customer not found' });
    }

    const customer = await db.collection('customers').findOne(
      { id: req.params.customer_id },
      { projection: { _id: 0 } }
    );

    res.json({ message: 'Customer updated', customer });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers/:customer_id/clear-debt
router.post('/:customer_id/clear-debt', auth, adminOnly, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    const customer = await db.collection('customers').findOne({
      id: req.params.customer_id,
      pharmacy_id: req.user.pharmacy_id
    });

    if (!customer) {
      return res.status(404).json({ detail: 'Customer not found' });
    }

    // Mark all unpaid bills as paid
    await db.collection('bills').updateMany(
      { customer_id: req.params.customer_id, is_paid: false },
      { $set: { is_paid: true, paid_at: new Date().toISOString() } }
    );

    // Clear debt
    await db.collection('customers').updateOne(
      { id: req.params.customer_id },
      { $set: { total_debt: 0 } }
    );

    res.json({ message: 'Debt cleared', previous_debt: customer.total_debt });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/customers/:customer_id
router.delete('/:customer_id', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const result = await db.collection('customers').deleteOne(
      { id: req.params.customer_id, pharmacy_id: req.user.pharmacy_id }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: 'Customer not found' });
    }

    res.json({ message: 'Customer deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
