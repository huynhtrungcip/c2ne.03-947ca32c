import { useState } from 'react';
import { SOCEvent } from '@/types/soc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface EventsTableProps {
  events: SOCEvent[];
  onEventSelect: (event: SOCEvent) => void;
  selectedEventId?: string;
}

const VerdictBadge = ({ verdict }: { verdict: SOCEvent['verdict'] }) => {
  const variants = {
    ALERT: 'bg-severity-critical text-severity-critical border-severity-critical/30',
    SUSPICIOUS: 'bg-severity-medium text-severity-medium border-severity-medium/30',
    BENIGN: 'bg-severity-low text-severity-low border-severity-low/30',
    FALSE_POSITIVE: 'bg-severity-info text-severity-info border-severity-info/30'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide border ${variants[verdict]}`}>
      {verdict}
    </span>
  );
};

export const EventsTable = ({ events, onEventSelect, selectedEventId }: EventsTableProps) => {
  const [sortField, setSortField] = useState<'timestamp' | 'verdict'>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedEvents = [...events].sort((a, b) => {
    if (sortField === 'timestamp') {
      return sortDir === 'desc' 
        ? b.timestamp.getTime() - a.timestamp.getTime()
        : a.timestamp.getTime() - b.timestamp.getTime();
    }
    return sortDir === 'desc' 
      ? b.verdict.localeCompare(a.verdict)
      : a.verdict.localeCompare(b.verdict);
  });

  const handleSort = (field: 'timestamp' | 'verdict') => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: 'timestamp' | 'verdict' }) => {
    if (sortField !== field) return null;
    return sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
  };

  return (
    <div className="soc-panel">
      <div className="soc-panel-header">
        Event Log ({events.length} events)
      </div>
      
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead 
                className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground font-semibold"
                onClick={() => handleSort('timestamp')}
              >
                <div className="flex items-center gap-1">
                  Timestamp
                  <SortIcon field="timestamp" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground font-semibold"
                onClick={() => handleSort('verdict')}
              >
                <div className="flex items-center gap-1">
                  Verdict
                  <SortIcon field="verdict" />
                </div>
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Source IP
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Destination
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Attack Type
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Confidence
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Engine
              </TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEvents.slice(0, 200).map((event) => (
              <TableRow 
                key={event.id}
                className={`cursor-pointer border-border transition-colors ${
                  selectedEventId === event.id 
                    ? 'bg-primary/10 border-l-2 border-l-primary' 
                    : 'hover:bg-secondary/30'
                }`}
                onClick={() => onEventSelect(event)}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {event.timestamp.toLocaleString()}
                </TableCell>
                <TableCell>
                  <VerdictBadge verdict={event.verdict} />
                </TableCell>
                <TableCell className="font-mono text-sm text-primary">
                  {event.src_ip}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {event.dst_ip}:{event.dst_port}
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {event.attack_type}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {(event.confidence * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {event.source_engine}
                </TableCell>
                <TableCell>
                  <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};
