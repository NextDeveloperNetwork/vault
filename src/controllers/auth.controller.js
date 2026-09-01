const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'passkeeper_jwt_super_secret_key_change_in_production_32bytes';

// Helper to send HTTP-Only cookie
function setAuthCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    // Check existing user
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Check if this is the first user registered in the system
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    const role = isFirstUser ? 'ADMIN' : 'USER';
    const status = isFirstUser ? 'APPROVED' : 'PENDING';

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name || null,
        role,
        status
      }
    });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, status: user.status },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setAuthCookie(res, token);

    return res.status(201).json({
      message: isFirstUser
        ? 'Admin account created and approved!'
        : 'Registration successful. Your account is pending admin approval.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status
      }
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({ error: 'Your account registration was rejected by an administrator.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, status: user.status },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setAuthCookie(res, token);

    return res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status
      }
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({ message: 'Logged out successfully.' });
}

async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  me
};
