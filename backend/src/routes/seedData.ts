/**
 * Seed Route — POST /api/seed
 * ----------------------------
 * Generates 120 days of rich synthetic transaction history for the
 * logged-in user. Includes:
 *   - Real subscription cadences (Netflix, Spotify, GitHub Copilot, Adobe, etc.)
 *   - Normal spend patterns across 6 categories
 *   - 5 injected anomalies with distinct signals
 *
 * Safe to run multiple times — clears previous seeded data first.
 */

import express from 'express';
import { query } from '../db';
import { authenticateToken } from './auth';

const router = express.Router();

// ─── Subscription definitions ─────────────────────────────────────────────────
const SUBSCRIPTIONS = [
  { merchant: 'Netflix', amount: 15.49, interval: 30, category: 'Entertainment' },
  { merchant: 'Spotify', amount: 10.99, interval: 30, category: 'Entertainment' },
  { merchant: 'GitHub Copilot', amount: 10.00, interval: 30, category: 'Software' },
  { merchant: 'Adobe Creative Cloud', amount: 54.99, interval: 30, category: 'Software' },
  { merchant: 'Amazon Prime', amount: 14.99, interval: 30, category: 'Shopping' },
  { merchant: 'Hulu', amount: 17.99, interval: 30, category: 'Entertainment' },
  { merchant: 'ChatGPT Plus', amount: 20.00, interval: 30, category: 'Software' },
  { merchant: 'iCloud Storage', amount: 2.99, interval: 30, category: 'Software' },
  { merchant: 'New York Times', amount: 4.00, interval: 30, category: 'News' },
  { merchant: 'Duolingo Plus', amount: 6.99, interval: 30, category: 'Education' },
  { merchant: 'LinkedIn Premium', amount: 39.99, interval: 30, category: 'Professional' },
  { merchant: 'Gym Membership', amount: 49.00, interval: 30, category: 'Health' },
];

// ─── Normal spend patterns ────────────────────────────────────────────────────
const NORMAL_SPEND = [
  { merchant: 'Whole Foods Market', category: 'Groceries', avg: 85, stdDev: 25 },
  { merchant: 'Trader Joe\'s', category: 'Groceries', avg: 65, stdDev: 20 },
  { merchant: 'Shell Gas Station', category: 'Gas', avg: 52, stdDev: 12 },
  { merchant: 'Starbucks', category: 'Food & Drink', avg: 7, stdDev: 2 },
  { merchant: 'Chipotle Mexican Grill', category: 'Food & Drink', avg: 14, stdDev: 3 },
  { merchant: 'Uber', category: 'Transportation', avg: 18, stdDev: 8 },
  { merchant: 'CVS Pharmacy', category: 'Health', avg: 28, stdDev: 15 },
  { merchant: 'Target', category: 'Shopping', avg: 75, stdDev: 30 },
  { merchant: 'PG&E Electric', category: 'Utilities', avg: 95, stdDev: 20 },
  { merchant: 'Comcast', category: 'Utilities', avg: 89, stdDev: 5 },
  { merchant: 'HomeDepot', category: 'Home', avg: 55, stdDev: 40 },
  { merchant: 'DoorDash', category: 'Food & Drink', avg: 38, stdDev: 15 },
];

// ─── Injected anomalies ───────────────────────────────────────────────────────
interface AnomalyDef {
  daysAgo: number;
  merchant: string;
  amount: number;
  category: string;
  description: string;
  hourOverride?: number;
}

const ANOMALIES: AnomalyDef[] = [
  {
    daysAgo: 5,
    merchant: 'CRYPTO EXCHANGE XY',
    amount: 2840.00,
    category: 'Financial',
    description: '10x your average transaction — large crypto purchase at 2am',
    hourOverride: 2,
  },
  {
    daysAgo: 12,
    merchant: 'Shell Gas Station',
    amount: 487.50,
    category: 'Gas',
    description: 'Duplicate-sized gas charge — 9x your average gas spend',
  },
  {
    daysAgo: 18,
    merchant: 'UNKNOWN MERCHANT 7734',
    amount: 299.99,
    category: 'Shopping',
    description: 'Unknown merchant, above average spend',
  },
  {
    daysAgo: 22,
    merchant: 'LinkedIn Premium',
    amount: 39.99,
    category: 'Professional',
    description: 'Business charge on a Sunday',
    hourOverride: 14,
  },
  {
    daysAgo: 35,
    merchant: 'Whole Foods Market',
    amount: 512.30,
    category: 'Groceries',
    description: '6x your average grocery spend in one visit',
  },
];

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function gaussianRandom(mean: number, stdDev: number): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.max(0.01, mean + stdDev * normal);
}

router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    // Clear previous seeded data
    (query as any)('DELETE FROM anomaly_alerts WHERE user_id = ?', [userId]);
    (query as any)('DELETE FROM transactions WHERE user_id = ?', [userId]);

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 120);

    const rows: any[] = [];

    // ── Generate subscription transactions ────────────────────────────────────
    for (const sub of SUBSCRIPTIONS) {
      // Randomize the billing day within the month
      const billDay = Math.floor(Math.random() * 28) + 1;
      let cursor = new Date(startDate);
      cursor.setDate(billDay);
      if (cursor < startDate) cursor.setMonth(cursor.getMonth() + 1);

      while (cursor <= today) {
        // Occasionally add a small amount drift (price increase)
        const drift = Math.random() < 0.1 ? (Math.random() * 2).toFixed(2) : 0;
        const amount = Math.round((sub.amount + Number(drift)) * 100) / 100;

        const txDate = new Date(cursor);
        txDate.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));

        rows.push({
          user_id: userId,
          plaid_transaction_id: `seed_sub_${sub.merchant.replace(/\s/g, '_')}_${txDate.getTime()}`,
          amount,
          currency: 'USD',
          merchant_name: sub.merchant,
          category: sub.category,
          date: txDate.toISOString(),
          description: `${sub.merchant} monthly charge`,
        });

        cursor.setDate(cursor.getDate() + sub.interval);
      }
    }

    // ── Generate normal spend transactions ────────────────────────────────────
    for (let dayOffset = 0; dayOffset < 120; dayOffset++) {
      const txDate = addDays(startDate, dayOffset);

      // 2-5 normal transactions per day on weekdays, 1-3 on weekends
      const isWeekend = txDate.getDay() === 0 || txDate.getDay() === 6;
      const txCount = isWeekend
        ? 1 + Math.floor(Math.random() * 3)
        : 2 + Math.floor(Math.random() * 4);

      for (let t = 0; t < txCount; t++) {
        const merchant = NORMAL_SPEND[Math.floor(Math.random() * NORMAL_SPEND.length)];
        const amount = Math.round(gaussianRandom(merchant.avg, merchant.stdDev) * 100) / 100;
        txDate.setHours(8 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));

        rows.push({
          user_id: userId,
          plaid_transaction_id: `seed_normal_${dayOffset}_${t}_${Math.random().toString(36).slice(2)}`,
          amount,
          currency: 'USD',
          merchant_name: merchant.merchant,
          category: merchant.category,
          date: txDate.toISOString(),
          description: `${merchant.merchant} purchase`,
        });
      }
    }

    // ── Inject anomalies ──────────────────────────────────────────────────────
    for (const anomaly of ANOMALIES) {
      const txDate = new Date(today);
      txDate.setDate(txDate.getDate() - anomaly.daysAgo);
      const hour = anomaly.hourOverride !== undefined ? anomaly.hourOverride : 14;
      txDate.setHours(hour, Math.floor(Math.random() * 60));

      rows.push({
        user_id: userId,
        plaid_transaction_id: `seed_anomaly_${anomaly.merchant.replace(/\s/g, '_')}_${txDate.getTime()}`,
        amount: anomaly.amount,
        currency: 'USD',
        merchant_name: anomaly.merchant,
        category: anomaly.category,
        date: txDate.toISOString(),
        description: anomaly.description,
      });
    }

    // ── Insert all rows ───────────────────────────────────────────────────────
    const db = (await import('../db')).default;
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO transactions 
        (user_id, plaid_transaction_id, amount, currency, merchant_name, category, date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((txRows: any[]) => {
      for (const row of txRows) {
        stmt.run(
          row.user_id,
          row.plaid_transaction_id,
          row.amount,
          row.currency,
          row.merchant_name,
          row.category,
          row.date,
          row.description
        );
      }
    });

    insertMany(rows);

    res.json({
      message: 'Demo data seeded successfully',
      transactions_inserted: rows.length,
      subscriptions: SUBSCRIPTIONS.length,
      anomalies_injected: ANOMALIES.length,
    });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Failed to seed data' });
  }
});

export default router;
