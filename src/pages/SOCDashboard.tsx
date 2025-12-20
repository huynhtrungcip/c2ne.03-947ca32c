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
import { Helmet } from 'react-helmet';

const SOCDashboard = () => {
  const [isLive, setIsLive] = useState(true);
  const [autoBlock, setAutoBlock] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all');
  const [selectedEvent, setSelectedEvent] = useState<SOCEvent | null>(null);

  const { events, metrics, topSources, attackTypeData, trafficData, lastUpdate, timeRanges } = useSOCData(
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
    <>
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-[1920px] mx-auto">
          {/* Header */}
          <SOCHeader 
            isLive={isLive} 
            timeRange={timeRangeLabel}
            lastUpdate={lastUpdate}
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
          <div className="mb-6">
            <SOCMetricsGrid metrics={metrics} />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <TrafficChart data={trafficData} />
            </div>
            <div>
              <AttackTypesChart data={attackTypeData} />
            </div>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Events Table */}
            <div className={selectedEvent ? 'xl:col-span-2' : 'xl:col-span-3'}>
              <EventsTable 
                events={events} 
                onEventSelect={setSelectedEvent}
                selectedEventId={selectedEvent?.id}
              />
            </div>

            {/* Top Sources */}
            <div className={selectedEvent ? 'hidden xl:block xl:col-span-1' : 'xl:col-span-1'}>
              <TopSourcesChart data={topSources} />
            </div>

            {/* Event Inspector */}
            {selectedEvent && (
              <div className="xl:col-span-1">
                <EventInspector 
                  event={selectedEvent} 
                  onClose={() => setSelectedEvent(null)} 
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-xs text-muted-foreground/50">
            <p>SOC Dashboard V22 — C1NE.03 K28 An ninh mạng — Đại học Duy Tân</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default SOCDashboard;
