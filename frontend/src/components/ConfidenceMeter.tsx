'use client';

import { useEffect, useState } from 'react';

interface ConfidenceMeterProps {
  value: number; // 0–1
  size?: number;
  label?: string;
  showPercent?: boolean;
}

/** Returns a CSS color based on confidence value */
function confidenceColor(v: number): string {
  if (v >= 0.80) return '#3D7368'; // teal
  if (v >= 0.60) return '#22304A'; // navy
  if (v >= 0.40) return '#B85C38'; // clay
  return '#B85C38';
}

function confidenceLabel(v: number): string {
  if (v >= 0.80) return 'High';
  if (v >= 0.60) return 'Medium';
  if (v >= 0.40) return 'Low';
  return 'Very Low';
}

export default function ConfidenceMeter({
  value,
  size = 80,
  label,
  showPercent = true,
}: ConfidenceMeterProps) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 100);
    return () => clearTimeout(t);
  }, [value]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  // Arc spans 220 degrees (from -110° to +110° relative to bottom)
  // 0% = leftmost point, 100% = rightmost point
  const startAngle = 130; // degrees from top
  const endAngle = 410;   // startAngle + 280
  const totalSweep = 280;

  function polar(angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  function describeArc(start: number, end: number) {
    const s = polar(start);
    const e = polar(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const fillAngle = startAngle + animated * totalSweep;
  const color = confidenceColor(value);
  const circumference = 2 * Math.PI * r;
  const strokeLength = (totalSweep / 360) * circumference;
  const fillLength = (animated * totalSweep / 360) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`meter-grad-${size}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#B85C38" />
            <stop offset="50%" stopColor="#22304A" />
            <stop offset="100%" stopColor="#3D7368" />
          </linearGradient>
        </defs>

        {/* Track */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke="#E4E2DC"
          strokeWidth={6}
          strokeLinecap="round"
        />

        {/* Fill */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${fillLength} ${strokeLength}`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s' }}
        />

        {/* Needle dot */}
        {animated > 0 && (
          <>
            <circle
              cx={polar(startAngle + animated * totalSweep).x}
              cy={polar(startAngle + animated * totalSweep).y}
              r={4}
              fill={color}
            />
            <circle
              cx={polar(startAngle + animated * totalSweep).x}
              cy={polar(startAngle + animated * totalSweep).y}
              r={8}
              fill={color}
              fillOpacity={0.2}
            />
          </>
        )}

        {/* Center value */}
        {showPercent && (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.22}
            fontWeight={800}
            fill={color}
          >
            {Math.round(value * 100)}%
          </text>
        )}
      </svg>

      {label && (
        <div style={{ fontSize: 11, color: '#6B6A64', textAlign: 'center' }}>{label}</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 600, color, textAlign: 'center' }}>{confidenceLabel(value)}</div>
    </div>
  );
}



