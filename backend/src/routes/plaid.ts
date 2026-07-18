import express from 'express';
import { Configuration, PlaidApi, PlaidEnvironments, CountryCode, Products } from 'plaid';
import { query } from '../db';
import { authenticateToken } from './auth';

const router = express.Router();

// ─── Initialize Plaid client (only if credentials are configured) ────────────
let plaidClient: PlaidApi | null = null;

if (process.env.PLAID_CLIENT_ID && process.env.PLAID_CLIENT_ID !== 'your_plaid_client_id') {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  plaidClient = new PlaidApi(configuration);
  console.log('✓ Plaid client initialized');
} else {
  console.log('ℹ Plaid not configured — use /api/seed for demo data instead');
}

function requirePlaid(res: any): boolean {
  if (!plaidClient) {
    res.status(503).json({
      error: 'Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in .env, or use /api/seed for demo data.',
    });
    return false;
  }
  return true;
}

// ─── Create link token ────────────────────────────────────────────────────────
router.post('/create-link-token', authenticateToken, async (req: any, res) => {
  if (!requirePlaid(res)) return;
  try {
    const userId = req.user.userId;
    const response = await plaidClient!.linkTokenCreate({
      user: { client_user_id: userId.toString() },
      client_name: 'FinTech Intelligence',
      products: ['transactions'] as Products[],
      country_codes: ['US'] as CountryCode[],
      language: 'en',
      redirect_uri: process.env.PLAID_REDIRECT_URI,
    });
    res.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// ─── Exchange public token for access token ───────────────────────────────────
router.post('/exchange-token', authenticateToken, async (req: any, res) => {
  if (!requirePlaid(res)) return;
  try {
    const userId = req.user.userId;
    const { public_token } = req.body;

    const response = await plaidClient!.itemPublicTokenExchange({ public_token });
    const access_token = response.data.access_token;
    const item_id = response.data.item_id;

    const itemResponse = await plaidClient!.itemGet({ access_token });
    const institution_name = itemResponse.data.item.institution_id || 'Unknown';

    const db = (await import('../db')).default;
    db.prepare(
      'INSERT INTO plaid_items (user_id, item_id, access_token, institution_name) VALUES (?, ?, ?, ?) ON CONFLICT (item_id) DO UPDATE SET access_token = excluded.access_token, updated_at = CURRENT_TIMESTAMP'
    ).run(userId, item_id, access_token, institution_name);

    res.json({ message: 'Token exchanged successfully' });
  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// ─── Sync transactions from Plaid ─────────────────────────────────────────────
router.post('/sync-transactions', authenticateToken, async (req: any, res) => {
  if (!requirePlaid(res)) return;
  try {
    const userId = req.user.userId;

    const itemsResult = query('SELECT access_token FROM plaid_items WHERE user_id = ?', [userId]);
    if (itemsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No linked bank accounts. Connect via Plaid or use /api/seed.' });
    }

    const db = (await import('../db')).default;
    const insertStmt = db.prepare(`
      INSERT INTO transactions (user_id, plaid_transaction_id, amount, currency, merchant_name, category, date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (plaid_transaction_id) DO NOTHING
    `);

    let totalCount = 0;
    for (const item of itemsResult.rows as any[]) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      const endDate = new Date();

      const txResponse = await plaidClient!.transactionsGet({
        access_token: item.access_token,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      });

      for (const tx of txResponse.data.transactions) {
        insertStmt.run(
          userId,
          tx.transaction_id,
          tx.amount,
          tx.iso_currency_code || 'USD',
          tx.merchant_name || tx.name,
          tx.category ? tx.category[0] : null,
          tx.date,
          tx.name
        );
        totalCount++;
      }
    }

    res.json({ message: 'Transactions synced successfully', count: totalCount });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

export default router;
