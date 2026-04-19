import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { SOCEvent } from '@/types/soc';

interface EventsRatePanelProps {
  events: SOCEvent[];
  windowMinutes?: number;
}

export const EventsRatePanel = ({ events, windowMinutes = 30 }: EventsRatePanelProps) => {
  const { data, total, peak, alerts } = useMemo(() => {
    const now = Date.now();
    const bucketMs = 60 * 1000; // 1 minute buckets
    const buckets: { t: number; total: number; alerts: number }[] = [];
    for (let i = windowMinutes - 1; i >= 0; i--) {
      buckets.push({ t: now - i * bucketMs, total: 0, alerts: 0 });
    }
    let totalCount = 0;
    let alertCount = 0;
    for (const ev of events) {
      const ts = ev.timestamp.getTime();
      const idx = windowMinutes - 1 - Math.floor((now - ts) / bucketMs);
      if (idx >= 0 && idx < windowMinutes) {
        buckets[idx].total += 1;
        if (ev.verdict === 'ALERT') buckets[idx].alerts += 1;
        totalCount += 1;
        if (ev.verdict === 'ALERT') alertCount += 1;
      }
    }
    const peakVal = buckets.reduce((m, b) => Math.max(m, b.total), 0);
    return { data: buckets, total: totalCount, peak: peakVal, alerts: alertCount };
  }, [events, windowMinutes]);

  const avg = (total / windowMinutes).toFixed(1);

  return (
    <div className="p-3 border border-border rounded-md bg-card">
      <div className="text-[10px] uppercase tracking-wider mb-2 text-muted-foreground flex items-center justify-between">
        <span>Events Rate</span>
        <span className="text-[8px] font-mono tracking-normal normal-case text-muted-foreground/70">
          {windowMinutes}m
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground/70">Avg/min</div>
          <div className="text-[13px] font-mono font-semibold text-foreground tabular-nums">{avg}</div>
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
