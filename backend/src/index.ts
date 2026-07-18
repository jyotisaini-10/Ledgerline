import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import authRoutes from './routes/auth';
import transactionRoutes from './routes/transactions';
import plaidRoutes from './routes/plaid';
import mlRoutes from './routes/ml';
import seedRoutes from './routes/seedData';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.FRONTEND_URL || '').split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── In-memory event bus for real-time alerts (Redis-free) ───────────────────
export const alertBus = new EventEmitter();
alertBus.setMaxListeners(100);

export function emitAlert(data: object) {
  alertBus.emit('alert', data);
}

// ─── Optional Redis (graceful degradation) ────────────────────────────────────
let redisClient: any = null;
if (process.env.REDIS_URL) {
  try {
    const redis = require('redis');
    redisClient = redis.createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err: any) => {
      console.error('Redis error:', err.message);
      redisClient = null;
    });
    redisClient.connect().then(() => {
      console.log('✓ Connected to Redis');
    }).catch((err: any) => {
      console.warn('Redis unavailable, using in-memory bus:', err.message);
      redisClient = null;
    });
  } catch {
    console.warn('Redis not installed, using in-memory event bus');
  }
}

export { redisClient };

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/plaid', plaidRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/seed', seedRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: redisClient ? 'connected' : 'disabled (in-memory fallback active)',
  });
});

// ─── Server-Sent Events (works with or without Redis) ────────────────────────
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });

  // Send a heartbeat every 25 seconds to keep the connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  // Listen on the in-memory bus
  const onAlert = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  alertBus.on('alert', onAlert);

  // If Redis is available, also subscribe via Redis pub/sub
  let subscriber: any = null;
  if (redisClient) {
    subscriber = redisClient.duplicate();
    subscriber.connect().then(() => {
      subscriber.subscribe('anomaly-alerts', (message: string) => {
        res.write(`data: ${message}\n\n`);
      });
    });
  }

  req.on('close', async () => {
    clearInterval(heartbeat);
    alertBus.off('alert', onAlert);
    if (subscriber) await subscriber.disconnect().catch(() => {});
  });
});

// ─── Schema migration (add ml_signals column if missing) ─────────────────────
function runMigrations() {
  try {
    const db = require('./db').default;
    // Add ml_signals column to transactions if it doesn't exist
    try {
      db.prepare("ALTER TABLE transactions ADD COLUMN ml_signals TEXT").run();
      console.log('✓ Migration: added ml_signals column');
    } catch {
      // Column already exists — ignore
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
}

runMigrations();

app.listen(PORT, () => {
  console.log(`\n🚀 FinTech Intelligence API running on http://localhost:${PORT}`);
  console.log(`   Real-time SSE: http://localhost:${PORT}/api/events`);
  console.log(`   Health check:  http://localhost:${PORT}/health\n`);
});
