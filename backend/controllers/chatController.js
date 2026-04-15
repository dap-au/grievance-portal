// backend/controllers/chatController.js
const pool   = require('../config/db');
const prisma = require('../config/prisma');

const CHAT_ROLES = ['dean', 'registrar', 'faculty', 'committee', 'vc'];

// ── Ensure global Staff Room exists (called at startup) ──────
const ensureGlobalRoom = async () => {
  const existing = await pool.query(
    `SELECT id FROM conversations WHERE type = 'global' LIMIT 1`
  );
  if (existing.rows.length === 0) {
    const result = await pool.query(
      `INSERT INTO conversations (name, type) VALUES ('Staff Room', 'global') RETURNING id`
    );
    console.log('Created global Staff Room, id:', result.rows[0].id);
  }
};

// ── GET /api/chat/staff-users ────────────────────────────────
const getStaffUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: CHAT_ROLES }, isVerified: true, id: { not: req.user.id } },
      select: { id: true, name: true, role: true, campus: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (err) {
    console.error('getStaffUsers error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/chat/conversations ──────────────────────────────
const getConversations = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.name, c.type, c.grievance_id, c.created_at,
        (SELECT m.body        FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.sender_name FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
        (SELECT m.created_at  FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
        (
          SELECT COUNT(*) FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_id != $1
            AND m.created_at > COALESCE(
              (SELECT cm2.last_read_at FROM conversation_members cm2
               WHERE cm2.conversation_id = c.id AND cm2.user_id = $1),
              '1970-01-01'
            )
        )::int AS unread_count
      FROM conversations c
      LEFT JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
      WHERE c.type = 'global' OR cm.user_id = $1
      ORDER BY last_at DESC NULLS LAST, c.created_at ASC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('getConversations error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/chat/conversations/:id/messages ─────────────────
const getMessages = async (req, res) => {
  const { id }   = req.params;
  const userId   = req.user.id;
  const limit    = Math.min(parseInt(req.query.limit  || '60'), 100);
  const before   = req.query.before; // cursor: message id

  try {
    let query  = `SELECT id, sender_id, sender_name, sender_role, body, reactions, created_at
                  FROM messages WHERE conversation_id = $1`;
    const params = [id];
    if (before) { query += ` AND id < $2`; params.push(before); }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    // Mark conversation as read
    await pool.query(`
      INSERT INTO conversation_members (conversation_id, user_id, last_read_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()
    `, [id, userId]);

    res.json(result.rows.reverse()); // oldest first
  } catch (err) {
    console.error('getMessages error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/chat/conversations ─────────────────────────────
const createConversation = async (req, res) => {
  const { name, type, member_ids } = req.body;
  const userId = req.user.id;

  if (!['direct', 'group'].includes(type)) {
    return res.status(400).json({ message: 'type must be direct or group' });
  }

  try {
    // For DMs reuse existing conversation
    if (type === 'direct' && Array.isArray(member_ids) && member_ids.length === 1) {
      const otherId = parseInt(member_ids[0]);
      const existing = await pool.query(`
        SELECT c.id FROM conversations c
        JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = $1
        JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = $2
        WHERE c.type = 'direct'
        LIMIT 1
      `, [userId, otherId]);
      if (existing.rows.length > 0) {
        return res.json(existing.rows[0]);
      }
    }

    const conv = await pool.query(
      `INSERT INTO conversations (name, type, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [name || null, type, userId]
    );
    const convId = conv.rows[0].id;

    const allMembers = [userId, ...(member_ids || []).map(Number)]
      .filter((v, i, a) => a.indexOf(v) === i);
    for (const mid of allMembers) {
      await pool.query(
        `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [convId, mid]
      );
    }
    res.status(201).json({ id: convId, name, type });
  } catch (err) {
    console.error('createConversation error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/chat/conversations/:id/react ───────────────────
const reactMessage = async (req, res) => {
  const { msgId } = req.params;
  const { emoji }  = req.body;
  const userId     = req.user.id;
  const ALLOWED    = ['👍','✅','❗','👀','🙏'];
  if (!ALLOWED.includes(emoji)) return res.status(400).json({ message: 'Invalid emoji' });

  try {
    const msg = await pool.query(`SELECT reactions FROM messages WHERE id = $1`, [msgId]);
    if (!msg.rows.length) return res.status(404).json({ message: 'Not found' });

    const reactions = msg.rows[0].reactions || {};
    const list = reactions[emoji] || [];
    if (list.includes(userId)) {
      reactions[emoji] = list.filter((id) => id !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...list, userId];
    }

    const updated = await pool.query(
      `UPDATE messages SET reactions = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(reactions), msgId]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('reactMessage error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  ensureGlobalRoom,
  getStaffUsers,
  getConversations,
  getMessages,
  createConversation,
  reactMessage,
};
