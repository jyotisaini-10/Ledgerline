/**
 * Typed API client — all backend calls go through here.
 * Token is injected automatically from localStorage.
 */

const PRODUCTION_API = 'https://ledgerline-4lnt.onrender.com';
const BASE = (process.env.NEXT_PUBLIC_API_URL || PRODUCTION_API).replace(/\/$/, '');

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  login: (email: string, password: string) =>
    apiFetch<{ token: string; user: { id: number; email: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    apiFetch<{ token: string; user: { id: number; email: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
};

// ─── Transactions ─────────────────────────────────────────────────────────────
export interface Transaction {
  id: number;
  amount: number;
  merchant_name: string;
  category: string;
  date: string;
  description: string;
  is_subscription: number | boolean;
  subscription_confidence: number;
  is_anomaly: number | boolean;
  anomaly_score: number;
  anomaly_confidence: number;
  risk_level: 'low' | 'medium' | 'high';
  ml_signals?: string;
}

export interface DailyStat    { day: string; total: number; count: number; }
export interface MonthlyStat  { month: string; total: number; count: number; }
export interface CategoryStat { category: string; total: number; count: number; avg_amount: number; }
export interface SummaryStats {
  total_transactions: number;
  subscription_count: number;
  anomaly_count: number;
  total_spent: number;
  avg_transaction_amount: number;
}

export const transactions = {
  list: (params?: { limit?: number; is_anomaly?: boolean; is_subscription?: boolean; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit)          qs.set('limit',           String(params.limit));
    if (params?.is_anomaly     !== undefined) qs.set('is_anomaly',      String(params.is_anomaly));
    if (params?.is_subscription !== undefined) qs.set('is_subscription', String(params.is_subscription));
    if (params?.search)         qs.set('search',          params.search);
    return apiFetch<Transaction[]>(`/api/transactions?${qs}`);
  },
  summary:    () => apiFetch<SummaryStats>('/api/transactions/stats/summary'),
  daily:      () => apiFetch<DailyStat[]>('/api/transactions/stats/daily'),
  monthly:    () => apiFetch<MonthlyStat[]>('/api/transactions/stats/monthly'),
  categories: () => apiFetch<CategoryStat[]>('/api/transactions/stats/categories'),
};

// ─── ML ───────────────────────────────────────────────────────────────────────
export interface Alert {
  id: number;
  alert_type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  merchant_name: string;
  amount: number;
  date: string;
  category: string;
  is_read: number | boolean;
  ml_signals?: string;
  created_at: string;
}

export interface MoneyLeak {
  merchant_name: string;
  amount: number;
  last_seen: string;
  occurrences: number;
  estimated_annual_cost: number;
  confidence: number;
}

export interface ModelStats {
  subscription_threshold: number;
  anomaly_threshold: number;
  training_sample_size: number;
  feature_weights: Record<string, number>;
  last_trained: string;
}

export interface ModelPerformance {
  note: string;
  precision: number;
  recall: number;
  f1_score: number;
  false_positive_rate: number;
  support: number;
  evaluated_at: string;
}

export interface RetrainDiff {
  before: { anomaly_threshold: number; subscription_threshold: number; training_sample_size: number };
  after:  { anomaly_threshold: number; subscription_threshold: number; training_sample_size: number };
  changed: string[];
}

export interface Feedback {
  transaction_id: number;
  feedback: 'positive' | 'negative';
}

export const ml = {
  analyze: () =>
    apiFetch<{ message: string; subscriptions: number; anomalies: number; money_leaks: number; new_alerts: number }>(
      '/api/ml/analyze', { method: 'POST' }
    ),
  alerts:      () => apiFetch<Alert[]>('/api/ml/alerts'),
  subscriptions: () => apiFetch<Transaction[]>('/api/ml/subscriptions'),
  anomalies:   () => apiFetch<Transaction[]>('/api/ml/anomalies'),
  moneyLeaks:  () => apiFetch<MoneyLeak[]>('/api/ml/money-leaks'),
  modelStats:  () => apiFetch<ModelStats>('/api/ml/model-stats'),
  performance: () => apiFetch<ModelPerformance>('/api/ml/performance'),
  retrain:     () => apiFetch<{ message: string; diff: RetrainDiff }>('/api/ml/retrain', { method: 'POST' }),
  feedback: (transactionId: number, feedback: 'positive' | 'negative') =>
    apiFetch<{ message: string }>('/api/ml/feedback', {
      method: 'POST',
      body: JSON.stringify({ transactionId, feedback }),
    }),
  getFeedback: () => apiFetch<Feedback[]>('/api/ml/feedback'),
  markRead:    (id: number) => apiFetch(`/api/ml/alerts/${id}/read`, { method: 'PUT' }),
  markAllRead: () => apiFetch('/api/ml/alerts/read-all', { method: 'PUT' }),
  exportAnomaliesUrl: () => `${BASE}/api/ml/export-anomalies`,
};

// ─── Seed ─────────────────────────────────────────────────────────────────────
export const seed = {
  load: () =>
    apiFetch<{ message: string; transactions_inserted: number }>('/api/seed', { method: 'POST' }),
};
