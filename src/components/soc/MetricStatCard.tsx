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
  windowMinutes?: number;
}

// Build per-minute series counting events matching `kind`
const buildSeries = (events: SOCEvent[], kind: MetricKind, windowMinutes: number) => {
  const now = Date.now();
  const bucketMs = 60 * 1000;
  const buckets: number[] = new Array(windowMinutes).fill(0);
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
    if (match) buckets[idx] += 1;
  }
  if (kind === 'sources') ipSets.forEach((s, i) => (buckets[i] = s.size));
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

  const max = Math.max(1, ...series);

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

      {/* Bottom: heatmap strip — 30 cells, intensity by event count */}
      <div>
        <div className="flex gap-[2px] h-4">
          {series.map((v, i) => {
            const intensity = v === 0 ? 0 : 0.15 + (v / max) * 0.85;
            const minuteAgo = windowMinutes - 1 - i;
            return (
              <div
                key={i}
                className="flex-1 rounded-[1px]"
                style={{
                  backgroundColor: v === 0
                    ? 'hsl(var(--muted))'
                    : accent,
                  opacity: v === 0 ? 0.4 : intensity,
                }}
                title={`${minuteAgo}m ago: ${v}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[8px] font-mono text-muted-foreground/60 tabular-nums">
          <span>-{windowMinutes}m</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
};
