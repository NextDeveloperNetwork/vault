const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup
} = require('../controllers/groups.controller');

router.use(authenticateToken);

router.get('/', getGroups);
router.post('/', createGroup);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);

module.exports = router;
