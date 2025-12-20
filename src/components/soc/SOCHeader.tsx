interface SOCHeaderProps {
  isLive: boolean;
  timeRange: string;
}

export const SOCHeader = ({ isLive, timeRange }: SOCHeaderProps) => {
  const now = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return (
    <div className="border-b border-border pb-3 mb-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl font-black uppercase tracking-[0.08em] text-white">
            Security Operations Center
          </h1>
          <p className="text-[0.82rem] text-zinc-400 mt-1">
            C1NE.03 Hybrid NIDS Engine — Zeek / Suricata / AI Correlation Pipeline
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <span className={`live-badge ${isLive ? 'live-badge-on' : 'live-badge-off'}`}>
            {isLive ? 'SYSTEM ONLINE' : 'LIVE VIEW PAUSED'}
          </span>
          <span className="text-[0.75rem] text-zinc-500">
            Local Time: {now} | Range: {timeRange}
          </span>
        </div>
      </div>
    </div>
  );
};
