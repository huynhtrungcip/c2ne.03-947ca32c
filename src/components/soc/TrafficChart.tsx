import { Area, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, ComposedChart } from 'recharts';
import { TrafficData } from '@/types/soc';
import { useMemo } from 'react';

interface TrafficChartProps {
  data: TrafficData[];
}

// Format helpers — switch label between time-only and date+time depending on span.
const formatTick = (d: Date, multiDay: boolean) => {
  if (multiDay) {
    return d.toLocaleString('en-US', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const TrafficChart = ({ data }: TrafficChartProps) => {
  const { chartData, stats } = useMemo(() => {
    if (data.length === 0) return { chartData: [], stats: null };

    const first = data[0].timestamp.getTime();
    const last = data[data.length - 1].timestamp.getTime();
    const multiDay = last - first > 24 * 3600_000;

    const cd = data.map((d) => ({
      time: formatTick(d.timestamp, multiDay),
      traffic: d.total,
      alerts: d.alerts,
    }));

    const totals = data.map((d) => d.total);
    const alerts = data.map((d) => d.alerts);
    const sumT = totals.reduce((a, b) => a + b, 0);
    const peakT = Math.max(...totals);
    const peakA = Math.max(...alerts);
    const sumA = alerts.reduce((a, b) => a + b, 0);
    const avgT = sumT / totals.length;
    const alertRate = sumT > 0 ? (sumA / sumT) * 100 : 0;

    // Trend: compare last 25% avg vs first 25% avg.
    const q = Math.max(1, Math.floor(totals.length / 4));
    const firstQ = totals.slice(0, q).reduce((a, b) => a + b, 0) / q;
    const lastQ = totals.slice(-q).reduce((a, b) => a + b, 0) / q;
    const trend = firstQ > 0 ? ((lastQ - firstQ) / firstQ) * 100 : 0;

    return {
      chartData: cd,
      stats: {
        peakT,
        avgT: avgT.toFixed(1),
        peakA,
        alertRate: alertRate.toFixed(1),
        trend,
      },
    };
  }, [data]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="soc-section-title mb-0">Traffic & Alerts</div>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[hsl(var(--chart-1))]" /> Traffic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[hsl(var(--soc-alert))]" /> Alerts
          </span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data available.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 14, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="alertsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--soc-alert))" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="hsl(var(--soc-alert))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="hsl(var(--border))"
                strokeOpacity={0.45}
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                minTickGap={48}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={36}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '2px',
                  color: 'hsl(var(--foreground))',
                  fontSize: '11px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  padding: '6px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '10px', marginBottom: 4 }}
              />
              <Area
                type="monotone"
                dataKey="traffic"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill="url(#trafficGradient)"
                name="Traffic"
                dot={false}
                activeDot={{ fill: 'hsl(var(--chart-1))', stroke: 'hsl(var(--background))', strokeWidth: 2, r: 4 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="alerts"
                stroke="hsl(var(--soc-alert))"
                strokeWidth={2}
                fill="url(#alertsGradient)"
                name="Alerts"
                dot={false}
                activeDot={{ fill: 'hsl(var(--soc-alert))', stroke: 'hsl(var(--background))', strokeWidth: 2, r: 4 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {stats && (
            <div className="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-border/40">
              <Stat label="Traffic Peak" value={String(stats.peakT)} />
              <Stat label="Traffic Avg" value={String(stats.avgT)} />
              <Stat label="Alert Peak" value={String(stats.peakA)} accent="alert" />
              <Stat label="Alert Rate" value={`${stats.alertRate}%`} accent="alert" />
              <Stat
                label="Trend"
                value={`${stats.trend >= 0 ? '▲' : '▼'} ${Math.abs(stats.trend).toFixed(0)}%`}
                accent={stats.trend >= 0 ? 'alert' : 'good'}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: 'alert' | 'good' }) => (
  <div>
    <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
    <div
      className={`text-base font-mono font-semibold tabular-nums ${
        accent === 'alert' ? 'text-[hsl(var(--soc-alert))]' : accent === 'good' ? 'text-[hsl(var(--soc-success))]' : 'text-foreground'
      }`}
    >
      {value}
    </div>
  </div>
);
