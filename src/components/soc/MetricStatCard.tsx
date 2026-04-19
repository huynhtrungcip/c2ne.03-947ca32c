import { useMemo, useState } from 'react';
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

// GitHub-style 5-level intensity
const getLevel = (v: number, max: number): 0 | 1 | 2 | 3 | 4 => {
  if (v === 0) return 0;
  const ratio = v / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
};

const LEVEL_OPACITY = [0, 0.25, 0.5, 0.75, 1];

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
  const peak = Math.max(...series);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hoverInfo = hoverIdx !== null ? {
    minuteAgo: windowMinutes - 1 - hoverIdx,
    count: series[hoverIdx],
  } : null;

  return (
    <div
      className="bg-card p-4 flex flex-col justify-between gap-2"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      {/* Top: label + value */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
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

      {/* Heatmap */}
      <div>
        {/* Hover tooltip line */}
        <div className="text-[9px] font-mono text-muted-foreground tabular-nums h-3 mb-1">
          {hoverInfo
            ? `${hoverInfo.minuteAgo === 0 ? 'now' : `${hoverInfo.minuteAgo}m ago`} · ${hoverInfo.count} events`
            : `Peak ${peak}/min · last ${windowMinutes} min`}
        </div>

        {/* Cells */}
        <div
          className="flex gap-[2px] h-3"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {series.map((v, i) => {
            const level = getLevel(v, max);
            return (
              <div
                key={i}
                className="flex-1 rounded-[1px] cursor-pointer transition-opacity"
                style={{
                  backgroundColor: level === 0
                    ? 'hsl(var(--muted))'
                    : accent,
                  opacity: level === 0 ? 0.4 : LEVEL_OPACITY[level],
                  outline: hoverIdx === i ? `1px solid ${accent}` : 'none',
                  outlineOffset: '1px',
                }}
                onMouseEnter={() => setHoverIdx(i)}
                title={`${windowMinutes - 1 - i === 0 ? 'now' : `${windowMinutes - 1 - i}m ago`}: ${v} events`}
              />
            );
          })}
        </div>

        {/* Legend - GitHub style */}
        <div className="flex items-center justify-between mt-1.5 text-[8px] font-mono text-muted-foreground/70">
          <span>-{windowMinutes}m</span>
          <div className="flex items-center gap-1">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map(level => (
              <div
                key={level}
                className="w-2 h-2 rounded-[1px]"
                style={{
                  backgroundColor: level === 0 ? 'hsl(var(--muted))' : accent,
                  opacity: level === 0 ? 0.4 : LEVEL_OPACITY[level],
                }}
              />
            ))}
            <span>More</span>
          </div>
          <span>now</span>
        </div>
      </div>
    </div>
  );
};
