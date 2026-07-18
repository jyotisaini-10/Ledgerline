import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../fintech.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table (includes ml_signals JSON column)
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    plaid_transaction_id TEXT UNIQUE,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    merchant_name TEXT,
    category TEXT,
    date DATETIME NOT NULL,
    description TEXT,
    is_subscription INTEGER DEFAULT 0,
    subscription_confidence REAL DEFAULT 0.0,
    is_anomaly INTEGER DEFAULT 0,
    anomaly_score REAL DEFAULT 0.0,
    anomaly_confidence REAL DEFAULT 0.0,
    risk_level TEXT DEFAULT 'low',
    ml_signals TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Plaid items table (bank connections)
CREATE TABLE IF NOT EXISTS plaid_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    institution_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subscription patterns table
CREATE TABLE IF NOT EXISTS subscription_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    merchant_name TEXT,
    amount REAL,
    interval_days INTEGER,
    confidence_score REAL,
    last_detected DATETIME,
    is_active INTEGER DEFAULT 1
);

-- Anomaly alerts table
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    alert_type TEXT,
    severity TEXT,
    message TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_is_subscription ON transactions(is_subscription);
CREATE INDEX IF NOT EXISTS idx_transactions_is_anomaly ON transactions(is_anomaly);
CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_user_id ON anomaly_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_is_read ON anomaly_alerts(is_read);
`;

db.exec(schema);

// Migration: add ml_signals if DB already exists without it
try {
  db.prepare("ALTER TABLE transactions ADD COLUMN ml_signals TEXT").run();
  console.log('Migration: added ml_signals column');
} catch {
  // Already exists
}

console.log('✓ Database initialized at:', dbPath);
db.close();
