import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon requires SSL. The connection string already contains sslmode=require,
  // but we also set ssl here as a belt-and-suspenders for all production DBs.
  ssl: process.env.DATABASE_URL?.includes('neon.tech') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  // Neon free tier limits connections — keep the pool small
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ── Typed query helper ───────────────────────────────────────────────────────
export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('query', { text: text.slice(0, 60), duration, rows: result.rowCount });
    }
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (error) {
    console.error('Database error:', { query: text.slice(0, 80), error });
    throw error;
  }
};

export default pool;
