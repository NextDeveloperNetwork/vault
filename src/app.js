const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const secretsRoutes = require('./routes/secrets.routes');
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
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/secrets', secretsRoutes);
app.use('/api/admin', adminRoutes);

// Healthcheck Route for Cloudflare & Docker
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route redirect
app.get('/', (req, res) => {
  res.redirect('/login');
});

// HTML Route fallbacks
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/add', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/add-item.html'));
});

app.get('/users', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/users.html'));
});

app.get('/settings', (req, res) => {
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
