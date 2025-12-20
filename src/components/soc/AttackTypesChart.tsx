import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { AttackTypeData } from '@/types/soc';

interface AttackTypesChartProps {
  data: AttackTypeData[];
}

const COLORS = ['#3b82f6', '#06b6d4', '#a855f7', '#f97316', '#22c55e', '#eab308'];

export const AttackTypesChart = ({ data }: AttackTypesChartProps) => {
  const chartData = data.map(d => ({
    name: d.type,
    value: d.count
  }));

  if (chartData.length === 0) {
    return (
      <div>
        <div className="soc-section-title">Attack Types</div>
        <div className="flex flex-col items-center justify-center h-48 text-green-500">
          <p className="text-sm font-medium">System is Safe</p>
          <p className="text-xs text-zinc-500">No active attacks.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="soc-section-title">Attack Types</div>
      
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{
              backgroundColor: '#09090b',
              border: '1px solid #27272a',
              borderRadius: '4px',
              color: '#e5e7eb',
              fontSize: '11px'
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value) => <span className="text-zinc-300">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
