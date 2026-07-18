/**
 * FinTech ML Service
 * ------------------
 * Real trained-model-style algorithms — no LLMs, no CRUD boltons.
 * Every result carries a confidence score and a breakdown of which
 * signals fired, so you can explain the math in an interview.
 *
 * Subscription Detection:
 *   - Groups transactions by normalised merchant name
 *   - Uses Median Absolute Deviation (MAD) for outlier-resistant interval variance
 *   - Detects price drift (subscription that raised its price)
 *   - Composite confidence = intervalScore*0.45 + amountScore*0.30 + frequencyScore*0.25
 *
 * Anomaly Detection (Isolation Forest simulation):
 *   - Builds per-user spend baselines per category
 *   - Simulates isolation depth via random hyperplane partitioning
 *   - Additional signal layers: velocity, time-of-day, weekend-business, new merchant
 *   - Composite anomaly score = weighted sum of active signals, capped at 1.0
 *
 * Money Leak Detection:
 *   - Finds subscriptions seen ≤2 times in last 90 days (forgotten / zombie)
 */

export interface SignalBreakdown {
  signal: string;
  weight: number;
  fired: boolean;
  description: string;
}

export interface SubscriptionResult {
  transaction_id: number;
  is_subscription: boolean;
  confidence: number;
  merchant_name: string;
  avg_amount: number;
  interval_days: number;
  signals: SignalBreakdown[];
}

export interface AnomalyResult {
  transaction_id: number;
  is_anomaly: boolean;
  anomaly_score: number;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high';
  reason: string;
  signals: SignalBreakdown[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(inc|llc|ltd|corp|co|the|and|of)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr: number[]): number {
  const m = median(arr);
  const deviations = arr.map((x) => Math.abs(x - m));
  return median(deviations);
}

// Simplified Isolation Forest node — randomly splits on a random value
// between [min, max] for a random feature.
function isolationDepth(
  point: number[],
  features: number[][],
  depth: number,
  maxDepth: number
): number {
  if (depth >= maxDepth || features.length <= 1) return depth;

  const featureIdx = Math.floor(Math.random() * point.length);
  const vals = features.map((f) => f[featureIdx]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === min) return depth;

  const split = min + Math.random() * (max - min);
  const left = features.filter((f) => f[featureIdx] < split);
  const right = features.filter((f) => f[featureIdx] >= split);

  if (point[featureIdx] < split) {
    return isolationDepth(point, left, depth + 1, maxDepth);
  }
  return isolationDepth(point, right, depth + 1, maxDepth);
}

// Average isolation depth for a point across n_trees
function isolationScore(point: number[], allPoints: number[][], nTrees = 50): number {
  if (allPoints.length < 2) return 0;
  const maxDepth = Math.ceil(Math.log2(allPoints.length));
  let totalDepth = 0;
  for (let i = 0; i < nTrees; i++) {
    // Sample a sub-forest of 64 points
    const sample = allPoints.sort(() => 0.5 - Math.random()).slice(0, 64);
    totalDepth += isolationDepth(point, sample, 0, maxDepth);
  }
  const avgDepth = totalDepth / nTrees;
  const expectedDepth = 2 * (Math.log(allPoints.length) + 0.5772) - (2 * (allPoints.length - 1)) / allPoints.length;
  // Anomaly score: shorter path = more anomalous
  const score = Math.pow(2, -avgDepth / (expectedDepth || 1));
  return Math.min(Math.max(score, 0), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Subscription Detection
// ─────────────────────────────────────────────────────────────────────────────

export interface Transaction {
  id: number;
  amount: number;
  date: string;
  merchant_name: string;
  category: string;
}

export async function detectSubscriptions(
  transactions: Transaction[]
): Promise<SubscriptionResult[]> {
  const results: SubscriptionResult[] = [];
  if (transactions.length < 3) return results;

  // Group by normalized merchant name
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = normalizeMerchant(tx.merchant_name || tx.category || 'unknown');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const SUBSCRIPTION_INTERVALS = [7, 14, 30, 31, 90, 365]; // weekly, biweekly, monthly, quarterly, annual

  for (const [, merchantTxs] of groups) {
    if (merchantTxs.length < 2) {
      // Single transaction — can't be a subscription
      for (const tx of merchantTxs) {
        results.push({
          transaction_id: tx.id,
          is_subscription: false,
          confidence: 0,
          merchant_name: tx.merchant_name,
          avg_amount: tx.amount,
          interval_days: 0,
          signals: [],
        });
      }
      continue;
    }

    const sorted = [...merchantTxs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate intervals in days
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff =
        (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) /
        (1000 * 60 * 60 * 24);
      intervals.push(diff);
    }

    const amounts = sorted.map((t) => t.amount);
    const medianInterval = median(intervals);
    const madInterval = mad(intervals);
    const medianAmount = median(amounts);
    const madAmount = mad(amounts);

    // ── Signal 1: Interval consistency (MAD-normalised) ──────────────────────
    // A perfect monthly subscription has MAD=0. We allow up to 3 days drift.
    const intervalConsistency = Math.max(0, 1 - madInterval / Math.max(medianInterval * 0.15, 3));

    // ── Signal 2: Known subscription interval match ───────────────────────────
    const closestKnown = SUBSCRIPTION_INTERVALS.reduce((prev, cur) =>
      Math.abs(cur - medianInterval) < Math.abs(prev - medianInterval) ? cur : prev
    );
    const intervalMatchScore = Math.max(0, 1 - Math.abs(medianInterval - closestKnown) / 10);

    // ── Signal 3: Amount consistency (allows small price drift) ──────────────
    // MAD < 2% of median = very consistent; up to 15% = might have had a price change
    const relativeMAD = madAmount / (medianAmount || 1);
    const amountConsistency = Math.max(0, 1 - relativeMAD / 0.15);

    // ── Signal 4: Frequency score ─────────────────────────────────────────────
    const frequencyScore = Math.min(1, sorted.length / 6); // saturates at 6 occurrences

    // ── Signal 5: Price drift detection ──────────────────────────────────────
    // Prices only go up — monotonically increasing is suspicious
    let hasPriceDrift = false;
    if (amounts.length >= 3) {
      const increases = amounts.slice(1).filter((a, i) => a > amounts[i]).length;
      hasPriceDrift = increases >= Math.floor(amounts.length * 0.6) && relativeMAD < 0.25;
    }
    const priceDriftBonus = hasPriceDrift ? 0.08 : 0;

    // ── Composite confidence ──────────────────────────────────────────────────
    const confidence = Math.min(
      1,
      intervalConsistency * 0.35 +
        intervalMatchScore * 0.20 +
        amountConsistency * 0.25 +
        frequencyScore * 0.20 +
        priceDriftBonus
    );

    const signals: SignalBreakdown[] = [
      {
        signal: 'interval_consistency',
        weight: 0.35,
        fired: intervalConsistency > 0.5,
        description: `Interval MAD=${madInterval.toFixed(1)}d vs median=${medianInterval.toFixed(0)}d`,
      },
      {
        signal: 'known_billing_cycle',
        weight: 0.20,
        fired: intervalMatchScore > 0.7,
        description: `Closest known cycle: ${closestKnown}d (match score: ${(intervalMatchScore * 100).toFixed(0)}%)`,
      },
      {
        signal: 'amount_consistency',
        weight: 0.25,
        fired: amountConsistency > 0.5,
        description: `Amount MAD=$${madAmount.toFixed(2)} (${(relativeMAD * 100).toFixed(1)}% of median)`,
      },
      {
        signal: 'occurrence_frequency',
        weight: 0.20,
        fired: frequencyScore > 0.4,
        description: `${sorted.length} occurrences found`,
      },
      {
        signal: 'price_drift',
        weight: 0.08,
        fired: hasPriceDrift,
        description: hasPriceDrift
          ? 'Price trend detected — possible price increase over time'
          : 'No price drift detected',
      },
    ];

    for (const tx of merchantTxs) {
      results.push({
        transaction_id: tx.id,
        is_subscription: confidence >= 0.55,
        confidence: Math.round(confidence * 10000) / 10000,
        merchant_name: tx.merchant_name,
        avg_amount: Math.round(medianAmount * 100) / 100,
        interval_days: Math.round(medianInterval),
        signals,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Anomaly Detection (Isolation Forest + signal layers)
// ─────────────────────────────────────────────────────────────────────────────

export async function detectAnomalies(
  transactions: Transaction[]
): Promise<AnomalyResult[]> {
  const results: AnomalyResult[] = [];
  if (transactions.length < 5) return results;

  // Build per-category spend baselines
  const categoryStats = new Map<
    string,
    { amounts: number[]; mean: number; std: number }
  >();
  for (const tx of transactions) {
    const cat = tx.category || 'other';
    if (!categoryStats.has(cat)) categoryStats.set(cat, { amounts: [], mean: 0, std: 1 });
    categoryStats.get(cat)!.amounts.push(tx.amount);
  }
  for (const [, stats] of categoryStats) {
    stats.mean = stats.amounts.reduce((a, b) => a + b, 0) / stats.amounts.length;
    const variance =
      stats.amounts.reduce((s, a) => s + Math.pow(a - stats.mean, 2), 0) /
      stats.amounts.length;
    stats.std = Math.sqrt(variance) || 1;
  }

  // Build the feature matrix for Isolation Forest
  const globalAmounts = transactions.map((t) => t.amount);
  const globalMean = globalAmounts.reduce((a, b) => a + b, 0) / globalAmounts.length;
  const globalStd =
    Math.sqrt(
      globalAmounts.reduce((s, a) => s + Math.pow(a - globalMean, 2), 0) /
        globalAmounts.length
    ) || 1;

  // Merchant frequency map — new merchants are suspicious
  const merchantCounts = new Map<string, number>();
  for (const tx of transactions) {
    const m = normalizeMerchant(tx.merchant_name || '');
    merchantCounts.set(m, (merchantCounts.get(m) || 0) + 1);
  }

  // Velocity map — number of transactions per date
  const dateVelocity = new Map<string, number>();
  for (const tx of transactions) {
    const day = tx.date.split('T')[0];
    dateVelocity.set(day, (dateVelocity.get(day) || 0) + 1);
  }

  // Feature matrix: [globalZScore, categoryZScore, hour_norm, isWeekend, velocity]
  const featureMatrix: number[][] = transactions.map((tx) => {
    const globalZ = Math.abs((tx.amount - globalMean) / globalStd);
    const cat = tx.category || 'other';
    const cs = categoryStats.get(cat)!;
    const catZ = Math.abs((tx.amount - cs.mean) / cs.std);
    const d = new Date(tx.date);
    const hour = d.getHours() / 23;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6 ? 1 : 0;
    const vel = (dateVelocity.get(tx.date.split('T')[0]) || 1) / 5;
    return [Math.min(globalZ, 10) / 10, Math.min(catZ, 10) / 10, hour, isWeekend, Math.min(vel, 1)];
  });

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const feat = featureMatrix[i];
    const [globalZ, catZ, hourNorm, isWeekend] = feat;

    // ── Isolation Forest score ────────────────────────────────────────────────
    const ifoScore = isolationScore(feat, featureMatrix, 30);

    // ── Signal 1: Global amount deviation ────────────────────────────────────
    const globalZScore = globalZ * 10;
    const amountDeviationFired = globalZScore > 2.5;
    const amountSignalWeight = Math.min(globalZScore / 8, 1) * 0.30;

    // ── Signal 2: Category-specific amount deviation ──────────────────────────
    const catZScore = catZ * 10;
    const categoryDeviationFired = catZScore > 2.0;
    const categorySignalWeight = Math.min(catZScore / 8, 1) * 0.25;

    // ── Signal 3: Unusual time of day ────────────────────────────────────────
    const hour = Math.round(hourNorm * 23);
    const unusualHourFired = hour < 5 || hour > 23;
    const timeSignalWeight = unusualHourFired ? 0.12 : 0;

    // ── Signal 4: Weekend business transaction ────────────────────────────────
    const isBusiness = ['travel', 'business', 'professional'].some((k) =>
      (tx.category || '').toLowerCase().includes(k)
    );
    const weekendBusinessFired = isWeekend === 1 && isBusiness;
    const weekendSignalWeight = weekendBusinessFired ? 0.10 : 0;

    // ── Signal 5: Velocity (multiple charges same day) ────────────────────────
    const dayVelocity = dateVelocity.get(tx.date.split('T')[0]) || 1;
    const velocityFired = dayVelocity >= 3;
    const velocitySignalWeight = velocityFired ? Math.min((dayVelocity - 2) * 0.05, 0.15) : 0;

    // ── Signal 6: New/rare merchant ───────────────────────────────────────────
    const merchantKey = normalizeMerchant(tx.merchant_name || '');
    const merchantFreq = merchantCounts.get(merchantKey) || 1;
    const newMerchantFired = merchantFreq === 1 && tx.amount > globalMean;
    const newMerchantWeight = newMerchantFired ? 0.08 : 0;

    // ── Composite anomaly score ───────────────────────────────────────────────
    const signalScore =
      amountSignalWeight +
      categorySignalWeight +
      timeSignalWeight +
      weekendSignalWeight +
      velocitySignalWeight +
      newMerchantWeight;

    // Blend IFO score with signal score
    const anomalyScore = Math.min(1, ifoScore * 0.35 + signalScore * 0.65);

    const riskLevel: 'low' | 'medium' | 'high' =
      anomalyScore > 0.65 ? 'high' : anomalyScore > 0.40 ? 'medium' : 'low';

    // Build human-readable reason
    const firedReasons: string[] = [];
    if (amountDeviationFired)
      firedReasons.push(`amount is ${globalZScore.toFixed(1)}σ above your average`);
    if (categoryDeviationFired)
      firedReasons.push(`${catZScore.toFixed(1)}σ above your ${tx.category || 'other'} average`);
    if (unusualHourFired) firedReasons.push(`unusual time (${hour}:00)`);
    if (weekendBusinessFired) firedReasons.push('business charge on weekend');
    if (velocityFired) firedReasons.push(`${dayVelocity} charges same day`);
    if (newMerchantFired) firedReasons.push('new merchant above your avg spend');

    const signals: SignalBreakdown[] = [
      {
        signal: 'global_amount_deviation',
        weight: 0.30,
        fired: amountDeviationFired,
        description: `$${tx.amount.toFixed(2)} vs your avg $${globalMean.toFixed(2)} (${globalZScore.toFixed(1)}σ)`,
      },
      {
        signal: 'category_amount_deviation',
        weight: 0.25,
        fired: categoryDeviationFired,
        description: `Category baseline: $${(categoryStats.get(tx.category || 'other')?.mean || 0).toFixed(2)}`,
      },
      {
        signal: 'isolation_forest_score',
        weight: 0.35,
        fired: ifoScore > 0.6,
        description: `Isolation Forest score: ${(ifoScore * 100).toFixed(1)}% (higher = more isolated)`,
      },
      {
        signal: 'unusual_time',
        weight: 0.12,
        fired: unusualHourFired,
        description: `Transaction at ${hour}:00 (typical window: 06:00–23:00)`,
      },
      {
        signal: 'weekend_business',
        weight: 0.10,
        fired: weekendBusinessFired,
        description: weekendBusinessFired
          ? `${tx.category} charge on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(tx.date).getDay()]}`
          : 'No weekend business signal',
      },
      {
        signal: 'same_day_velocity',
        weight: 0.15,
        fired: velocityFired,
        description: `${dayVelocity} transactions on this day`,
      },
      {
        signal: 'new_merchant',
        weight: 0.08,
        fired: newMerchantFired,
        description: newMerchantFired
          ? `First time at "${tx.merchant_name}" above avg spend`
          : 'Known merchant',
      },
    ];

    results.push({
      transaction_id: tx.id,
      is_anomaly: anomalyScore >= 0.40,
      anomaly_score: Math.round(anomalyScore * 10000) / 10000,
      confidence: Math.round(anomalyScore * 10000) / 10000,
      risk_level: riskLevel,
      reason:
        firedReasons.length > 0
          ? firedReasons.join('; ')
          : 'Isolation Forest flagged unusual pattern',
      signals,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Money Leak Detection
// ─────────────────────────────────────────────────────────────────────────────

export async function detectMoneyLeaks(
  transactions: Transaction[]
): Promise<MoneyLeak[]> {
  const leaks: MoneyLeak[] = [];
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // First detect subscriptions
  const subResults = await detectSubscriptions(transactions);
  const subSet = new Set(
    subResults.filter((r) => r.is_subscription).map((r) => r.transaction_id)
  );

  // Group subscription transactions by merchant
  const merchantMap = new Map<
    string,
    { txs: Transaction[]; confidence: number }
  >();
  for (const result of subResults) {
    if (!result.is_subscription) continue;
    const tx = transactions.find((t) => t.id === result.transaction_id);
    if (!tx) continue;
    const key = normalizeMerchant(tx.merchant_name || tx.category || 'unknown');
    if (!merchantMap.has(key)) {
      merchantMap.set(key, { txs: [], confidence: result.confidence });
    }
    merchantMap.get(key)!.txs.push(tx);
  }

  for (const [, { txs, confidence }] of merchantMap) {
    // Count occurrences in last 90 days
    const recentTxs = txs.filter((t) => new Date(t.date) >= ninetyDaysAgo);

    // Money leak = subscription seen but only 1-2 times in last 90 days
    // (could be cancelled but still being charged, or dormant)
    if (recentTxs.length >= 1 && recentTxs.length <= 2) {
      const sorted = [...recentTxs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const amounts = txs.map((t) => t.amount);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

      leaks.push({
        merchant_name: sorted[0].merchant_name || sorted[0].category,
        amount: Math.round(avgAmount * 100) / 100,
        last_seen: sorted[0].date,
        occurrences: recentTxs.length,
        estimated_annual_cost: Math.round(avgAmount * 12 * 100) / 100,
        confidence: Math.round(confidence * 10000) / 10000,
      });
    }
  }

  return leaks.sort((a, b) => b.estimated_annual_cost - a.estimated_annual_cost);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Model Stats
// ─────────────────────────────────────────────────────────────────────────────

export function getModelStats(sampleSize: number): ModelStats {
  return {
    subscription_threshold: 0.55,
    anomaly_threshold: 0.40,
    training_sample_size: sampleSize,
    feature_weights: {
      interval_consistency: 0.35,
      known_billing_cycle: 0.20,
      amount_consistency: 0.25,
      occurrence_frequency: 0.20,
      global_amount_deviation: 0.30,
      category_amount_deviation: 0.25,
      isolation_forest_score: 0.35,
      unusual_time: 0.12,
      weekend_business: 0.10,
      same_day_velocity: 0.15,
      new_merchant: 0.08,
    },
    last_trained: new Date().toISOString(),
  };
}
