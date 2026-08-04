import express from 'express';
import { query } from '../db';
import { authenticateToken } from './auth';

const router = express.Router();

// Get all transactions for a user
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 100, offset = 0, is_anomaly, is_subscription, search } = req.query;

    let queryText = 'SELECT * FROM transactions WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 1;

    if (is_anomaly !== undefined) {
      paramIndex++;
      queryText += ` AND is_anomaly = $${paramIndex}`;
      params.push(is_anomaly === 'true'); // PostgreSQL boolean: true/false not 1/0
    }

    if (is_subscription !== undefined) {
      paramIndex++;
      queryText += ` AND is_subscription = $${paramIndex}`;
      params.push(is_subscription === 'true'); // PostgreSQL boolean
    }

    if (search) {
      paramIndex++;
      queryText += ` AND (merchant_name ILIKE $${paramIndex}`; // ILIKE = case-insensitive
      const searchPattern = `%${search}%`;
      params.push(searchPattern);
      paramIndex++;
      queryText += ` OR category ILIKE $${paramIndex}`;
      params.push(searchPattern);
      paramIndex++;
      queryText += ` OR description ILIKE $${paramIndex})`;
      params.push(searchPattern);
    }

    paramIndex++;
    queryText += ` ORDER BY date DESC LIMIT $${paramIndex}`;
    params.push(Number(limit));
    paramIndex++;
    queryText += ` OFFSET $${paramIndex}`;
    params.push(Number(offset));

    const result = await query(queryText, params);
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

    const result = await query(
      `SELECT 
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE is_subscription = true) as subscription_count,
        COUNT(*) FILTER (WHERE is_anomaly = true) as anomaly_count,
        SUM(amount) as total_spent,
        AVG(amount) as avg_transaction_amount
       FROM transactions 
       WHERE user_id = $1`,
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

    const result = await query(
      `SELECT 
        TO_CHAR(date, 'YYYY-MM') as month,
        SUM(amount) as total,
        COUNT(*) as count
       FROM transactions
       WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '6 months'
       GROUP BY TO_CHAR(date, 'YYYY-MM')
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

    const result = await query(
      `SELECT 
        TO_CHAR(date, 'YYYY-MM-DD') as day,
        SUM(amount) as total,
        COUNT(*) as count
       FROM transactions
       WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY TO_CHAR(date, 'YYYY-MM-DD')
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

    const result = await query(
      `SELECT 
        COALESCE(category, 'Other') as category,
        SUM(amount) as total,
        COUNT(*) as count,
        AVG(amount) as avg_amount
       FROM transactions
       WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
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

    const result = await query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
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

    const result = await query(
      `INSERT INTO transactions 
        (user_id, plaid_transaction_id, amount, currency, merchant_name, category, date, description,
         is_subscription, subscription_confidence, is_anomaly, anomaly_score, anomaly_confidence, risk_level)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
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
      ]
    );

    const created = result.rows[0];
    res.status(201).json(created);
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

    const result = await query(
      `UPDATE transactions 
      SET is_subscription = $1, subscription_confidence = $2, 
          is_anomaly = $3, anomaly_score = $4, anomaly_confidence = $5, risk_level = $6,
          ml_signals = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND user_id = $9
      RETURNING *`,
      [
        is_subscription ? 1 : 0,
        subscription_confidence,
        is_anomaly ? 1 : 0,
        anomaly_score,
        anomaly_confidence,
        risk_level,
        ml_signals ? JSON.stringify(ml_signals) : null,
        id,
        userId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const updated = result.rows[0];
    res.json(updated);
  } catch (error) {
    console.error('Error updating transaction ML scores:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
