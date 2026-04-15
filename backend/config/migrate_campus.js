// One-time migration script: adds campus / committee / confidential resolution columns
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'grievance_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const client = await pool.connect();
  try {
    // campus columns (idempotent)
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS campus VARCHAR(20)
          CHECK (campus IN ('uppal', 'bhongir'))
    `);
    console.log('✅ users.campus');

    await client.query(`
      ALTER TABLE grievances
        ADD COLUMN IF NOT EXISTS campus VARCHAR(20)
          CHECK (campus IN ('uppal', 'bhongir'))
    `);
    console.log('✅ grievances.campus');

    // Add committee to role check - first update existing 'dean_sa' etc if any, then recreate constraint
    await client.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
    `);
    // Update any legacy role values
    await client.query(`UPDATE users SET role = 'dean' WHERE role IN ('dean_sa','school_dean','dept_head')`);
    await client.query(`UPDATE users SET role = 'faculty' WHERE role = 'director_academics'`);
    await client.query(`UPDATE users SET role = 'vc' WHERE role = 'vice_chancellor'`);
    await client.query(`
      ALTER TABLE users
        ADD CONSTRAINT users_role_check
          CHECK (role IN ('student','dean','committee','registrar','faculty','vc'))
    `);
    console.log('✅ users.role check updated (added committee)');

    // Confidential resolution flag
    await client.query(`
      ALTER TABLE grievances
        ADD COLUMN IF NOT EXISTS resolution_confidential BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ grievances.resolution_confidential');

    console.log('\nMigration complete. Run: node seed.js to seed staff accounts.');
  } catch (e) {
    console.error('Migration error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
