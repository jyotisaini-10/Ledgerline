import express from 'express';
import { query } from '../db';
import { authenticateToken } from './auth';

const router = express.Router();

// Get all transactions for a user
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 100, offset = 0, is_anomaly, is_subscription, search } = req.query;

    let queryText = 'SELECT * FROM transactions WHERE user_id = ?';
    const params: any[] = [userId];

    if (is_anomaly !== undefined) {
      queryText += ' AND is_anomaly = ?';
      params.push(is_anomaly === 'true' ? 1 : 0);
    }

    if (is_subscription !== undefined) {
      queryText += ' AND is_subscription = ?';
      params.push(is_subscription === 'true' ? 1 : 0);
    }

    if (search) {
      queryText += ' AND (merchant_name LIKE ? OR category LIKE ? OR description LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    queryText += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const result = query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// IMPORTANT: Stats routes MUST come before /:id to avoid routing conflicts
// Get transaction statistics summary
router.get('/stats/summary', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    const result = query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN is_subscription = 1 THEN 1 ELSE 0 END) as subscription_count,
        SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as anomaly_count,
        SUM(amount) as total_spent,
        AVG(amount) as avg_transaction_amount
       FROM transactions 
       WHERE user_id = ?`,
      [userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get monthly spend for chart (last 6 months)
router.get('/stats/monthly', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    const result = query(
      `SELECT 
        strftime('%Y-%m', date) as month,
        SUM(amount) as total,
        COUNT(*) as count
       FROM transactions
       WHERE user_id = ? AND date >= date('now', '-6 months')
       GROUP BY strftime('%Y-%m', date)
       ORDER BY month ASC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily spend for the last 30 days
router.get('/stats/daily', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    const result = query(
      `SELECT 
        strftime('%Y-%m-%d', date) as day,
        SUM(amount) as total,
        COUNT(*) as count
       FROM transactions
       WHERE user_id = ? AND date >= date('now', '-30 days')
       GROUP BY strftime('%Y-%m-%d', date)
       ORDER BY day ASC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get spend by category
router.get('/stats/categories', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    const result = query(
      `SELECT 
        COALESCE(category, 'Other') as category,
        SUM(amount) as total,
        COUNT(*) as count,
        AVG(amount) as avg_amount
       FROM transactions
       WHERE user_id = ? AND date >= date('now', '-30 days')
       GROUP BY COALESCE(category, 'Other')
       ORDER BY total DESC
       LIMIT 10`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = query(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create transaction (manual or from Plaid sync)
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const {
      plaid_transaction_id,
      amount,
      currency,
      merchant_name,
      category,
      date,
      description,
      is_subscription,
      subscription_confidence,
      is_anomaly,
      anomaly_score,
      anomaly_confidence,
      risk_level,
    } = req.body;

    const db = (await import('../db')).default;
    const stmt = db.prepare(`
      INSERT INTO transactions 
        (user_id, plaid_transaction_id, amount, currency, merchant_name, category, date, description,
         is_subscription, subscription_confidence, is_anomaly, anomaly_score, anomaly_confidence, risk_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      plaid_transaction_id || null,
      amount,
      currency || 'USD',
      merchant_name,
      category,
      date,
      description,
      is_subscription ? 1 : 0,
      subscription_confidence || 0,
      is_anomaly ? 1 : 0,
      anomaly_score || 0,
      anomaly_confidence || 0,
      risk_level || 'low'
    );

    const created = query('SELECT * FROM transactions WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(created.rows[0]);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update transaction ML scores
router.put('/:id/ml-scores', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const {
      is_subscription,
      subscription_confidence,
      is_anomaly,
      anomaly_score,
      anomaly_confidence,
      risk_level,
      ml_signals,
    } = req.body;

    const db = (await import('../db')).default;
    const stmt = db.prepare(`
      UPDATE transactions 
      SET is_subscription = ?, subscription_confidence = ?, 
          is_anomaly = ?, anomaly_score = ?, anomaly_confidence = ?, risk_level = ?,
          ml_signals = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `);

    const result = stmt.run(
      is_subscription ? 1 : 0,
      subscription_confidence,
      is_anomaly ? 1 : 0,
      anomaly_score,
      anomaly_confidence,
      risk_level,
      ml_signals ? JSON.stringify(ml_signals) : null,
      id,
      userId
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const updated = query('SELECT * FROM transactions WHERE id = ?', [id]);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error updating transaction ML scores:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
