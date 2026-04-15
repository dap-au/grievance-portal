const express = require('express');
const router = express.Router();
const { register, login, resetPassword, getMe, createCommitteeMember, listCommitteeMembers, removeCommitteeMember } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/reset-password/:token', resetPassword);
router.get('/me', protect, getMe);

// Committee management — dean only
router.post('/committee',          protect, authorize(['dean']), createCommitteeMember);
router.get('/committee',           protect, authorize(['dean']), listCommitteeMembers);
router.delete('/committee/:id',    protect, authorize(['dean']), removeCommitteeMember);

module.exports = router;