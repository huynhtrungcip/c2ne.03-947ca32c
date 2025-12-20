import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Line, ComposedChart } from 'recharts';
import { TrafficData } from '@/types/soc';

interface TrafficChartProps {
  data: TrafficData[];
}

export const TrafficChart = ({ data }: TrafficChartProps) => {
  const chartData = data.map(d => ({
    time: d.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    total: d.total,
    alerts: d.alerts
  }));

  return (
    <div>
      <div className="soc-section-title">Traffic & Attacks</div>
      
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
          No data available.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="time" 
              tick={{ fill: '#d4d4d8', fontSize: 11 }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={false}
            />
            <YAxis 
              tick={{ fill: '#d4d4d8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#09090b',
                border: '1px solid #27272a',
                borderRadius: '4px',
                color: '#e5e7eb',
                fontSize: '12px'
              }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#trafficGradient)"
              name="Traffic"
              dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
              activeDot={{ fill: '#3b82f6', strokeWidth: 2, stroke: '#fff', r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="alerts"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', strokeWidth: 0, r: 3 }}
              activeDot={{ fill: '#ef4444', strokeWidth: 2, stroke: '#fff', r: 5 }}
              name="Alerts"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
