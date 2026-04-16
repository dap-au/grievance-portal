require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { Server } = require('socket.io');
const jwt     = require('jsonwebtoken');
const prisma  = require('./config/prisma');
const { protect, authorize } = require('./middleware/authMiddleware');
const authRoutes      = require('./routes/authRoutes');
const grievanceRoutes = require('./routes/grievances');
const chatRoutes      = require('./routes/chat');
const { startDailyOverdueAlertJob } = require('./utils/notifications');
const { ensureGlobalRoom } = require('./controllers/chatController');
const pool = require('./config/db');

const uploadsRoot = path.join(__dirname, 'uploads');
const proofsRoot = path.join(uploadsRoot, 'proofs');

fs.mkdirSync(proofsRoot, { recursive: true });

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsRoot));

app.use('/api/auth', authRoutes);
app.use('/api/grievances', grievanceRoutes);
// chatRoutes is a factory; lazy-init so io is available after Server creation
let chatRouterInstance = null;
app.use('/api/chat', (req, res, next) => {
  if (!chatRouterInstance) chatRouterInstance = chatRoutes(io);
  chatRouterInstance(req, res, next);
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const createDashboardResponse = (title, role, capabilities) => ({
  portal: title,
  role,
  capabilities,
  timestamp: new Date().toISOString(),
});

app.get('/api/student/dashboard', protect, authorize(['student']), (req, res) => {
  res.json(createDashboardResponse('Student Dashboard', 'student', [
    'View profile',
    'Reset password',
    'Access student portal',
  ]));
});

app.get('/api/faculty/dashboard', protect, authorize(['faculty']), (req, res) => {
  res.json(createDashboardResponse('Faculty Dashboard', 'faculty', [
    'View profile',
    'Access faculty portal',
    'Manage faculty-related workflows',
  ]));
});

app.get('/api/dean/dashboard', protect, authorize(['dean']), (req, res) => {
  res.json(createDashboardResponse('Dean Dashboard', 'dean', [
    'Review dean-level requests',
    'Approve or forward items',
    'View role-specific operations',
  ]));
});

app.get('/api/registrar/dashboard', protect, authorize(['registrar']), (req, res) => {
  res.json(createDashboardResponse('Registrar Dashboard', 'registrar', [
    'Review registrar-level operations',
    'Handle approvals and records',
    'Monitor account verification status',
  ]));
});

app.get('/api/vc/dashboard', protect, authorize(['vc']), async (req, res, next) => {
  try {
    const [totalUsers, verifiedUsers, unverifiedUsers, usersByRole, recentUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.user.count({ where: { isVerified: false } }),
      prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
      }),
    ]);

    res.json({
      portal: 'Vice Chancellor Analytics Portal',
      role: 'vc',
      advancedAnalytics: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
        verificationRate: totalUsers === 0 ? 0 : Number(((verifiedUsers / totalUsers) * 100).toFixed(2)),
        usersByRole,
        recentUsers,
      },
      operationsOverview: [
        'Read-only oversight of the institution',
        'Visibility into registration and verification flow',
        'Visibility into all role-based access activity',
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', protect, (req, res) => {
  const roleMap = {
    student: '/api/student/dashboard',
    faculty: '/api/faculty/dashboard',
    dean: '/api/dean/dashboard',
    registrar: '/api/registrar/dashboard',
    vc: '/api/vc/dashboard',
  };

  res.json({
    message: 'Use the role-specific dashboard endpoint for your account.',
    role: req.user.role,
    dashboardPath: roleMap[req.user.role],
  });
});

app.use((req, res) => res.status(404).json({ message: `Route ${req.path} not found` }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const ensureProofColumns = async () => {
  await pool.query(`
    ALTER TABLE grievances
      ADD COLUMN IF NOT EXISTS proof_file_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS proof_original_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS proof_mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS proof_file_size INTEGER;
  `);
};

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);

// ── Socket.IO ────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});

const CHAT_ROLES = ['dean', 'registrar', 'faculty', 'committee', 'vc'];

// JWT auth middleware for sockets
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, role: true, isVerified: true },
    });
    if (!user || !user.isVerified) return next(new Error('Unauthorized'));
    if (!CHAT_ROLES.includes(user.role)) return next(new Error('Role not permitted'));
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const { id: userId, name: userName, role: userRole } = socket.user;

  // Each socket joins its personal room so the server can push room-joins later
  socket.join(`user_${userId}`);

  // Auto-join ALL conversations this user is a member of (global + DMs)
  pool.query(
    `SELECT c.id FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
     UNION
     SELECT id FROM conversations WHERE type = 'global'`,
    [userId]
  )
    .then(({ rows }) => { rows.forEach((r) => socket.join(`conv_${r.id}`)); })
    .catch(() => {});

  socket.on('join_room', (convId) => {
    socket.join(`conv_${convId}`);
  });

  socket.on('leave_room', (convId) => {
    socket.leave(`conv_${convId}`);
  });

  socket.on('send_message', async ({ convId, body }) => {
    if (!body || !body.trim() || !convId) return;
    try {
      const result = await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, sender_name, sender_role, body)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [convId, userId, userName, userRole, body.trim()]
      );
      const msg = result.rows[0];
      io.to(`conv_${convId}`).emit('message_received', msg);
    } catch (err) {
      console.error('send_message error:', err.message);
    }
  });

  socket.on('typing', ({ convId }) => {
    socket.to(`conv_${convId}`).emit('typing', { userId, name: userName });
  });

  socket.on('stop_typing', ({ convId }) => {
    socket.to(`conv_${convId}`).emit('stop_typing', { userId });
  });

  socket.on('mark_read', async ({ convId }) => {
    try {
      await pool.query(
        `INSERT INTO conversation_members (conversation_id, user_id, last_read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
        [convId, userId]
      );
      // Notify this user only so they can clear their badge
      socket.emit('read_confirmed', { convId });
    } catch (err) {
      console.error('mark_read error:', err.message);
    }
  });

  socket.on('react_message', async ({ msgId, emoji }) => {
    const ALLOWED = ['👍', '✅', '❗', '👀', '🙏'];
    if (!ALLOWED.includes(emoji)) return;
    try {
      const msg = await pool.query(`SELECT reactions, conversation_id FROM messages WHERE id = $1`, [msgId]);
      if (!msg.rows.length) return;
      const reactions = msg.rows[0].reactions || {};
      const convId = msg.rows[0].conversation_id;
      const list = reactions[emoji] || [];
      if (list.includes(userId)) {
        reactions[emoji] = list.filter((id) => id !== userId);
        if (!reactions[emoji].length) delete reactions[emoji];
      } else {
        reactions[emoji] = [...list, userId];
      }
      const updated = await pool.query(
        `UPDATE messages SET reactions = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify(reactions), msgId]
      );
      io.to(`conv_${convId}`).emit('reaction_updated', updated.rows[0]);
    } catch (err) {
      console.error('react_message error:', err.message);
    }
  });
});

(async () => {
  try {
    await ensureProofColumns();
    await ensureGlobalRoom();
  } catch (error) {
    console.error('Startup error:', error.message);
  }

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startDailyOverdueAlertJob();
  });
})();