import { useRef, useCallback, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SOCEvent } from '@/types/soc';
import { Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface VirtualizedEventTableProps {
  events: SOCEvent[];
  isLive: boolean;
  isDarkMode: boolean;
  selectedEvent: SOCEvent | null;
  onEventClick: (event: SOCEvent) => void;
}

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000, 5000];

const VirtualizedEventTable = ({
  events,
  isLive,
  isDarkMode,
  selectedEvent,
  onEventClick
}: VirtualizedEventTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Pagination calculations
  const totalPages = Math.ceil(events.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, events.length);
  const paginatedEvents = useMemo(() => 
    events.slice(startIndex, endIndex), 
    [events, startIndex, endIndex]
  );

  const rowVirtualizer = useVirtualizer({
    count: paginatedEvents.length,
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
    // SIEM-style: row is always clickable. Stream keeps flowing in background;
    // selected row stays pinned until user deselects.
    onEventClick(event);
  }, [onEventClick]);

  // Export functions
  const exportToCSV = useCallback(() => {
    const headers = ['ID', 'Timestamp', 'Verdict', 'Source IP', 'Destination IP', 'Port', 'Protocol', 'Signature', 'Confidence', 'Engine', 'Community ID'];
    const rows = events.map(e => [
      e.id,
      e.timestamp.toISOString(),
      e.verdict,
      e.src_ip,
      e.dst_ip,
      e.dst_port || '',
      e.protocol,
      e.attack_type,
      e.confidence.toFixed(4),
      e.source_engine,
      e.community_id
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `soc_events_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [events]);

  const exportToJSON = useCallback(() => {
    const exportData = events.map(e => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      verdict: e.verdict,
      src_ip: e.src_ip,
      dst_ip: e.dst_ip,
      dst_port: e.dst_port,
      protocol: e.protocol,
      attack_type: e.attack_type,
      confidence: e.confidence,
      source_engine: e.source_engine,
      community_id: e.community_id,
      raw_log: e.raw_log
    }));

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `soc_events_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [events]);

  // Pagination handlers
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    parentRef.current?.scrollTo({ top: 0 });
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  return (
    <div className={`border rounded-md flex flex-col h-full ${isDarkMode ? 'bg-card border-border' : 'bg-white border-[#e5e7eb]'}`}>
      {/* Header with Export */}
      <div className={`flex items-center justify-between p-3 border-b ${isDarkMode ? 'border-border' : 'border-[#e5e7eb]'}`}>
        <div className="flex items-center gap-4">
          <div className={`text-[10px] uppercase tracking-wider ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
            Event Stream ({events.length.toLocaleString()} total)
          </div>
          
          {/* Export Button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded transition-colors ${
                isDarkMode 
                  ? 'bg-[#18181b] text-[#a1a1aa] hover:bg-[#27272a] border border-[#27272a]' 
                  : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb] border border-[#e5e7eb]'
              }`}
            >
              <Download className="w-3 h-3" />
              Export
            </button>
            
            {showExportMenu && (
              <div className={`absolute left-0 top-full mt-1 z-20 rounded shadow-lg border ${
                isDarkMode ? 'bg-[#18181b] border-[#27272a]' : 'bg-white border-[#e5e7eb]'
              }`}>
                <button
                  onClick={exportToCSV}
                  className={`block w-full text-left px-3 py-2 text-[10px] ${
                    isDarkMode ? 'text-[#a1a1aa] hover:bg-[#27272a]' : 'text-[#6b7280] hover:bg-[#f3f4f6]'
                  }`}
                >
                  Export as CSV
                </button>
                <button
                  onClick={exportToJSON}
                  className={`block w-full text-left px-3 py-2 text-[10px] ${
                    isDarkMode ? 'text-[#a1a1aa] hover:bg-[#27272a]' : 'text-[#6b7280] hover:bg-[#f3f4f6]'
                  }`}
                >
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[9px] text-[#22c55e] uppercase tracking-wider font-mono">Streaming · click row to pin & inspect</span>
        </div>
      </div>

      {/* Table Header */}
      <div className={`flex text-[10px] uppercase tracking-wider ${isDarkMode ? 'bg-card text-[#52525b]' : 'bg-[#f9fafb] text-[#9ca3af]'}`}
           style={{ borderBottom: isDarkMode ? '1px solid hsl(var(--border))' : '1px solid #e5e7eb' }}>
        <div className="w-[7%] py-2 px-3 font-medium shrink-0">Time</div>
        <div className="w-[9%] py-2 px-3 font-medium shrink-0">Verdict</div>
        <div className="w-[14%] py-2 px-3 font-medium shrink-0">Source IP</div>
        <div className="w-[14%] py-2 px-3 font-medium shrink-0">Destination IP</div>
        <div className="w-[5%] py-2 px-3 font-medium shrink-0">Port</div>
        <div className="w-[6%] py-2 px-3 font-medium shrink-0">Protocol</div>
        <div className="w-[20%] py-2 px-3 font-medium">Signature</div>
        <div className="w-[12%] py-2 px-3 font-medium shrink-0">Engine</div>
        <div className="w-[13%] py-2 px-3 font-medium text-right shrink-0">Confidence</div>
      </div>

      {/* Virtualized Rows */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: '400px' }}
      >
        {paginatedEvents.length === 0 ? (
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
              const event = paginatedEvents[virtualRow.index];
              const isSelected = selectedEvent?.id === event.id;
              
              return (
                <div
                  key={event.id}
                  onClick={() => handleRowClick(event)}
                  className={`absolute top-0 left-0 w-full flex items-center border-b text-[11px] transition-colors cursor-pointer ${
                    isDarkMode ? 'border-[#18181b] hover:bg-[#18181b]' : 'border-[#f3f4f6] hover:bg-[#f9fafb]'
                  } ${isSelected ? (isDarkMode ? 'bg-[#1e3a5f]/40 border-l-2 border-l-[#3b82f6]' : 'bg-[#eff6ff] border-l-2 border-l-[#3b82f6]') : ''}`}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className={`w-[7%] py-1.5 px-3 font-mono shrink-0 whitespace-nowrap ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
                    {event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </div>
                  <div className={`w-[9%] py-1.5 px-3 font-semibold shrink-0 ${getVerdictClass(event.verdict)}`}>
                    {event.verdict}
                  </div>
                  <div className="w-[14%] py-1.5 px-3 font-mono text-[#3b82f6] shrink-0 truncate">{event.src_ip}</div>
                  <div className={`w-[14%] py-1.5 px-3 font-mono shrink-0 truncate ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{event.dst_ip}</div>
                  <div className={`w-[5%] py-1.5 px-3 font-mono shrink-0 ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>{event.dst_port || '-'}</div>
                  <div className={`w-[6%] py-1.5 px-3 shrink-0 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{event.protocol}</div>
                  <div className={`w-[20%] py-1.5 px-3 truncate ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{event.attack_type}</div>
                  <div className={`w-[12%] py-1.5 px-3 shrink-0 truncate ${
                    event.source_engine === 'Suricata' ? 'text-[#f87171]' :
                    event.source_engine === 'Zeek' ? 'text-[#60a5fa]' : 'text-[#a78bfa]'
                  }`}>{event.source_engine}</div>
                  <div className="w-[13%] py-1.5 px-3 shrink-0">
                    <div className="flex items-center justify-end gap-2">
                      <div className={`flex-1 max-w-[50px] h-1.5 rounded overflow-hidden ${isDarkMode ? 'bg-[#27272a]' : 'bg-[#e5e7eb]'}`}>
                        <div 
                          className="h-full rounded" 
                          style={{ 
                            width: `${event.confidence * 100}%`,
                            background: event.confidence > 0.7 ? '#22c55e' : event.confidence > 0.4 ? '#f59e0b' : '#ef4444'
                          }} 
                        />
                      </div>
                      <span className={`font-mono text-[10px] min-w-[35px] text-right ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>{(event.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      <div className={`flex items-center justify-between p-3 border-t mt-auto ${isDarkMode ? 'border-border' : 'border-[#e5e7eb]'}`}>
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>Show:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className={`h-6 px-2 text-[10px] rounded border ${
              isDarkMode 
                ? 'bg-[#0a0a0a] border-[#27272a] text-[#a1a1aa]' 
                : 'bg-white border-[#d1d5db] text-[#374151]'
            }`}
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size.toLocaleString()}</option>
            ))}
          </select>
          <span className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>per page</span>
        </div>

        {/* Page Info */}
        <div className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
          Showing {startIndex + 1} - {endIndex} of {events.length.toLocaleString()}
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className={`p-1 rounded transition-colors ${
              currentPage === 1
                ? 'opacity-30 cursor-not-allowed'
                : isDarkMode ? 'hover:bg-[#27272a] text-[#a1a1aa]' : 'hover:bg-[#f3f4f6] text-[#6b7280]'
            }`}
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className={`p-1 rounded transition-colors ${
              currentPage === 1
                ? 'opacity-30 cursor-not-allowed'
                : isDarkMode ? 'hover:bg-[#27272a] text-[#a1a1aa]' : 'hover:bg-[#f3f4f6] text-[#6b7280]'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 px-2">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              className={`w-12 h-6 px-2 text-[10px] text-center rounded border ${
                isDarkMode 
                  ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7]' 
                  : 'bg-white border-[#d1d5db] text-[#374151]'
              }`}
            />
            <span className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
              / {totalPages.toLocaleString()}
            </span>
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`p-1 rounded transition-colors ${
              currentPage === totalPages
                ? 'opacity-30 cursor-not-allowed'
                : isDarkMode ? 'hover:bg-[#27272a] text-[#a1a1aa]' : 'hover:bg-[#f3f4f6] text-[#6b7280]'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            className={`p-1 rounded transition-colors ${
              currentPage === totalPages
                ? 'opacity-30 cursor-not-allowed'
                : isDarkMode ? 'hover:bg-[#27272a] text-[#a1a1aa]' : 'hover:bg-[#f3f4f6] text-[#6b7280]'
            }`}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VirtualizedEventTable;
