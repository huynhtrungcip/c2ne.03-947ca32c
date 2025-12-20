import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { TopSource } from '@/types/soc';

interface TopSourcesChartProps {
  data: TopSource[];
}

export const TopSourcesChart = ({ data }: TopSourcesChartProps) => {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  
  const chartData = data.slice(0, 8).map(d => ({
    ip: d.ip,
    count: d.count,
    percentage: (d.count / maxCount) * 100
  }));

  if (chartData.length === 0) {
    return (
      <div className="soc-panel h-full">
        <div className="soc-panel-header">
          Top Threat Sources
        </div>
        <div className="flex items-center justify-center h-80 text-muted-foreground text-sm">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="soc-panel h-full">
      <div className="soc-panel-header">
        Top Threat Sources
      </div>
      
      <div className="space-y-3 mt-4">
        {chartData.map((item, index) => {
          const barColor = index === 0 
            ? 'hsl(var(--severity-critical))' 
            : index < 3 
              ? 'hsl(var(--severity-high))' 
              : 'hsl(var(--severity-medium))';
          
          return (
            <div key={item.ip} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-sm text-primary group-hover:text-foreground transition-colors">
                  {item.ip}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {item.count}
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${item.percentage}%`,
                    backgroundColor: barColor
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
