import { useState } from 'react';
import { SOCEvent } from '@/types/soc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';

interface EventsTableProps {
  events: SOCEvent[];
  onEventSelect: (event: SOCEvent | null) => void;
  selectedEventId?: string;
  isLive: boolean;
}

const VerdictText = ({ verdict }: { verdict: SOCEvent['verdict'] }) => {
  const classes = {
    ALERT: 'verdict-alert',
    SUSPICIOUS: 'verdict-suspicious',
    BENIGN: 'verdict-benign',
    FALSE_POSITIVE: 'verdict-false-positive'
  };

  return <span className={classes[verdict]}>{verdict}</span>;
};

const ConfidenceBar = ({ value }: { value: number }) => {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 rounded-full"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-xs font-mono text-zinc-400">{(value).toFixed(2)}</span>
    </div>
  );
};

export const EventsTable = ({ events, onEventSelect, selectedEventId, isLive }: EventsTableProps) => {
  const sortedEvents = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const handleRowClick = (event: SOCEvent) => {
    if (isLive) return;
    if (selectedEventId === event.id) {
      onEventSelect(null);
    } else {
      onEventSelect(event);
    }
  };

  return (
    <div>
      <div className="soc-section-title">Security Event Stream</div>
      {isLive && (
        <p className="text-xs text-zinc-500 mb-2">
          LIVE đang bật - bảng sẽ auto refresh. Để inspect & block IP, hãy tắt LIVE.
        </p>
      )}
      
      <ScrollArea className="h-[400px] border border-border rounded">
        <Table>
          <TableHeader className="sticky top-0 bg-zinc-950 z-10">
            <TableRow className="border-border hover:bg-transparent">
              {!isLive && (
                <TableHead className="w-10 text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                  Inspect
                </TableHead>
              )}
              <TableHead className="text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                Time
              </TableHead>
              <TableHead className="text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                Verdict
              </TableHead>
              <TableHead className="text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                Source
              </TableHead>
              <TableHead className="text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                Dest
              </TableHead>
              <TableHead className="text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                Port
              </TableHead>
              <TableHead className="text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                Signature
              </TableHead>
              <TableHead className="text-[0.7rem] uppercase tracking-wider text-zinc-500 font-semibold">
                Confidence
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEvents.slice(0, 200).map((event) => (
              <TableRow 
                key={event.id}
                className={`soc-table-row ${selectedEventId === event.id ? 'selected' : ''} ${isLive ? 'cursor-default' : ''}`}
                onClick={() => handleRowClick(event)}
              >
                {!isLive && (
                  <TableCell className="py-2">
                    <Checkbox 
                      checked={selectedEventId === event.id}
                      className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs text-zinc-400 py-2">
                  {event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </TableCell>
                <TableCell className="py-2">
                  <VerdictText verdict={event.verdict} />
                </TableCell>
                <TableCell className="font-mono text-sm text-blue-400 py-2">
                  {event.src_ip}
                </TableCell>
                <TableCell className="font-mono text-sm py-2">
                  {event.dst_ip}
                </TableCell>
                <TableCell className="font-mono text-sm py-2">
                  {event.dst_port || '-'}
                </TableCell>
                <TableCell className="text-sm py-2">
                  {event.attack_type}
                </TableCell>
                <TableCell className="py-2">
                  <ConfidenceBar value={event.confidence} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};
