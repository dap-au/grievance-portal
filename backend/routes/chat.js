// backend/routes/chat.js
const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getStaffUsers,
  getConversations,
  getMessages,
  createConversation,
  reactMessage,
} = require('../controllers/chatController');

const CHAT_ROLES = ['dean', 'registrar', 'faculty', 'committee', 'vc'];

// Export a factory so server.js can inject `io`
module.exports = (io) => {
  const router = express.Router();

  router.use(protect);
  router.use(authorize(CHAT_ROLES));

  router.get('/staff-users',                        getStaffUsers);
  router.get('/conversations',                      getConversations);
  router.post('/conversations',                     (req, res) => createConversation(req, res, io));
  router.get('/conversations/:id/messages',         getMessages);
  router.post('/messages/:msgId/react',             reactMessage);

  return router;
};
