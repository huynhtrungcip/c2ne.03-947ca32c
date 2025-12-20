import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { TopSource } from '@/types/soc';

interface TopSourcesChartProps {
  data: TopSource[];
}

export const TopSourcesChart = ({ data }: TopSourcesChartProps) => {
  const chartData = data.slice(0, 8).map(d => ({
    ip: d.ip,
    count: d.count
  }));

  if (chartData.length === 0) {
    return (
      <div>
        <div className="soc-section-title">Top Threat Sources</div>
        <div className="flex items-center justify-center h-80 text-zinc-500 text-sm">
          No data.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="soc-section-title">Top Threat Sources</div>
      
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <XAxis 
            type="number" 
            tick={{ fill: '#d4d4d8', fontSize: 10 }}
            axisLine={{ stroke: '#18181b' }}
            tickLine={false}
          />
          <YAxis 
            type="category" 
            dataKey="ip" 
            tick={{ fill: '#e5e7eb', fontSize: 11, fontFamily: 'Roboto Mono, monospace' }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#09090b',
              border: '1px solid #27272a',
              borderRadius: '4px',
              color: '#e5e7eb',
              fontSize: '11px'
            }}
            formatter={(value: number) => [value, 'Events']}
          />
          <Bar 
            dataKey="count" 
            radius={[0, 2, 2, 0]}
            label={{ 
              position: 'right', 
              fill: '#a1a1aa', 
              fontSize: 10,
              fontFamily: 'Roboto Mono, monospace'
            }}
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill="#f97316" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
