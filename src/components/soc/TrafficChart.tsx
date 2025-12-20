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
    <div className="soc-panel h-full">
      <div className="soc-panel-header">
        Traffic & Attacks
      </div>
      
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 17%)" vertical={false} />
            <XAxis 
              dataKey="time" 
              tick={{ fill: 'hsl(215, 20%, 65%)', fontSize: 10 }}
              axisLine={{ stroke: 'hsl(217, 33%, 17%)' }}
              tickLine={false}
            />
            <YAxis 
              tick={{ fill: 'hsl(215, 20%, 65%)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(222, 47%, 7%)',
                border: '1px solid hsl(217, 33%, 17%)',
                borderRadius: '8px',
                color: 'hsl(210, 40%, 96%)'
              }}
              labelStyle={{ color: 'hsl(215, 20%, 65%)' }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(199, 89%, 48%)"
              strokeWidth={2}
              fill="url(#trafficGradient)"
              name="Traffic"
            />
            <Line
              type="monotone"
              dataKey="alerts"
              stroke="hsl(0, 84%, 60%)"
              strokeWidth={2}
              dot={false}
              name="Alerts"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
