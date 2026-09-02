const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const secretsRoutes = require('./routes/secrets.routes');
const groupsRoutes = require('./routes/groups.routes');
const adminRoutes = require('./routes/admin.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Disabled for embedded inline scripts & Google Fonts in self-hosted mode
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Assets (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.ico')) {
      res.set('Content-Type', 'image/x-icon');
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Favicon — served under both .ico and .jpg paths for maximum compatibility
const faviconPath = path.join(__dirname, '../public/favicon.ico');
app.get('/favicon.ico', (req, res) => {
  res.set('Content-Type', 'image/x-icon');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(faviconPath);
});
app.get('/favicon.jpg', (req, res) => {
  res.set('Content-Type', 'image/x-icon');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(faviconPath);
});


// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/secrets', secretsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/admin', adminRoutes);

// Healthcheck Route for Cloudflare & Docker
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'passkeeper_jwt_super_secret_key_change_in_production_32bytes';

// Helper middleware: If already logged in, redirect away from login/register to dashboard
function redirectIfAuthenticated(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const token = req.cookies?.auth_token;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.id && decoded.status === 'APPROVED') {
      return res.redirect('/dashboard');
    }
  } catch (err) {
    res.clearCookie('auth_token');
  }
  next();
}

// Helper middleware: If not logged in, redirect to login page
function requireAuthPage(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const token = req.cookies?.auth_token;
  if (!token) {
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.redirect('/login');
    }
    next();
  } catch (err) {
    res.clearCookie('auth_token');
    return res.redirect('/login');
  }
}

// Root route: redirect to dashboard if logged in, otherwise login
app.get('/', redirectIfAuthenticated, (req, res) => {
  res.redirect('/login');
});

// HTML Route fallbacks
app.get('/login', redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/register', redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/dashboard', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/add', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/add-item.html'));
});

app.get('/users', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/users.html'));
});

app.get('/settings', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/settings.html'));
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🔐 PassKeeper Vault Server running on port ${PORT}`);
  console.log(`📱 Mobile-optimized UI ready at http://localhost:${PORT}`);
  console.log(`=================================`);
});

module.exports = app;
