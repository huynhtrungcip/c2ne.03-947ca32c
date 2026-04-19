import { Area, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, ComposedChart } from 'recharts';
import { TrafficData } from '@/types/soc';

interface TrafficChartProps {
  data: TrafficData[];
}

// Grafana-style: monotone line + soft area fill + small dots at each datapoint.
export const TrafficChart = ({ data }: TrafficChartProps) => {
  const chartData = data.map(d => ({
    time: d.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    traffic: d.total,
    alerts: d.alerts,
  }));

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
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 14, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.32} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="alertsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--soc-alert))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="hsl(var(--soc-alert))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="hsl(var(--border))"
              strokeOpacity={0.45}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              minTickGap={32}
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
              strokeWidth={1.75}
              fill="url(#trafficGradient)"
              name="Traffic"
              dot={{ fill: 'hsl(var(--chart-1))', stroke: 'hsl(var(--background))', strokeWidth: 1, r: 2 }}
              activeDot={{ fill: 'hsl(var(--chart-1))', stroke: 'hsl(var(--background))', strokeWidth: 2, r: 4 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="alerts"
              stroke="hsl(var(--soc-alert))"
              strokeWidth={1.75}
              fill="url(#alertsGradient)"
              name="Alerts"
              dot={{ fill: 'hsl(var(--soc-alert))', stroke: 'hsl(var(--background))', strokeWidth: 1, r: 2 }}
              activeDot={{ fill: 'hsl(var(--soc-alert))', stroke: 'hsl(var(--background))', strokeWidth: 2, r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
