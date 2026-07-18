'use client';

import { useState } from 'react';
import { CategoryStat } from '@/lib/api';

interface CategoryDonutProps {
  data: CategoryStat[];
  size?: number;
}

const COLORS = [
  '#22304A', // navy
  '#3D7368', // sub teal
  '#B85C38', // risk clay
  '#5B7FA6', // muted blue
  '#7A6E5F', // warm brown
  '#4A7C68', // forest teal
  '#8B6F5E', // terracotta
  '#3A5A78', // slate blue
  '#6B5E8C', // muted purple
  '#7D9070', // sage green
];

function polarToCart(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCart(cx, cy, r, startAngle);
  const end = polarToCart(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export default function CategoryDonut({ data, size = 200 }: CategoryDonutProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3E6068', fontSize: 14 }}>
        No data yet
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 10;
  const innerR = outerR * 0.62;
  const total = data.reduce((s, d) => s + d.total, 0);

  // Build arcs
  let currentAngle = 0;
  const arcs = data.map((item, i) => {
    const pct = item.total / total;
    const sweep = pct * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweep - 1; // 1-degree gap
    currentAngle += sweep;
    return { ...item, startAngle, endAngle, pct, color: COLORS[i % COLORS.length], i };
  });

  const hoveredItem = hovered !== null ? arcs[hovered] : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      {/* Donut */}
      <div style={{ flexShrink: 0 }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible' }}
        >
          <defs>
            {arcs.map((arc) => (
              <filter key={arc.i} id={`glow-${arc.i}`}>
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {arcs.map((arc) => {
            const isHovered = hovered === arc.i;
            const r = isHovered ? outerR + 6 : outerR;
            return (
              <path
                key={arc.i}
                d={arcPath(cx, cy, r, arc.startAngle, arc.endAngle)}
                fill="none"
                stroke={arc.color}
                strokeWidth={isHovered ? 22 : 18}
                strokeLinecap="round"
                style={{
                  cursor: 'pointer',
                  transition: 'stroke-width 0.2s ease, r 0.2s ease',
                  filter: isHovered ? `url(#glow-${arc.i})` : 'none',
                  opacity: hovered !== null && !isHovered ? 0.4 : 1,
                }}
                onMouseEnter={() => setHovered(arc.i)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* Center label */}
          <text x={cx} y={cy - 10} textAnchor="middle" fontSize={14} fontWeight={700} fill="#1C1C1A">
            {hoveredItem
              ? `$${hoveredItem.total.toFixed(0)}`
              : `$${total.toFixed(0)}`}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={11} fill="#6B6A64">
            {hoveredItem ? hoveredItem.category : '30-day total'}
          </text>
          {hoveredItem && (
            <text x={cx} y={cy + 28} textAnchor="middle" fontSize={13} fontWeight={600} fill={hoveredItem.color}>
              {(hoveredItem.pct * 100).toFixed(1)}%
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ flex: 1, minWidth: 120 }}>
        {arcs.slice(0, 7).map((arc) => (
          <div
            key={arc.i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '5px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              opacity: hovered !== null && hovered !== arc.i ? 0.5 : 1,
              transition: 'opacity 0.2s',
              background: hovered === arc.i ? 'rgba(0,0,0,0.04)' : 'transparent',
            }}
            onMouseEnter={() => setHovered(arc.i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              style={{
                width: 10, height: 10,
                borderRadius: '50%',
                background: arc.color,
                flexShrink: 0,
                boxShadow: hovered === arc.i ? `0 0 8px ${arc.color}` : 'none',
              }}
            />
            <div style={{ fontSize: 13, color: '#6B6A64', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {arc.category}
            </div>
            <div style={{ fontSize: 13, color: '#1C1C1A', fontFamily: "'IBM Plex Mono',monospace", fontVariantNumeric:'tabular-nums', fontWeight: 600, flexShrink: 0 }}>
              ${arc.total.toFixed(0)}
            </div>
          </div>
        ))}
        {arcs.length > 7 && (
          <div style={{ fontSize: 12, color: '#6B6A64', padding: '4px 8px' }}>
            +{arcs.length - 7} more categories
          </div>
        )}
      </div>
    </div>
  );
}



