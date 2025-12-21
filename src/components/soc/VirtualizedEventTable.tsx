import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SOCEvent } from '@/types/soc';

interface VirtualizedEventTableProps {
  events: SOCEvent[];
  isLive: boolean;
  isDarkMode: boolean;
  selectedEvent: SOCEvent | null;
  onEventClick: (event: SOCEvent) => void;
}

const VirtualizedEventTable = ({
  events,
  isLive,
  isDarkMode,
  selectedEvent,
  onEventClick
}: VirtualizedEventTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  const getVerdictClass = (verdict: string) => {
    const v = verdict.toUpperCase();
    if (v === 'ALERT') return 'text-[#dc2626]';
    if (v === 'SUSPICIOUS') return 'text-[#d97706]';
    return 'text-[#16a34a]';
  };

  const handleRowClick = useCallback((event: SOCEvent) => {
    if (!isLive) {
      onEventClick(event);
    }
  }, [isLive, onEventClick]);

  return (
    <div className={`border ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
      <div className={`flex items-center justify-between p-3 border-b ${isDarkMode ? 'border-[#1f1f1f]' : 'border-[#e5e7eb]'}`}>
        <div className={`text-[10px] uppercase tracking-wider ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
          Event Stream ({events.length.toLocaleString()} events)
        </div>
        {isLive && <span className="text-[9px] text-[#f59e0b]">Pause LIVE mode to inspect events</span>}
        {!isLive && <span className="text-[9px] text-[#22c55e]">Click any row to inspect</span>}
      </div>

      {/* Table Header */}
      <div className={`flex text-[10px] uppercase tracking-wider ${isDarkMode ? 'bg-[#0a0a0a] text-[#52525b]' : 'bg-[#f9fafb] text-[#9ca3af]'}`}
           style={{ borderBottom: isDarkMode ? '1px solid #1f1f1f' : '1px solid #e5e7eb' }}>
        <div className="w-20 py-2 px-3 font-medium shrink-0">Time</div>
        <div className="w-28 py-2 px-3 font-medium shrink-0">Verdict</div>
        <div className="w-32 py-2 px-3 font-medium shrink-0">Source</div>
        <div className="w-32 py-2 px-3 font-medium shrink-0">Destination</div>
        <div className="w-16 py-2 px-3 font-medium shrink-0">Port</div>
        <div className="flex-1 py-2 px-3 font-medium min-w-[200px]">Signature</div>
        <div className="w-20 py-2 px-3 font-medium text-right shrink-0">Conf</div>
      </div>

      {/* Virtualized Rows */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: '400px' }}
      >
        {events.length === 0 ? (
          <div className={`text-center py-8 ${isDarkMode ? 'text-[#3f3f46]' : 'text-[#9ca3af]'}`}>No events</div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const event = events[virtualRow.index];
              const isSelected = selectedEvent?.id === event.id;
              
              return (
                <div
                  key={event.id}
                  onClick={() => handleRowClick(event)}
                  className={`absolute top-0 left-0 w-full flex items-center border-b text-[10px] transition-colors ${
                    isDarkMode ? 'border-[#18181b]' : 'border-[#f3f4f6]'
                  } ${
                    isLive ? 'cursor-not-allowed opacity-70' : `cursor-pointer ${isDarkMode ? 'hover:bg-[#18181b]' : 'hover:bg-[#f9fafb]'}`
                  } ${isSelected ? (isDarkMode ? 'bg-[#1e3a5f]/40 border-l-2 border-l-[#3b82f6]' : 'bg-[#eff6ff] border-l-2 border-l-[#3b82f6]') : ''}`}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className={`w-20 py-1.5 px-3 font-mono shrink-0 ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
                    {event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div className={`w-28 py-1.5 px-3 font-semibold shrink-0 ${getVerdictClass(event.verdict)}`}>
                    {event.verdict}
                  </div>
                  <div className="w-32 py-1.5 px-3 font-mono text-[#3b82f6] shrink-0 truncate">{event.src_ip}</div>
                  <div className={`w-32 py-1.5 px-3 font-mono shrink-0 truncate ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{event.dst_ip}</div>
                  <div className={`w-16 py-1.5 px-3 font-mono shrink-0 ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>{event.dst_port || '-'}</div>
                  <div className={`flex-1 py-1.5 px-3 truncate min-w-[200px] ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{event.attack_type}</div>
                  <div className="w-20 py-1.5 px-3 shrink-0">
                    <div className="flex items-center justify-end gap-1">
                      <div className={`w-10 h-1 rounded overflow-hidden ${isDarkMode ? 'bg-[#27272a]' : 'bg-[#e5e7eb]'}`}>
                        <div 
                          className="h-full rounded" 
                          style={{ 
                            width: `${event.confidence * 100}%`,
                            background: event.confidence > 0.7 ? '#22c55e' : event.confidence > 0.4 ? '#f59e0b' : '#ef4444'
                          }} 
                        />
                      </div>
                      <span className={`font-mono ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{event.confidence.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualizedEventTable;
