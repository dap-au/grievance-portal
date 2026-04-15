// backend/routes/chat.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getStaffUsers,
  getConversations,
  getMessages,
  createConversation,
  reactMessage,
} = require('../controllers/chatController');

const CHAT_ROLES = ['dean', 'registrar', 'faculty', 'committee', 'vc'];

router.use(protect);
router.use(authorize(CHAT_ROLES));

router.get('/staff-users',                        getStaffUsers);
router.get('/conversations',                      getConversations);
router.post('/conversations',                     createConversation);
router.get('/conversations/:id/messages',         getMessages);
router.post('/messages/:msgId/react',             reactMessage);

module.exports = router;
