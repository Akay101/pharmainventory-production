const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne(
      { id: decoded.user_id },
      { projection: { _id: 0, password_hash: 0, password: 0 } }
    );

    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ detail: 'Invalid or expired token' });
    }
    next(error);
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ detail: 'Admin access required' });
  }
  next();
};

const generateToken = (userId) => {
  return jwt.sign(
    { user_id: userId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

module.exports = { auth, adminOnly, generateToken };
