import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AttackTypeData } from '@/types/soc';
import { useMemo } from 'react';

interface AttackTypesChartProps {
  data: AttackTypeData[];
}

// Vivid, distinguishable palette (matches reference donut)
const PALETTE = [
  'hsl(217 91% 60%)', // blue
  'hsl(189 94% 48%)', // cyan
  'hsl(271 91% 65%)', // purple
  'hsl(24 95% 58%)',  // orange
  'hsl(142 71% 45%)', // green
  'hsl(48 96% 53%)',  // yellow
  'hsl(340 82% 60%)', // pink
  'hsl(173 80% 40%)', // teal
];

export const AttackTypesChart = ({ data }: AttackTypesChartProps) => {
  const { chartData, total } = useMemo(() => {
    const cd = data.map((d, i) => ({
      name: d.type,
      value: d.count,
      color: PALETTE[i % PALETTE.length],
    }));
    return { chartData: cd, total: cd.reduce((a, b) => a + b.value, 0) };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div>
        <div className="soc-section-title">Attack Distribution</div>
        <div className="flex flex-col items-center justify-center h-48">
          <p className="text-sm font-medium text-[hsl(var(--soc-success))]">System is Safe</p>
          <p className="text-xs text-muted-foreground">No active attacks.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="soc-section-title">Attack Distribution</div>

      <div className="flex items-center gap-4">
        {/* Donut with centered total */}
        <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={74}
                paddingAngle={2}
                dataKey="value"
                stroke="hsl(var(--background))"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {chartData.map((d, i) => (
                  <Cell key={`cell-${i}`} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '2px',
                  color: 'hsl(var(--foreground))',
                  fontSize: '11px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  padding: '6px 10px',
                }}
                formatter={(v: number, n: string) => [`${v} (${((v / total) * 100).toFixed(1)}%)`, n]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-2xl font-mono font-bold tabular-nums text-foreground">{total}</div>
            <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
              {chartData.length} types
            </div>
          </div>
        </div>

        {/* Legend list — name on left, count on right */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {chartData.slice(0, 6).map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-[11px] font-mono">
              <span
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="truncate text-foreground/90 flex-1">{d.name}</span>
              <span className="tabular-nums text-muted-foreground">{d.value}</span>
            </div>
          ))}
          {chartData.length > 6 && (
            <div className="text-[10px] font-mono text-muted-foreground pl-4">
              +{chartData.length - 6} more
            </div>
          )}
          <div className="pt-1.5 mt-1.5 border-t border-border/40 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
            Hover slice for details
          </div>
        </div>
      </div>
    </div>
  );
};
