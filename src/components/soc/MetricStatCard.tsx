import { useMemo } from 'react';
import { SOCEvent } from '@/types/soc';

export type MetricKind =
  | 'total'
  | 'alert'
  | 'suspicious'
  | 'false_positive'
  | 'sources';

interface MetricStatCardProps {
  label: string;
  value: number;
  accent: string;
  kind: MetricKind;
  events: SOCEvent[];
  delta?: string;
  /** Total to compute percentage against. */
  total?: number;
}

type StatusLevel = 'NORMAL' | 'WARN' | 'CRIT';

// Threshold logic per metric kind.
// Returns the status based on the value (or % of total for verdicts).
const computeStatus = (
  kind: MetricKind,
  value: number,
  pct: number
): StatusLevel => {
  switch (kind) {
    case 'alert':
      // % of total events
      if (pct >= 20) return 'CRIT';
      if (pct >= 5) return 'WARN';
      return 'NORMAL';
    case 'suspicious':
      if (pct >= 30) return 'CRIT';
      if (pct >= 10) return 'WARN';
      return 'NORMAL';
    case 'false_positive':
      if (pct >= 20) return 'WARN';
      return 'NORMAL';
    case 'sources':
      if (value >= 500) return 'CRIT';
      if (value >= 100) return 'WARN';
      return 'NORMAL';
    case 'total':
    default:
      return 'NORMAL';
  }
};

const STATUS_COLORS: Record<StatusLevel, string> = {
  NORMAL: 'hsl(var(--soc-success))',
  WARN: 'hsl(var(--soc-warning))',
  CRIT: 'hsl(var(--soc-alert))',
};

export const MetricStatCard = ({
  label,
  value,
  accent,
  kind,
  events,
  delta,
  total,
}: MetricStatCardProps) => {
  const pct = useMemo(() => {
    const denom = total ?? events.length;
    if (!denom) return 0;
    return (value / denom) * 100;
  }, [value, events.length, total]);

  const status = computeStatus(kind, value, pct);
  const statusColor = STATUS_COLORS[status];
  // For TOTAL & SOURCES (no real threshold semantics), use accent for the number.
  const valueColor = kind === 'total' ? accent : statusColor;

  return (
    <div
      className="bg-card p-4 flex flex-col justify-between gap-2 relative overflow-hidden"
      style={{
        borderTop: `2px solid ${valueColor}`,
        // Very subtle status tint on background (only if not NORMAL)
        backgroundColor:
          status === 'CRIT'
            ? 'color-mix(in hsl, hsl(var(--card)) 92%, hsl(var(--soc-alert)))'
            : status === 'WARN'
            ? 'color-mix(in hsl, hsl(var(--card)) 94%, hsl(var(--soc-warning)))'
            : undefined,
      }}
    >
      {/* Top row: label + status tag */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        {kind !== 'total' && (
          <span
            className="text-[8px] font-mono font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded-sm"
            style={{
              color: statusColor,
              backgroundColor: `color-mix(in hsl, transparent, ${statusColor} 14%)`,
              border: `1px solid color-mix(in hsl, transparent, ${statusColor} 35%)`,
            }}
          >
            {status}
          </span>
        )}
      </div>

      {/* Value */}
      <div
        className="text-[28px] font-semibold font-mono tabular-nums leading-none"
        style={{ color: valueColor }}
      >
        {value.toLocaleString()}
      </div>

      {/* Bottom: delta or % of total */}
      <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
        {kind === 'total' || kind === 'sources'
          ? delta || '\u00A0'
          : `${pct.toFixed(1)}% of total${delta ? ` · ${delta}` : ''}`}
      </div>
    </div>
  );
};
