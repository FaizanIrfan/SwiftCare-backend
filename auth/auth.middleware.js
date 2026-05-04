const jwt = require('jsonwebtoken');

exports.requireAuth = (req, res, next) => {
  let token = null;

  // 1️⃣ Read from Authorization header (Flutter / API clients)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2️⃣ (Optional future-proofing) Read from cookie (Web)
  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Development convenience: accept a client-only mock admin token
    // produced by the frontend's hardcoded admin login flow.
    // This allows local admin actions during development without a real JWT.
    if (typeof token === 'string' && token.startsWith('mock-admin-token-')) {
      req.user = { sub: 'admin-id-001', role: 'admin' };
      return next();
    }
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

exports.requireRole = (role) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
};