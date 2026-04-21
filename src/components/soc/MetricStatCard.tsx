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
  /** Number of cells in the heatmap (defaults to 40). */
  buckets?: number;
}

const N_DEFAULT = 40;

// Format a duration in ms as a compact label (e.g. "30m", "2h", "1d", "5d").
const fmtSpan = (ms: number): string => {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
};
const fmtBucket = (ms: number): string => fmtSpan(ms);

/**
 * Build a bucketed time series across the full span of the supplied events.
 * Anchor = newest event (so the rightmost cell is always populated).
 * Returns counts per bucket plus the bucket size in ms for tooltip labels.
 */
const buildSeries = (events: SOCEvent[], kind: MetricKind, nBuckets: number) => {
  if (events.length === 0) {
    return { buckets: new Array(nBuckets).fill(0) as number[], bucketMs: 60_000, spanMs: 0 };
  }
  const ts = events.map((e) => e.timestamp.getTime());
  const newest = Math.max(...ts);
  const oldest = Math.min(...ts);
  const spanMs = Math.max(60_000, newest - oldest);
  const bucketMs = Math.max(1000, Math.ceil(spanMs / nBuckets));
  const startMs = newest - bucketMs * nBuckets + bucketMs; // align so newest sits in last bucket

  const buckets: number[] = new Array(nBuckets).fill(0);
  const ipSets: Set<string>[] =
    kind === 'sources' ? buckets.map(() => new Set<string>()) : [];

  for (const ev of events) {
    const idx = Math.floor((ev.timestamp.getTime() - startMs) / bucketMs);
    if (idx < 0 || idx >= nBuckets) continue;

    if (kind === 'sources') {
      ipSets[idx].add(ev.src_ip);
      continue;
    }
    const v = (ev.verdict || '').toUpperCase();
    let match = false;
    switch (kind) {
      case 'total': match = true; break;
      case 'alert': match = v === 'ALERT'; break;
      case 'suspicious': match = v === 'SUSPICIOUS'; break;
      case 'false_positive': match = v === 'FALSE_POSITIVE'; break;
    }
    if (match) buckets[idx] += 1;
  }
  if (kind === 'sources') ipSets.forEach((s, i) => (buckets[i] = s.size));
  return { buckets, bucketMs, spanMs };
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
  buckets = N_DEFAULT,
}: MetricStatCardProps) => {
  const { buckets: series, bucketMs, spanMs } = useMemo(
    () => buildSeries(events, kind, buckets),
    [events, kind, buckets]
  );

  const max = Math.max(1, ...series);
  const peak = Math.max(...series);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hoverInfo = hoverIdx !== null ? {
    bucketsAgo: series.length - 1 - hoverIdx,
    count: series[hoverIdx],
  } : null;

  const spanLabel = spanMs > 0 ? fmtSpan(spanMs) : '—';
  const bucketLabel = fmtBucket(bucketMs);

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
            ? `${hoverInfo.bucketsAgo === 0 ? 'latest' : `-${hoverInfo.bucketsAgo}·${bucketLabel}`} · ${hoverInfo.count} ${kind === 'sources' ? 'IPs' : 'events'}`
            : `Peak ${peak}/${bucketLabel} · span ${spanLabel}`}
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
                title={`${series.length - 1 - i === 0 ? 'latest' : `-${series.length - 1 - i}·${bucketLabel}`}: ${v} ${kind === 'sources' ? 'IPs' : 'events'}`}
              />
            );
          })}
        </div>

        {/* Legend - GitHub style */}
        <div className="flex items-center justify-between mt-1.5 text-[8px] font-mono text-muted-foreground/70">
          <span>-{spanLabel}</span>
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
