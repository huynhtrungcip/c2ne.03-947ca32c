import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { SOCEvent } from '@/types/soc';

interface VerdictDistributionPanelProps {
  events: SOCEvent[];
}

const VERDICT_CONFIG: { key: string; label: string; color: string }[] = [
  { key: 'ALERT', label: 'Alert', color: 'hsl(var(--soc-alert))' },
  { key: 'SUSPICIOUS', label: 'Suspicious', color: 'hsl(var(--soc-warning))' },
  { key: 'BENIGN', label: 'Benign', color: 'hsl(var(--soc-success))' },
  { key: 'FALSE_POSITIVE', label: 'False Pos.', color: 'hsl(var(--chart-2))' },
];

export const VerdictDistributionPanel = ({ events }: VerdictDistributionPanelProps) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { data, total } = useMemo(() => {
    const counts: Record<string, number> = {
      ALERT: 0,
      SUSPICIOUS: 0,
      BENIGN: 0,
      FALSE_POSITIVE: 0,
    };
    for (const ev of events) {
      const v = (ev.verdict || '').toUpperCase();
      if (v in counts) counts[v] += 1;
    }
    const arr = VERDICT_CONFIG.map(c => ({
      name: c.label,
      key: c.key,
      value: counts[c.key],
      color: c.color,
    }));
    return { data: arr, total: events.length };
  }, [events]);

  const hasData = total > 0;
  const active = hoverIdx !== null ? data[hoverIdx] : null;
  const centerValue = active ? active.value : data[0].value;
  const centerLabel = active ? active.name : 'Alerts';
  const centerPct = total ? ((centerValue / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="p-3 border border-border rounded-md bg-card">
      <div className="text-[10px] uppercase tracking-wider mb-2 text-muted-foreground flex items-center justify-between">
        <span>Verdict Distribution</span>
        <span className="text-[8px] font-mono tracking-normal normal-case text-muted-foreground/70">
          {total.toLocaleString()} total
        </span>
      </div>

      {!hasData ? (
        <div className="h-32 flex items-center justify-center text-[10px] text-muted-foreground/70">
          No events
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative" style={{ width: 96, height: 96 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={32}
                  outerRadius={46}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  isAnimationActive={false}
                  onMouseEnter={(_, idx) => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  {data.map((d, i) => (
                    <Cell
                      key={d.key}
                      fill={d.color}
                      opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.35}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[13px] font-mono font-semibold text-foreground tabular-nums leading-none">
                {centerValue}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">
                {active ? `${centerPct}%` : centerLabel}
              </div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 gap-1">
            {data.map((d, i) => {
              const pct = total ? (d.value / total) * 100 : 0;
              const dim = hoverIdx !== null && hoverIdx !== i;
              return (
                <div
                  key={d.key}
                  className="flex items-center gap-1.5 text-[9px] cursor-pointer transition-opacity"
                  style={{ opacity: dim ? 0.4 : 1 }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ background: d.color }}
                  />
                  <span className="text-muted-foreground truncate flex-1">{d.name}</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {d.value}
                  </span>
                  <span className="font-mono text-muted-foreground/70 tabular-nums w-9 text-right">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
