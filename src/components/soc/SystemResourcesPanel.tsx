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
  const [mockEnabled, setMockEnabled] = useState(
    () => localStorage.getItem('soc-mock-data-enabled') === 'true'
  );

  // Listen to mock toggle changes
  useEffect(() => {
    const handler = () => setMockEnabled(localStorage.getItem('soc-mock-data-enabled') === 'true');
    window.addEventListener('storage', handler);
    window.addEventListener('soc-data-updated', handler);
    const poll = setInterval(handler, 2000);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('soc-data-updated', handler);
      clearInterval(poll);
    };
  }, []);

  // Generate realistic mock resource data with smooth drift
  const generateMockData = (): ResourceData => {
    const t = Date.now() / 10000;
    const cpu = 28 + Math.sin(t) * 12 + Math.random() * 8;
    const mem = 55 + Math.sin(t * 0.7) * 8 + Math.random() * 4;
    const disk = 42 + Math.sin(t * 0.2) * 2 + Math.random() * 1;
    return {
      cpu: { percent: Math.max(5, Math.min(95, cpu)), cores: 8 },
      memory: {
        percent: Math.max(20, Math.min(90, mem)),
        used_gb: +(mem * 0.16).toFixed(1),
        total_gb: 16,
      },
      disk: {
        percent: Math.max(20, Math.min(95, disk)),
        used_gb: +(disk * 5).toFixed(0),
        total_gb: 500,
      },
    };
  };

  useEffect(() => {
    let cancelled = false;

    if (mockEnabled) {
      setData(generateMockData());
      setError(false);
      const id = setInterval(() => {
        if (!cancelled) setData(generateMockData());
      }, 3000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

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
  }, [apiUrl, mockEnabled]);

  return (
    <div className="p-3 border border-border rounded-md bg-card">
      <div className="text-[10px] uppercase tracking-wider mb-3 text-muted-foreground flex items-center justify-between">
        <span>System Resources</span>
        {mockEnabled && (
          <span className="text-[8px] font-mono text-[hsl(var(--soc-warning))] tracking-normal normal-case">
            MOCK
          </span>
        )}
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
