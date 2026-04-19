import { useMemo } from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';
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
  // Compute percentage for the radial gauge.
  // 'total' kind shows 100% of itself; 'sources' uses unique src IPs cap; others = % of all events.
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

  const data = [{ name: label, value: pct, fill: accent }];

  return (
    <div
      className="bg-card p-4 flex items-center gap-4"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      {/* Radial gauge */}
      <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="72%"
            outerRadius="100%"
            barSize={6}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={3}
              background={{ fill: 'hsl(var(--muted))' }}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className="text-[10px] font-mono font-semibold tabular-nums"
            style={{ color: accent }}
          >
            {kind === 'total' ? '100' : pct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Right: label + value + delta */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider mb-1 text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold font-mono tabular-nums text-foreground leading-tight">
          {value.toLocaleString()}
        </div>
        {delta && (
          <div className="text-[10px] font-mono mt-0.5" style={{ color: accent }}>
            {delta}
          </div>
        )}
      </div>
    </div>
  );
};
