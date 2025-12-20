import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeRange } from '@/types/soc';
import { Radio, Filter, Zap, ShieldOff } from 'lucide-react';

interface SOCControlsProps {
  isLive: boolean;
  setIsLive: (value: boolean) => void;
  autoBlock: boolean;
  setAutoBlock: (value: boolean) => void;
  timeRange: string;
  setTimeRange: (value: string) => void;
  viewMode: 'all' | 'alerts';
  setViewMode: (value: 'all' | 'alerts') => void;
  timeRanges: TimeRange[];
}

export const SOCControls = ({
  isLive,
  setIsLive,
  autoBlock,
  setAutoBlock,
  timeRange,
  setTimeRange,
  viewMode,
  setViewMode,
  timeRanges
}: SOCControlsProps) => {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-card border border-border rounded-lg mb-6">
      {/* Live Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${isLive ? 'text-status-online' : 'text-muted-foreground'}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live
          </span>
        </div>
        <Switch
          checked={isLive}
          onCheckedChange={setIsLive}
          className="data-[state=checked]:bg-status-online"
        />
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Auto Block Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <ShieldOff className={`w-4 h-4 ${autoBlock ? 'text-severity-critical' : 'text-muted-foreground'}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Auto Block
          </span>
        </div>
        <Switch
          checked={autoBlock}
          onCheckedChange={setAutoBlock}
          className="data-[state=checked]:bg-severity-critical"
        />
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Time Range */}
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-muted-foreground" />
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32 h-9 text-xs uppercase tracking-wider bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {timeRanges.map(range => (
              <SelectItem key={range.value} value={range.value} className="text-xs uppercase">
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* View Mode */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'all' | 'alerts')}>
          <SelectTrigger className="w-40 h-9 text-xs uppercase tracking-wider bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all" className="text-xs uppercase">All Events</SelectItem>
            <SelectItem value="alerts" className="text-xs uppercase">Alerts Only</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
