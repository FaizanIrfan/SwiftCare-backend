const jwt = require('jsonwebtoken');

exports.requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.sendStatus(401);

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.sendStatus(401);
  }
};

exports.requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role)
    return res.sendStatus(403);
  next();
};
