const express = require('express');
const router = express.Router();
const secretsController = require('../controllers/secrets.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(authenticateToken);
router.use(apiLimiter);

router.get('/', secretsController.getAllSecrets);
router.get('/:id', secretsController.getSecretById);
router.post('/', secretsController.createSecret);
router.put('/:id', secretsController.updateSecret);
router.delete('/:id', secretsController.deleteSecret);
router.patch('/:id/favorite', secretsController.toggleFavorite);

module.exports = router;
