import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { AttackTypeData } from '@/types/soc';
import { ShieldCheck } from 'lucide-react';

interface AttackTypesChartProps {
  data: AttackTypeData[];
}

const COLORS = [
  'hsl(199, 89%, 48%)',
  'hsl(172, 66%, 50%)',
  'hsl(280, 65%, 60%)',
  'hsl(25, 95%, 53%)',
  'hsl(142, 76%, 36%)',
  'hsl(45, 93%, 47%)',
];

export const AttackTypesChart = ({ data }: AttackTypesChartProps) => {
  const chartData = data.map(d => ({
    name: d.type,
    value: d.count
  }));

  if (chartData.length === 0) {
    return (
      <div className="soc-panel h-full">
        <div className="soc-panel-header">
          Attack Types
        </div>
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <ShieldCheck className="w-12 h-12 mb-2 text-status-online" />
          <p className="text-sm font-medium text-status-online">System is Safe</p>
          <p className="text-xs">No active attacks detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="soc-panel h-full">
      <div className="soc-panel-header">
        Attack Types
      </div>
      
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{
              backgroundColor: 'hsl(222, 47%, 7%)',
              border: '1px solid hsl(217, 33%, 17%)',
              borderRadius: '8px',
              color: 'hsl(210, 40%, 96%)'
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value) => <span className="text-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
