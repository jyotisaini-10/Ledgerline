'use client';

import { useEffect, useRef, useState } from 'react';
import { DailyStat } from '../../lib/api';

interface SpendingChartProps {
  data: DailyStat[];
  height?: number;
}

const PADDING = { top: 20, right: 16, bottom: 40, left: 60 };

export default function SpendingChart({ data, height = 220 }: SpendingChartProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: string; total: number } | null>(null);
  const [animated, setAnimated] = useState(false);

  // Animate the path on mount / data change
  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6A64', fontSize: 14 }}>
        No data yet — load demo data and run analysis
      </div>
    );
  }

  // Fill missing days with 0
  const allDays: DailyStat[] = [];
  if (data.length > 0) {
    const start = new Date(data[0].day);
    const end = new Date(data[data.length - 1].day);
    const dayMap = new Map(data.map((d) => [d.day, d]));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      allDays.push(dayMap.get(key) || { day: key, total: 0, count: 0 });
    }
  }

  const W = 600; // internal SVG width (viewBox)
  const H = height;
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const maxVal = Math.max(...allDays.map((d) => d.total), 1);
  const minVal = 0;

  const toX = (i: number) => PADDING.left + (i / (allDays.length - 1)) * chartW;
  const toY = (v: number) => PADDING.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  // Build SVG path
  const points = allDays.map((d, i) => ({ x: toX(i), y: toY(d.total), ...d }));

  // Smooth cubic bezier path
  const linePath = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x},${p.y}`;
      const prev = points[i - 1];
      const cpX = (prev.x + p.x) / 2;
      return `C ${cpX},${prev.y} ${cpX},${p.y} ${p.x},${p.y}`;
    })
    .join(' ');

  // Area fill path
  const areaPath = `${linePath} L ${points[points.length - 1].x},${H - PADDING.bottom} L ${PADDING.left},${H - PADDING.bottom} Z`;

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: minVal + t * (maxVal - minVal),
    y: PADDING.top + chartH * (1 - t),
  }));

  // X-axis labels (show ~5 evenly spread)
  const labelStep = Math.max(1, Math.floor(allDays.length / 5));
  const xLabels = allDays.filter((_, i) => i % labelStep === 0 || i === allDays.length - 1);

  const pathLength = pathRef.current?.getTotalLength?.() || 1500;

  const formatCurrency = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22304A" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#22304A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22304A" />
            <stop offset="100%" stopColor="#3D7368" />
          </linearGradient>
          <clipPath id="chart-clip">
            <rect x={PADDING.left} y={PADDING.top} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              y1={tick.y}
              x2={W - PADDING.right}
              y2={tick.y}
              stroke="#E4E2DC"
              strokeWidth={1}
              strokeDasharray={i === 0 ? '0' : '4 4'}
            />
            <text
              x={PADDING.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="#6B6A64"
            >
              {formatCurrency(tick.val)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((d, i) => {
          const idx = allDays.indexOf(d);
          return (
            <text
              key={i}
              x={toX(idx)}
              y={H - PADDING.bottom + 18}
              textAnchor="middle"
              fontSize={11}
              fill="#6B6A64"
            >
              {new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </text>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#spendGrad)" clipPath="url(#chart-clip)" />

        {/* Line */}
        <path
          ref={pathRef}
          d={linePath}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#chart-clip)"
          style={
            animated
              ? { strokeDasharray: pathLength, strokeDashoffset: 0, transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }
              : { strokeDasharray: pathLength, strokeDashoffset: pathLength }
          }
        />

        {/* Hover targets */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - (chartW / allDays.length) / 2}
            y={PADDING.top}
            width={chartW / allDays.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setTooltip({ x: p.x, y: p.y, day: p.day, total: p.total })}
          />
        ))}

        {/* Hover dot */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={PADDING.top}
              x2={tooltip.x} y2={H - PADDING.bottom}
              stroke="#E4E2DC"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r={4} fill="#22304A" />
            <circle cx={tooltip.x} cy={tooltip.y} r={8} fill="#22304A" fillOpacity={0.12} />
          </>
        )}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            top: tooltip.y - 8,
            left: Math.min(tooltip.x / 600 * 100, 80) + '%',
            transform: 'translate(-50%, -100%)',
            background: '#fff',
            border: '1px solid #E4E2DC',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: 13,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ color: '#6B6A64', fontSize: 11 }}>
            {new Date(tooltip.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <div style={{ color: '#1C1C1A', fontFamily: "'IBM Plex Mono',monospace", fontVariantNumeric:'tabular-nums', fontWeight: 600 }}>
            ${tooltip.total.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}



