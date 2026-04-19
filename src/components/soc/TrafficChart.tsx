import { Bar, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart } from 'recharts';
import { TrafficData } from '@/types/soc';

interface TrafficChartProps {
  data: TrafficData[];
}

// Datadog/Grafana-style: discrete bars per bucket. No smoothing, no fake curves.
// Two stacked series: total traffic (cool) + alerts (red) overlaid.
export const TrafficChart = ({ data }: TrafficChartProps) => {
  const chartData = data.map(d => ({
    time: d.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    benign: Math.max(0, d.total - d.alerts),
    alerts: d.alerts,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="soc-section-title mb-0">Traffic & Alerts</div>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[1px] bg-[hsl(var(--chart-1))]" /> Traffic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[1px] bg-[hsl(var(--soc-alert))]" /> Alerts
          </span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data available.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
            barCategoryGap="18%"
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="hsl(var(--border))"
              strokeOpacity={0.4}
              vertical={false}
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
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--primary) / 0.08)' }}
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
              formatter={(value: number, name: string) => {
                const label = name === 'benign' ? 'Traffic' : 'Alerts';
                return [value, label];
              }}
            />
            {/* Stacked: benign traffic on bottom, alerts on top */}
            <Bar
              dataKey="benign"
              stackId="events"
              fill="hsl(var(--chart-1))"
              fillOpacity={0.85}
              isAnimationActive={false}
              maxBarSize={18}
            />
            <Bar
              dataKey="alerts"
              stackId="events"
              fill="hsl(var(--soc-alert))"
              fillOpacity={0.95}
              isAnimationActive={false}
              maxBarSize={18}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
