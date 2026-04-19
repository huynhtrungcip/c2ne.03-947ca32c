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
      className="relative overflow-hidden bg-card p-4"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      {/* Sparkline background - Grafana stat panel style */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none opacity-90">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 'dataMax + 1']} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={accent}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Foreground */}
      <div className="relative z-10">
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
