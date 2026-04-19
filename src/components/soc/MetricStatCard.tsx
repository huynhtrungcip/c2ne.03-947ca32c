import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
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
  accent: string; // hex or hsl(var())
  kind: MetricKind;
  events: SOCEvent[];
  delta?: string;
  windowMinutes?: number;
}

// Build per-minute series counting events matching `kind`
const buildSeries = (events: SOCEvent[], kind: MetricKind, windowMinutes: number) => {
  const now = Date.now();
  const bucketMs = 60 * 1000;
  const buckets: { t: number; v: number }[] = [];
  for (let i = windowMinutes - 1; i >= 0; i--) {
    buckets.push({ t: now - i * bucketMs, v: 0 });
  }

  // For 'sources' we need per-bucket unique IP counts
  const ipSets: Set<string>[] = kind === 'sources'
    ? buckets.map(() => new Set<string>())
    : [];

  for (const ev of events) {
    const ts = ev.timestamp.getTime();
    const idx = windowMinutes - 1 - Math.floor((now - ts) / bucketMs);
    if (idx < 0 || idx >= windowMinutes) continue;

    const v = (ev.verdict || '').toUpperCase();
    let match = false;
    switch (kind) {
      case 'total':
        match = true;
        break;
      case 'alert':
        match = v === 'ALERT';
        break;
      case 'suspicious':
        match = v === 'SUSPICIOUS';
        break;
      case 'false_positive':
        match = v === 'FALSE_POSITIVE';
        break;
      case 'sources':
        if (ipSets[idx]) ipSets[idx].add(ev.src_ip);
        continue;
    }
    if (match) buckets[idx].v += 1;
  }

  if (kind === 'sources') {
    ipSets.forEach((s, i) => (buckets[i].v = s.size));
  }

  return buckets;
};

export const MetricStatCard = ({
  label,
  value,
  accent,
  kind,
  events,
  delta,
  windowMinutes = 30,
}: MetricStatCardProps) => {
  const series = useMemo(
    () => buildSeries(events, kind, windowMinutes),
    [events, kind, windowMinutes]
  );

  const gradId = `metric-grad-${kind}`;

  return (
    <div
      className="bg-card p-4 flex items-center justify-between gap-3"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      {/* Left: label + value + delta */}
      <div className="flex flex-col min-w-0">
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

      {/* Right: thin sparkline, no fill */}
      <div className="w-[55%] h-12 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 2 }}>
            <YAxis hide domain={[0, 'dataMax + 1']} />
            <Area
              type="linear"
              dataKey="v"
              stroke={accent}
              strokeWidth={1.25}
              fill="none"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
