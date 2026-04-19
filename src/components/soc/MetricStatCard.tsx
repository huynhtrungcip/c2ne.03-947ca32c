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
  accent: string;
  kind: MetricKind;
  events: SOCEvent[];
  delta?: string;
  windowMinutes?: number;
}

const buildSeries = (events: SOCEvent[], kind: MetricKind, windowMinutes: number) => {
  const now = Date.now();
  const bucketMs = 60 * 1000;
  const buckets: { v: number }[] = [];
  for (let i = windowMinutes - 1; i >= 0; i--) buckets.push({ v: 0 });
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
      case 'total': match = true; break;
      case 'alert': match = v === 'ALERT'; break;
      case 'suspicious': match = v === 'SUSPICIOUS'; break;
      case 'false_positive': match = v === 'FALSE_POSITIVE'; break;
      case 'sources':
        ipSets[idx]?.add(ev.src_ip);
        continue;
    }
    if (match) buckets[idx].v += 1;
  }
  if (kind === 'sources') ipSets.forEach((s, i) => (buckets[i].v = s.size));
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

  const gradId = `stat-grad-${kind}`;

  return (
    <div className="relative overflow-hidden bg-card h-[110px] flex flex-col">
      {/* Foreground content - centered like Grafana Stat */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 pt-3">
        <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div
          className="text-[28px] font-semibold font-mono tabular-nums leading-none mt-1"
          style={{ color: accent }}
        >
          {value.toLocaleString()}
        </div>
        {delta && (
          <div className="text-[9px] font-mono mt-1 text-muted-foreground">
            {delta}
          </div>
        )}
      </div>

      {/* Sparkline area — fills bottom ~35% like Grafana Stat panel */}
      <div className="absolute inset-x-0 bottom-0 h-[38%] pointer-events-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 'dataMax + 1']} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={accent}
              strokeWidth={1}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
