'use client';

import { useState } from 'react';
import {
  DollarSign, BarChart2, TreePine, Clock, Calendar,
  Zap, Search, RefreshCw, Repeat, ArrowUpDown, Hash, TrendingUp,
  ChevronDown,
} from 'lucide-react';

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

// Design tokens (mirrored from Dashboard.tsx)
const D = {
  bg:      '#FAF9F6',
  surface: '#F1F0EC',
  ink:     '#1C1C1A',
  muted:   '#6B6A64',
  teal:    '#3D7368',
  clay:    '#B85C38',
  navy:    '#22304A',
  rule:    '#E4E2DC',
  mono:    "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
};

const SIGNAL_LABELS: Record<string, string> = {
  global_amount_deviation:   'Amount Deviation',
  category_amount_deviation: 'Category Deviation',
  isolation_forest_score:    'Isolation Forest',
  unusual_time:              'Unusual Time',
  weekend_business:          'Weekend Business',
  same_day_velocity:         'Transaction Velocity',
  new_merchant:              'New Merchant',
  interval_consistency:      'Interval Consistency',
  known_billing_cycle:       'Known Billing Cycle',
  amount_consistency:        'Amount Consistency',
  occurrence_frequency:      'Occurrence Frequency',
  price_drift:               'Price Drift',
};

const SIGNAL_ICONS: Record<string, React.ReactNode> = {
  global_amount_deviation:   <DollarSign  size={13} strokeWidth={1.75} />,
  category_amount_deviation: <BarChart2   size={13} strokeWidth={1.75} />,
  isolation_forest_score:    <TreePine    size={13} strokeWidth={1.75} />,
  unusual_time:              <Clock       size={13} strokeWidth={1.75} />,
  weekend_business:          <Calendar    size={13} strokeWidth={1.75} />,
  same_day_velocity:         <Zap         size={13} strokeWidth={1.75} />,
  new_merchant:              <Search      size={13} strokeWidth={1.75} />,
  interval_consistency:      <Repeat      size={13} strokeWidth={1.75} />,
  known_billing_cycle:       <RefreshCw   size={13} strokeWidth={1.75} />,
  amount_consistency:        <ArrowUpDown size={13} strokeWidth={1.75} />,
  occurrence_frequency:      <Hash        size={13} strokeWidth={1.75} />,
  price_drift:               <TrendingUp  size={13} strokeWidth={1.75} />,
};

export default function AnomalyBreakdown({ signals, anomalyScore, reason }: AnomalyBreakdownProps) {
  const [expanded, setExpanded] = useState(false);
  const firedSignals = signals.filter((s) => s.fired);

  return (
    <div>
      {/* Collapsed summary row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          padding: '6px 0',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ flex: 1, fontSize: 12, color: D.muted }}>
          {firedSignals.length > 0 ? (
            <span>
              {firedSignals.length} signal{firedSignals.length !== 1 ? 's' : ''} fired —{' '}
              {firedSignals.slice(0, 2).map((s) => SIGNAL_LABELS[s.signal] || s.signal).join(', ')}
              {firedSignals.length > 2 && ` +${firedSignals.length - 2} more`}
            </span>
          ) : (
            <span>Isolation Forest pattern</span>
          )}
        </div>
        <span
          style={{
            color: D.muted,
            display: 'inline-flex',
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        >
          <ChevronDown size={14} strokeWidth={1.75} />
        </span>
      </div>

      {/* Reason line */}
      <div style={{ fontSize: 12, color: D.clay, marginBottom: expanded ? 10 : 0, lineHeight: 1.5 }}>
        {reason}
      </div>

      {/* Expanded signal breakdown */}
      {expanded && (
        <div
          style={{
            marginTop: 8,
            padding: '12px 14px',
            background: D.surface,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: D.muted,
              marginBottom: 10,
            }}
          >
            Signal Breakdown
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {signals.map((signal, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  borderBottom: i < signals.length - 1 ? `1px solid ${D.rule}` : 'none',
                }}
              >
                {/* Icon */}
                <span
                  style={{
                    color: signal.fired ? D.clay : D.muted,
                    flexShrink: 0,
                    display: 'inline-flex',
                  }}
                >
                  {SIGNAL_ICONS[signal.signal] || <Zap size={13} strokeWidth={1.75} />}
                </span>

                {/* Label */}
                <span
                  style={{
                    fontSize: 13,
                    color: signal.fired ? D.ink : D.muted,
                    fontWeight: signal.fired ? 600 : 400,
                    flex: 1,
                  }}
                >
                  {SIGNAL_LABELS[signal.signal] || signal.signal}
                </span>

                {/* Weight value — monospace, no bar */}
                <span
                  style={{
                    fontFamily: D.mono,
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 12,
                    fontWeight: 600,
                    color: signal.fired ? D.clay : D.muted,
                    minWidth: 40,
                    textAlign: 'right',
                  }}
                >
                  {signal.fired ? `+${(signal.weight * 100).toFixed(0)}%` : '—'}
                </span>
              </div>
            ))}
          </div>

          {/* Composite score */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: `1px solid ${D.rule}`,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <span style={{ color: D.muted }}>Composite anomaly score</span>
            <span
              style={{
                fontFamily: D.mono,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
                fontSize: 14,
                color:
                  anomalyScore > 0.65
                    ? D.clay
                    : anomalyScore > 0.4
                    ? D.navy
                    : D.teal,
              }}
            >
              {(anomalyScore * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
