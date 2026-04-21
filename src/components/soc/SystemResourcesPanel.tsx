import { useEffect, useState } from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';

interface ResourceData {
  cpu: { percent: number; cores?: number };
  memory: { percent: number; used_gb?: number; total_gb?: number };
  disk: { percent: number; used_gb?: number; total_gb?: number };
}

interface SystemResourcesPanelProps {
  apiUrl?: string;
}

const colorForPercent = (p: number) => {
  if (p >= 85) return 'hsl(var(--soc-alert))';
  if (p >= 70) return 'hsl(var(--soc-warning))';
  return 'hsl(var(--soc-success))';
};

const Gauge = ({ label, percent, sub }: { label: string; percent: number; sub?: string }) => {
  const color = colorForPercent(percent);
  const data = [{ name: label, value: percent, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full" style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="80%"
            innerRadius="100%"
            outerRadius="160%"
            barSize={8}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={4}
              background={{ fill: 'hsl(var(--muted))' }}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center pointer-events-none">
          <div className="text-[14px] font-mono font-semibold text-foreground tabular-nums">
            {percent.toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  );
};

export const SystemResourcesPanel = ({ apiUrl }: SystemResourcesPanelProps) => {
  const [data, setData] = useState<ResourceData | null>(null);
  const [error, setError] = useState(false);

  // CPU/RAM/Disk are always live data from the AI Engine — no mock fallback.
  useEffect(() => {
    let cancelled = false;

    if (!apiUrl) {
      setData(null);
      setError(false);
      return;
    }

    const aiUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
    const fetchData = async () => {
      try {
        const res = await fetch(`${aiUrl}/system/resources`);
        if (!res.ok) throw new Error('bad');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiUrl]);

  return (
    <div className="p-3 border border-border rounded-md bg-card">
      <div className="text-[10px] uppercase tracking-wider mb-3 text-muted-foreground">
        System Resources
      </div>
      {!data ? (
        <div className="h-32 flex items-center justify-center text-[10px] text-muted-foreground/70">
          {error ? 'Connection error' : !apiUrl ? 'Configure AI Engine URL' : 'Loading...'}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Gauge
            label="CPU"
            percent={data.cpu.percent}
            sub={data.cpu.cores ? `${data.cpu.cores} cores` : undefined}
          />
          <Gauge
            label="Memory"
            percent={data.memory.percent}
            sub={
              data.memory.used_gb && data.memory.total_gb
                ? `${data.memory.used_gb}/${data.memory.total_gb} GB`
                : undefined
            }
          />
          <Gauge
            label="Disk"
            percent={data.disk.percent}
            sub={
              data.disk.used_gb && data.disk.total_gb
                ? `${data.disk.used_gb}/${data.disk.total_gb} GB`
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};
