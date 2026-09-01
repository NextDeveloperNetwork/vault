const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(authenticateToken);
router.use(requireAdmin);
router.use(apiLimiter);

router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/approve', adminController.approveUser);
router.patch('/users/:id/reject', adminController.rejectUser);
router.patch('/users/:id/role', adminController.changeRole);
router.delete('/users/:id', adminController.deleteUser);

module.exports = router;
