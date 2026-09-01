const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'passkeeper_jwt_super_secret_key_change_in_production_32bytes';

function authenticateToken(req, res, next) {
  // Check token in cookie first, then fallback to Authorization header
  let token = req.cookies?.auth_token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Contains id, email
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

module.exports = {
  authenticateToken
};
