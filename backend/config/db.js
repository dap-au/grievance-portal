// backend/config/db.js
// PostgreSQL connection using pg (node-postgres)
// If you get "password authentication failed" → check DB_USER and DB_PASSWORD in .env
// If you get "ECONNREFUSED" → PostgreSQL service is not running, start it first

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'grievance_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('→ Check your .env DB_* settings and ensure PostgreSQL is running');
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

module.exports = pool;