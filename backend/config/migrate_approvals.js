// backend/config/migrate_approvals.js
// Run once: node backend/config/migrate_approvals.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Drop old status check constraint and add new statuses
    await client.query(`
      ALTER TABLE grievances
        DROP CONSTRAINT IF EXISTS grievances_status_check
    `);
    await client.query(`
      ALTER TABLE grievances
        ADD CONSTRAINT grievances_status_check CHECK (status IN (
          'submitted','under_review','assigned','in_progress',
          'resolved','escalation_1','escalation_2','escalation_3',
          'final_resolved','withdrawn','fast_track',
          'pending_approval','pending_director_approval'
        ))
    `);

    // 2. Add approval tracking columns
    await client.query(`
      ALTER TABLE grievances
        ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMP,
        ADD COLUMN IF NOT EXISTS approval_note TEXT
    `);

    // 3. Create SLA config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sla_config (
        id          SERIAL PRIMARY KEY,
        sla_days    INTEGER NOT NULL DEFAULT 5,
        set_by      UUID REFERENCES users(id),
        updated_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // 4. Seed default SLA config if empty
    await client.query(`
      INSERT INTO sla_config (sla_days)
      SELECT 5
      WHERE NOT EXISTS (SELECT 1 FROM sla_config)
    `);

    await client.query('COMMIT');
    console.log('✅ Migration complete: approval flow + SLA config');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
