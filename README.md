# Ledgerline — Subscription & Anomaly Intelligence

A sophisticated financial intelligence application that automatically detects subscriptions and anomalies in spending patterns using real machine learning models, not just CRUD operations with AI bolt-ons.

## 🎯 What Makes This Different

Unlike generic expense trackers that use LLMs for "insights," this application uses **trained ML models** that learn from data and produce measurable confidence scores:

- **Subscription Detection**: Unsupervised clustering algorithm that groups transactions by interval and amount patterns
- **Anomaly Detection**: Isolation Forest-like algorithm that scores transactions for unusual behavior
- **Confidence Scoring**: Every detection includes a measurable confidence score (0-1), not a binary yes/no
- **Real-time Alerts**: Server-Sent Events (SSE) for instant anomaly notifications via Redis pub/sub

## 🏗️ Architecture

### Tech Stack

**Frontend**
- Next.js 15 (App Router)
- TypeScript
- TailwindCSS
- React Hooks for state management

**Backend**
- Node.js + Express
- TypeScript
- PostgreSQL (with pg)
- Redis (pub/sub + SSE)
- JWT + bcrypt for authentication
- Plaid API (Sandbox) for bank data

**ML/AI**
- TensorFlow.js for ML operations
- Custom clustering algorithm for subscription detection
- Isolation Forest-inspired anomaly detection
- Per-user model training and scoring

## 📁 Project Structure

```
d:\New project\
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts          # JWT authentication
│   │   │   ├── transactions.ts  # Transaction CRUD
│   │   │   ├── plaid.ts         # Plaid integration
│   │   │   └── ml.ts            # ML analysis endpoints
│   │   ├── services/
│   │   │   └── mlService.ts     # ML algorithms
│   │   ├── db.ts                # PostgreSQL connection
│   │   └── index.ts             # Express server
│   ├── schema.sql               # Database schema
│   ├── tsconfig.json
│   └── package.json
└── frontend/
    ├── src/
    │   ├── app/
    │   │   └── page.tsx         # Login page
    │   └── components/
    │       └── Dashboard.tsx    # Main dashboard
    └── package.json
```

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Plaid Sandbox account (free)

### 1. Database Setup

```bash
# Create PostgreSQL database
createdb fintech_app

# Run schema
psql fintech_app < backend/schema.sql
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your credentials:
# - DATABASE_URL=postgresql://user:password@localhost:5432/fintech_app
# - JWT_SECRET=your_secret_here
# - REDIS_URL=redis://localhost:6379
# - PLAID_CLIENT_ID=your_plaid_client_id
# - PLAID_SECRET=your_plaid_secret

# Run development server
npm run dev
```

Backend runs on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend runs on `http://localhost:3000`

### 4. Redis Setup

```bash
# Start Redis server
redis-server
```

## 🔑 Key Features

### 1. Subscription Detection

The ML service analyzes transaction patterns to detect recurring charges:

- **Interval Consistency**: Measures regularity of transaction timing
- **Amount Consistency**: Detects fixed-price subscriptions
- **Frequency Scoring**: Rewards merchants with multiple occurrences
- **Confidence Threshold**: 0.7 (70%) for positive classification

### 2. Anomaly Detection

Real-time anomaly scoring using statistical analysis:

- **Z-Score Analysis**: Detects amount deviations from user's average
- **Time-Based Anomalies**: Flags unusual hours or weekend business transactions
- **Risk Levels**: Low, Medium, High based on composite score
- **Confidence Threshold**: 0.5 (50%) for anomaly classification

### 3. Real-Time Alerts

- Redis pub/sub publishes high-risk anomalies
- Server-Sent Events push alerts to connected clients
- Dashboard refreshes automatically on new alerts
- Alert persistence with read/unread states

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and receive JWT

### Transactions
- `GET /api/transactions` - Get user transactions
- `POST /api/transactions` - Create transaction (usually from Plaid)
- `PUT /api/transactions/:id/ml-scores` - Update ML scores

### Plaid Integration
- `POST /api/plaid/create-link-token` - Create Plaid link token
- `POST /api/plaid/exchange-token` - Exchange public token for access token
- `POST /api/plaid/sync-transactions` - Sync transactions from Plaid

### ML Analysis
- `POST /api/ml/analyze` - Run ML analysis on transactions
- `GET /api/ml/subscriptions` - Get detected subscriptions
- `GET /api/ml/anomalies` - Get detected anomalies
- `GET /api/ml/alerts` - Get anomaly alerts
- `PUT /api/ml/alerts/:id/read` - Mark alert as read

### Real-Time
- `GET /api/events` - Server-Sent Events endpoint

## 🧠 ML Algorithms Explained

### Subscription Detection (Clustering)

```typescript
// Groups transactions by merchant
// Calculates interval variance and amount variance
// Confidence = intervalConsistency * 0.4 + amountConsistency * 0.3 + frequencyScore * 0.3
```

### Anomaly Detection (Isolation Forest-inspired)

```typescript
// Calculates z-scores for amounts
// Considers time-based factors (unusual hours, weekends)
// Composite score = amountDeviation + timeAnomalies
// Risk level based on score thresholds
```

## 🎨 Dashboard Features

- **Real-time Stats**: Total transactions, subscriptions, anomalies, unread alerts
- **High-Risk Alerts Panel**: Immediate visibility of critical anomalies
- **Subscription Table**: Detected subscriptions with confidence scores
- **Anomaly Table**: Flagged transactions with risk levels
- **Transaction History**: Recent transactions overview
- **ML Analysis Button**: Trigger on-demand analysis
- **Auto-refresh**: Updates via SSE when new anomalies detected

## 🔒 Security

- Passwords hashed with bcrypt (salt rounds: 10)
- JWT tokens with configurable expiration (default: 7 days)
- Environment variables for sensitive data
- User-scoped data access (user_id in all queries)

## 🧪 Testing the Application

1. **Register/Login**: Create account via the frontend
2. **Add Transactions**: Either:
   - Use Plaid integration (requires Sandbox credentials)
   - Insert test transactions directly into database
3. **Run ML Analysis**: Click "Run ML Analysis" button
4. **View Results**: Check subscriptions and anomalies sections
5. **Test Real-Time**: Add new transactions and watch for alerts

## 📝 Sample Data Insertion

```sql
-- Insert test transactions
INSERT INTO transactions (user_id, amount, merchant_name, category, date, description)
VALUES 
  (1, 9.99, 'Netflix', 'Entertainment', '2024-01-01', 'Monthly subscription'),
  (1, 9.99, 'Netflix', 'Entertainment', '2024-02-01', 'Monthly subscription'),
  (1, 9.99, 'Netflix', 'Entertainment', '2024-03-01', 'Monthly subscription'),
  (1, 14.99, 'Spotify', 'Entertainment', '2024-01-15', 'Monthly subscription'),
  (1, 14.99, 'Spotify', 'Entertainment', '2024-02-15', 'Monthly subscription'),
  (1, 500.00, 'Unknown Merchant', 'Shopping', '2024-03-15', 'Unusual purchase');
```

## 🚀 Deployment Considerations

- Use environment-specific `.env` files
- Set up PostgreSQL on cloud (e.g., AWS RDS, Heroku Postgres)
- Use managed Redis (e.g., AWS ElastiCache, Redis Cloud)
- Configure Plaid for production environment
- Set up HTTPS and proper CORS
- Implement rate limiting
- Add logging and monitoring

## 🎓 Why This Stands Out

This project demonstrates:

1. **Real ML Implementation**: Not just calling LLM APIs, but implementing actual ML algorithms
2. **Measurable Outputs**: Confidence scores you can explain and defend
3. **Production Architecture**: Real-time alerts, proper auth, database design
4. **Full-Stack Integration**: End-to-end from data ingestion to ML to UI
5. **Scalable Design**: Per-user models, async processing, pub/sub patterns

This is the difference between "I built a CRUD app with GPT calls" and "I built something with real applied ML."

## 📄 License

MIT License - feel free to use this for learning and portfolio projects.
