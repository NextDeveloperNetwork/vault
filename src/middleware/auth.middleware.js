const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'passkeeper_jwt_super_secret_key_change_in_production_32bytes';

async function authenticateToken(req, res, next) {
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
    
    // Fetch fresh user role and status from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, status: true, name: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }

    if (user.status === 'PENDING') {
      return res.status(403).json({
        error: 'Your account is pending admin approval. Access to vault features is restricted.',
        status: 'PENDING'
      });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({
        error: 'Your account registration was rejected by an administrator.',
        status: 'REJECTED'
      });
    }

    req.user = user; // Contains id, email, role, status, name
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

module.exports = {
  authenticateToken
};
