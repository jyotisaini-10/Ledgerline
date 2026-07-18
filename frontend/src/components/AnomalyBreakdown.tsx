'use client';

import { useState } from 'react';

export interface SignalBreakdown {
  signal: string;
  weight: number;
  fired: boolean;
  description: string;
}

interface AnomalyBreakdownProps {
  signals: SignalBreakdown[];
  anomalyScore: number;
  reason: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  global_amount_deviation: 'Amount Deviation',
  category_amount_deviation: 'Category Deviation',
  isolation_forest_score: 'Isolation Forest',
  unusual_time: 'Unusual Time',
  weekend_business: 'Weekend Business',
  same_day_velocity: 'Transaction Velocity',
  new_merchant: 'New Merchant',
  interval_consistency: 'Interval Consistency',
  known_billing_cycle: 'Known Billing Cycle',
  amount_consistency: 'Amount Consistency',
  occurrence_frequency: 'Occurrence Frequency',
  price_drift: 'Price Drift',
};

const SIGNAL_ICONS: Record<string, string> = {
  global_amount_deviation: '💰',
  category_amount_deviation: '📊',
  isolation_forest_score: '🌲',
  unusual_time: '🕐',
  weekend_business: '📅',
  same_day_velocity: '⚡',
  new_merchant: '🔍',
  interval_consistency: '🔄',
  known_billing_cycle: '📆',
  amount_consistency: '💱',
  occurrence_frequency: '🔢',
  price_drift: '📈',
};

export default function AnomalyBreakdown({ signals, anomalyScore, reason }: AnomalyBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const firedSignals = signals.filter((s) => s.fired);
  const maxWeight = Math.max(...signals.map((s) => s.weight), 0.01);

  return (
    <div>
      {/* Collapsed summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          padding: '8px 0',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ flex: 1, fontSize: 13, color: '#8AAFB6' }}>
          {firedSignals.length > 0 ? (
            <span>
              {firedSignals.slice(0, 3).map((s) => SIGNAL_ICONS[s.signal] || '⚠️').join(' ')}{' '}
              {firedSignals.length} signal{firedSignals.length !== 1 ? 's' : ''} fired
            </span>
          ) : (
            <span style={{ color: '#3E6068' }}>Isolation Forest pattern</span>
          )}
        </div>
        <span style={{ color: '#3E6068', fontSize: 12, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </div>

      {/* Reason summary */}
      <div style={{ fontSize: 12, color: '#3E6068', marginBottom: expanded ? 12 : 0, lineHeight: 1.5 }}>
        {reason}
      </div>

      {/* Expanded signal breakdown */}
      {expanded && (
        <div
          style={{
            marginTop: 8,
            padding: 14,
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3E6068', marginBottom: 12 }}>
            Signal Breakdown
          </div>
          {signals.map((signal, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{SIGNAL_ICONS[signal.signal] || '⚡'}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: signal.fired ? '#E8F4F6' : '#3E6068',
                    flex: 1,
                  }}
                >
                  {SIGNAL_LABELS[signal.signal] || signal.signal}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: signal.fired
                      ? signal.weight > 0.25 ? '#E8685A' : '#FFC64F'
                      : 'rgba(255,255,255,0.04)',
                    color: signal.fired
                      ? signal.weight > 0.25 ? '#E8685A' : '#FFC64F'
                      : '#3E6068',
                  }}
                >
                  {signal.fired ? `+${(signal.weight * 100).toFixed(0)}%` : 'NOT FIRED'}
                </span>
              </div>

              {/* Weight bar */}
              <div className="score-bar" style={{ marginLeft: 22 }}>
                <div
                  className="score-bar-fill"
                  style={{
                    width: `${(signal.weight / maxWeight) * 100}%`,
                    background: signal.fired
                      ? signal.weight > 0.25
                        ? '#E8685A'
                        : '#FFC64F'
                      : '#3E6068',
                    opacity: signal.fired ? 1 : 0.3,
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ fontSize: 11, color: '#3E6068', marginLeft: 22, marginTop: 3 }}>
                {signal.description}
              </div>
            </div>
          ))}

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.07)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
            }}
          >
            <span style={{ color: '#3E6068' }}>Composite anomaly score</span>
            <span style={{ fontWeight: 700, color: anomalyScore > 0.65 ? '#E8685A' : anomalyScore > 0.4 ? '#FFC64F' : 'var(--success)' }}>
              {(anomalyScore * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}



