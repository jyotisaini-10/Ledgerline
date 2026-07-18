import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../fintech.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ── Typed synchronous query helper ──────────────────────────────────────────
// Returns { rows, rowCount } to match the expected API surface throughout
// the routes. All params use ? placeholders (SQLite style).
export const query = (text: string, params?: any[]) => {
  try {
    const stmt = db.prepare(text);
    if (text.trim().toUpperCase().startsWith('SELECT') || text.trim().toUpperCase().startsWith('WITH')) {
      const result = params && params.length > 0 ? stmt.all(...params) : stmt.all();
      return { rows: result as any[], rowCount: result.length };
    } else {
      const result = params && params.length > 0 ? stmt.run(...params) : stmt.run();
      return { rows: [], rowCount: result.changes, lastInsertRowid: result.lastInsertRowid };
    }
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
};

export default db;
