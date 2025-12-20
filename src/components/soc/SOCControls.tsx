import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeRange } from '@/types/soc';

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
    <div className="flex flex-wrap items-center gap-6 mb-5">
      {/* Live Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Live
        </span>
        <Switch
          checked={isLive}
          onCheckedChange={setIsLive}
          className="data-[state=checked]:bg-green-500"
        />
      </div>

      {/* Auto Block Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Auto Block
        </span>
        <Switch
          checked={autoBlock}
          onCheckedChange={setAutoBlock}
          className="data-[state=checked]:bg-red-500"
        />
      </div>

      {/* Time Range */}
      <Select value={timeRange} onValueChange={setTimeRange}>
        <SelectTrigger className="w-28 h-8 text-[0.8rem] bg-zinc-950 border-border rounded-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-950 border-border">
          {timeRanges.map(range => (
            <SelectItem key={range.value} value={range.value} className="text-[0.8rem]">
              {range.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* View Mode */}
      <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'all' | 'alerts')}>
        <SelectTrigger className="w-36 h-8 text-[0.8rem] bg-zinc-950 border-border rounded-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-950 border-border">
          <SelectItem value="all" className="text-[0.8rem]">Show All Events</SelectItem>
          <SelectItem value="alerts" className="text-[0.8rem]">Show ALERTS Only</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
