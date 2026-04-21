import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { SOCEvent } from '@/types/soc';

interface EventsRatePanelProps {
  events: SOCEvent[];
  windowMinutes?: number;
}

export const EventsRatePanel = ({ events, windowMinutes = 30 }: EventsRatePanelProps) => {
  const { data, total, peak, alerts, effectiveWindow, bucketLabel } = useMemo(() => {
    if (events.length === 0) {
      return { data: [], total: 0, peak: 0, alerts: 0, effectiveWindow: windowMinutes, bucketLabel: 'min' };
    }

    // Auto-detect span: use whichever is larger between requested window and
    // actual data span, so historical-only datasets show their real activity.
    const tsList = events.map((e) => e.timestamp.getTime());
    const newest = Math.max(...tsList);
    const oldest = Math.min(...tsList);
    const spanMin = Math.max(1, Math.ceil((newest - oldest) / 60_000));

    // If data spans far more than the live window, switch to a coarser view
    // (max ~60 buckets so chart stays readable).
    const targetBuckets = 60;
    const useSpan = spanMin > windowMinutes * 2;
    const totalSpan = useSpan ? spanMin : windowMinutes;
    const bucketMs = Math.max(60_000, Math.ceil((totalSpan / targetBuckets) * 60_000));
    const numBuckets = Math.max(1, Math.ceil((totalSpan * 60_000) / bucketMs));
    const anchor = useSpan ? newest : Date.now();

    const buckets: { t: number; total: number; alerts: number }[] = [];
    for (let i = numBuckets - 1; i >= 0; i--) {
      buckets.push({ t: anchor - i * bucketMs, total: 0, alerts: 0 });
    }
    let totalCount = 0;
    let alertCount = 0;
    for (const ev of events) {
      const ts = ev.timestamp.getTime();
      const idx = numBuckets - 1 - Math.floor((anchor - ts) / bucketMs);
      if (idx >= 0 && idx < numBuckets) {
        buckets[idx].total += 1;
        if (ev.verdict === 'ALERT') buckets[idx].alerts += 1;
        totalCount += 1;
        if (ev.verdict === 'ALERT') alertCount += 1;
      }
    }
    const peakVal = buckets.reduce((m, b) => Math.max(m, b.total), 0);
    const bucketMin = Math.round(bucketMs / 60_000);
    return {
      data: buckets,
      total: totalCount,
      peak: peakVal,
      alerts: alertCount,
      effectiveWindow: totalSpan,
      bucketLabel: bucketMin >= 60 ? `${Math.round(bucketMin / 60)}h/bucket` : `${bucketMin}m/bucket`,
    };
  }, [events, windowMinutes]);

  const avgPerBucket = data.length > 0 ? (total / data.length).toFixed(1) : '0.0';
  const windowLabel = effectiveWindow >= 1440 ? `${Math.round(effectiveWindow / 1440)}d` : effectiveWindow >= 60 ? `${Math.round(effectiveWindow / 60)}h` : `${effectiveWindow}m`;

  return (
    <div className="p-3 border border-border rounded-md bg-card">
      <div className="text-[10px] uppercase tracking-wider mb-2 text-muted-foreground flex items-center justify-between">
        <span>Events Rate</span>
        <span className="text-[8px] font-mono tracking-normal normal-case text-muted-foreground/70">
          {windowLabel} · {bucketLabel}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground/70">Avg/bucket</div>
          <div className="text-[13px] font-mono font-semibold text-foreground tabular-nums">{avgPerBucket}</div>
        </div>
        <div>
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground/70">Peak</div>
          <div className="text-[13px] font-mono font-semibold text-foreground tabular-nums">{peak}</div>
        </div>
        <div>
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground/70">Alerts</div>
          <div className="text-[13px] font-mono font-semibold text-[hsl(var(--soc-alert))] tabular-nums">
            {alerts}
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ height: 70 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="evRateFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="evAlertFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--soc-alert))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--soc-alert))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 'dataMax + 1']} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 10,
                padding: '4px 8px',
              }}
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t;
                if (!t) return '';
                const d = new Date(t);
                return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
              }}
              formatter={(value: number, name: string) => [value, name === 'total' ? 'Events' : 'Alerts']}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1.5}
              fill="url(#evRateFill)"
              isAnimationActive={false}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="alerts"
              stroke="hsl(var(--soc-alert))"
              strokeWidth={1.5}
              fill="url(#evAlertFill)"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
