// backend/config/migrate_chat.js
// Run: node config/migrate_chat.js
require('dotenv').config();
const pool = require('./db');

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id           SERIAL PRIMARY KEY,
        name         TEXT,
        type         TEXT NOT NULL CHECK (type IN ('global','direct','group','grievance_thread')),
        grievance_id INT,
        created_by   INT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
        user_id         INT NOT NULL,
        joined_at       TIMESTAMPTZ DEFAULT NOW(),
        last_read_at    TIMESTAMPTZ,
        PRIMARY KEY (conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              SERIAL PRIMARY KEY,
        conversation_id INT  REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id       INT  NOT NULL,
        sender_name     TEXT NOT NULL,
        sender_role     TEXT,
        body            TEXT NOT NULL,
        reactions       JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv_created
        ON messages (conversation_id, created_at DESC);
    `);

    // Seed the global Staff Room if absent
    const existing = await pool.query(
      `SELECT id FROM conversations WHERE type = 'global' LIMIT 1`
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO conversations (name, type) VALUES ('Staff Room', 'global')`
      );
      console.log('Created global Staff Room');
    } else {
      console.log('Global Staff Room already exists');
    }

    console.log('Chat migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
