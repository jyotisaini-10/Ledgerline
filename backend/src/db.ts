import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── Typed query helper ───────────────────────────────────────────────────────
// Returns { rows, rowCount } to match the expected API surface throughout
// the routes. All params use $1, $2, etc. placeholders (PostgreSQL style).
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
};

export default pool;
