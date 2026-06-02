const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const parseCookies = (cookieHeader) => {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
};

const auth = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.headers.cookie) {
      const cookies = parseCookies(req.headers.cookie);
      token = cookies['pharmalogy_token'];
    }

    if (!token || token === 'undefined' || token === 'null') {
      return res.status(401).json({ detail: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.token_type === 'refresh') {
      return res.status(401).json({ detail: 'Invalid token type' });
    }
    
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne(
      { id: decoded.user_id },
      { projection: { _id: 0, password_hash: 0, password: 0 } }
    );

    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }

    // Verify token version matches user token version
    if ((decoded.token_version || 0) !== (user.token_version || 0)) {
      return res.status(401).json({ detail: 'Session expired or invalidated' });
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

const generateToken = (userId, tokenVersion = 0) => {
  const token = jwt.sign(
    { user_id: userId, token_type: 'access', token_version: tokenVersion },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { user_id: userId, token_type: 'refresh', token_version: tokenVersion },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { token, refreshToken };
};

module.exports = { auth, adminOnly, generateToken, parseCookies };
