'use client';

interface LedgerlineLogoProps {
  /** Total width of the logo mark (the icon only, not the wordmark) */
  size?: number;
  /** Show the wordmark next to the icon */
  wordmark?: boolean;
  /** Override icon color */
  color?: string;
}

/**
 * LedgerLine logo mark.
 *
 * Icon concept: a stylised capital "L" built from two thick strokes —
 * a vertical bar and a horizontal ledger line — with a subtle second
 * hairline rule that evokes an actual ledger page. All geometry is
 * constructed on a 24×24 grid so it scales cleanly at any size.
 */
export default function LedgerlineLogo({
  size = 24,
  wordmark = false,
  color = '#22304A',
}: LedgerlineLogoProps) {
  const s = size / 24; // scale factor

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: wordmark ? Math.round(size * 0.42) : 0,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {/* ── Icon mark ────────────────────────────────── */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block', flexShrink: 0 }}
      >
        {/* Vertical bar of the "L" */}
        <rect x="4" y="3" width="3.5" height="14" rx="1.2" fill={color} />

        {/* Horizontal base of the "L" */}
        <rect x="4" y="14.5" width="12" height="3" rx="1.2" fill={color} />

        {/* Primary ledger hairline — cuts across at mid-height */}
        <rect
          x="9"
          y="9.5"
          width="11"
          height="1.25"
          rx="0.6"
          fill={color}
          opacity="0.35"
        />

        {/* Secondary ledger hairline — lower */}
        <rect
          x="9"
          y="13"
          width="7.5"
          height="1"
          rx="0.5"
          fill={color}
          opacity="0.2"
        />

        {/* Rising trend tick — top-right corner: two short diagonal dots */}
        <circle cx="18.5" cy="5.5" r="1.1" fill={color} opacity="0.7" />
        <circle cx="16"  cy="7.5" r="1.1" fill={color} opacity="0.5" />
        <circle cx="13.5" cy="6.5" r="1.1" fill={color} opacity="0.35" />
      </svg>

      {/* ── Wordmark ──────────────────────────────────── */}
      {wordmark && (
        <span
          style={{
            fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
            fontSize: Math.round(size * 0.58),
            fontWeight: 800,
            color,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          Ledgerline
        </span>
      )}
    </span>
  );
}
