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
  /** Total to compute percentage against. If omitted, falls back to events.length. */
  total?: number;
}

export const MetricStatCard = ({
  label,
  value,
  accent,
  kind,
  events,
  delta,
  total,
}: MetricStatCardProps) => {
  // Compute percentage for the bar gauge.
  const pct = useMemo(() => {
    if (kind === 'total') return 100;
    if (kind === 'sources') {
      const uniq = new Set(events.map(e => e.src_ip)).size || 1;
      return Math.min(100, (value / uniq) * 100);
    }
    const denom = total ?? events.length;
    if (!denom) return 0;
    return Math.min(100, (value / denom) * 100);
  }, [kind, value, events, total]);

  // Tick marks at 25 / 50 / 75
  const ticks = [25, 50, 75];

  return (
    <div
      className="bg-card p-4 flex flex-col justify-between gap-3"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      {/* Top: label + value + delta */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {delta && (
            <div className="text-[10px] font-mono" style={{ color: accent }}>
              {delta}
            </div>
          )}
        </div>
        <div className="text-2xl font-semibold font-mono tabular-nums text-foreground leading-tight">
          {value.toLocaleString()}
        </div>
      </div>

      {/* Bottom: bar gauge with tick marks */}
      <div>
        <div className="relative h-1.5 w-full bg-muted overflow-hidden">
          {/* Fill */}
          <div
            className="absolute inset-y-0 left-0 transition-all duration-500"
            style={{ width: `${pct}%`, background: accent }}
          />
          {/* Tick marks */}
          {ticks.map(t => (
            <div
              key={t}
              className="absolute top-0 bottom-0 w-px bg-background/60"
              style={{ left: `${t}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[8px] font-mono text-muted-foreground/60 tabular-nums">
          <span>0</span>
          <span style={{ color: accent }}>{pct.toFixed(1)}%</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
};
