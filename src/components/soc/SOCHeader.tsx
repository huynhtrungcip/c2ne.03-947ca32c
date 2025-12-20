import { Shield, Wifi, WifiOff, Clock } from 'lucide-react';

interface SOCHeaderProps {
  isLive: boolean;
  timeRange: string;
  lastUpdate: Date;
}

export const SOCHeader = ({ isLive, timeRange, lastUpdate }: SOCHeaderProps) => {
  return (
    <div className="border-b border-border pb-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wider text-foreground">
              Security Operations Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              C1NE.03 Hybrid NIDS Engine — Zeek / Suricata / AI Correlation Pipeline
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Status Badge */}
          <div className={`status-badge ${isLive ? 'online' : 'offline'}`}>
            {isLive ? (
              <>
                <span className="pulse-dot" />
                <Wifi className="w-3.5 h-3.5" />
                <span>System Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Live Paused</span>
              </>
            )}
          </div>

          {/* Time Info */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {lastUpdate.toLocaleTimeString()} | Range: {timeRange}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
