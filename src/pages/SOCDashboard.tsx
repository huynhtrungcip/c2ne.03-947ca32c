import { useState, useEffect } from 'react';
import { SOCHeader } from '@/components/soc/SOCHeader';
import { SOCControls } from '@/components/soc/SOCControls';
import { SOCMetricsGrid } from '@/components/soc/SOCMetricsGrid';
import { TrafficChart } from '@/components/soc/TrafficChart';
import { AttackTypesChart } from '@/components/soc/AttackTypesChart';
import { TopSourcesChart } from '@/components/soc/TopSourcesChart';
import { EventsTable } from '@/components/soc/EventsTable';
import { EventInspector } from '@/components/soc/EventInspector';
import { useSOCData } from '@/hooks/useSOCData';
import { SOCEvent } from '@/types/soc';

const SOCDashboard = () => {
  const [isLive, setIsLive] = useState(true);
  const [autoBlock, setAutoBlock] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all');
  const [selectedEvent, setSelectedEvent] = useState<SOCEvent | null>(null);

  const { events, metrics, topSources, attackTypeData, trafficData, timeRanges } = useSOCData(
    timeRange,
    viewMode,
    isLive
  );

  // Clear selection when switching to live mode
  useEffect(() => {
    if (isLive) {
      setSelectedEvent(null);
    }
  }, [isLive]);

  const timeRangeLabel = timeRanges.find(r => r.value === timeRange)?.label || timeRange;

  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <div className="max-w-[1920px] mx-auto">
        {/* Header */}
        <SOCHeader 
          isLive={isLive} 
          timeRange={timeRangeLabel}
        />

        {/* Controls */}
        <SOCControls
          isLive={isLive}
          setIsLive={setIsLive}
          autoBlock={autoBlock}
          setAutoBlock={setAutoBlock}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          viewMode={viewMode}
          setViewMode={setViewMode}
          timeRanges={timeRanges}
        />

        {/* Metrics */}
        <SOCMetricsGrid metrics={metrics} />

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <div className="lg:col-span-2">
            <TrafficChart data={trafficData} />
          </div>
          <div>
            <AttackTypesChart data={attackTypeData} />
          </div>
        </div>

        {/* Table + Top Sources Row */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          <div className="xl:col-span-3">
            <EventsTable 
              events={events} 
              onEventSelect={setSelectedEvent}
              selectedEventId={selectedEvent?.id}
              isLive={isLive}
            />
          </div>
          <div className="xl:col-span-1">
            <TopSourcesChart data={topSources} />
          </div>
        </div>

        {/* Inspector - only when event selected and not live */}
        {!isLive && selectedEvent && (
          <div className="mt-5">
            <EventInspector event={selectedEvent} />
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-border text-center text-[0.7rem] text-zinc-600">
          V22 FINAL BUILD — SOC DASHBOARD POWERED BY PYTHON + STREAMLIT + MegaLLM
        </div>
      </div>
    </div>
  );
};

export default SOCDashboard;
