import { useState, useEffect, useCallback } from 'react';
import { SOCEvent, SOCMetrics, TimeRange } from '@/types/soc';
import { mockEvents, generateMockEvents } from '@/data/mockEvents';

const timeRanges: TimeRange[] = [
  { label: 'Last 15m', value: '15m', minutes: 15 },
  { label: 'Last 1h', value: '1h', minutes: 60 },
  { label: 'Last 24h', value: '24h', minutes: 1440 },
  { label: 'All', value: 'all', minutes: Infinity }
];

interface Filters {
  verdictFocus: string;
  ipFilter: string;
  sigFilter: string;
  minConfidence: number;
}

interface UseSOCDataOptions {
  useWebSocket?: boolean;
  wsUrl?: string;
  onWebSocketEvent?: (event: SOCEvent) => void;
}

export const useSOCData = (
  timeRange: string, 
  viewMode: 'all' | 'alerts', 
  isLive: boolean,
  filters: Filters,
  options?: UseSOCDataOptions
) => {
  // Check data source settings
  const isMockDataEnabled = () => {
    return localStorage.getItem('soc-mock-data-enabled') === 'true';
  };
  
  const isNIDSDataEnabled = () => {
    return localStorage.getItem('soc-nids-data-enabled') !== 'false'; // Default: ON
  };

  // Separate storage for NIDS and Mock data
  const [nidsEvents, setNidsEvents] = useState<SOCEvent[]>(() => {
    const stored = localStorage.getItem('soc-nids-events');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.map((e: Record<string, unknown>) => ({
          ...e,
          timestamp: new Date(e.timestamp as string),
          source: 'nids' as const,
        }));
      } catch {
        return [];
      }
    }
    return [];
  });

  const [mockEventsState, setMockEventsState] = useState<SOCEvent[]>(() => {
    // Always load persisted mock events — toggling Mock OFF must NOT destroy data.
    // Data is only cleared via the explicit "Clear" action.
    const stored = localStorage.getItem('soc-mock-events');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.map((e: Record<string, unknown>) => ({
          ...e,
          timestamp: new Date(e.timestamp as string),
          source: 'mock' as const,
        }));
      } catch {
        return [];
      }
    }
    return [];
  });

  // Combined events based on enabled sources
  const events = (() => {
    const combined: SOCEvent[] = [];
    if (isNIDSDataEnabled()) {
      combined.push(...nidsEvents);
    }
    if (isMockDataEnabled()) {
      combined.push(...mockEventsState);
    }
    // Sort by timestamp descending
    return combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  })();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [wsConnected, setWsConnected] = useState(false);
  const [wsEventCount, setWsEventCount] = useState(0);

  // Add new event (from WebSocket/NIDS)
  const addEvent = useCallback((event: SOCEvent) => {
    const eventWithSource = { ...event, source: 'nids' as const };
    setNidsEvents(prev => {
      const newEvents = [eventWithSource, ...prev].slice(0, 2000);
      try {
        localStorage.setItem('soc-nids-events', JSON.stringify(newEvents.map(e => ({
          ...e,
          timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
        }))));
      } catch {
        try {
          const trimmed = newEvents.slice(0, 500);
          localStorage.setItem('soc-nids-events', JSON.stringify(trimmed.map(e => ({
            ...e,
            timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
          }))));
        } catch {
          localStorage.removeItem('soc-nids-events');
        }
      }
      return newEvents;
    });
    setLastUpdate(new Date());
    setWsEventCount(c => c + 1);
    options?.onWebSocketEvent?.(event);
  }, [options]);

  // Clear NIDS events
  const clearNidsEvents = useCallback(() => {
    setNidsEvents([]);
    localStorage.removeItem('soc-nids-events');
  }, []);

  // Clear Mock events
  const clearMockEvents = useCallback(() => {
    setMockEventsState([]);
    localStorage.removeItem('soc-mock-events');
  }, []);

  // Listen for custom event to refresh data
  useEffect(() => {
    const handleDataUpdate = () => {
      // Reload NIDS events
      const storedNids = localStorage.getItem('soc-nids-events');
      if (storedNids) {
        try {
          const parsed = JSON.parse(storedNids);
          const eventsWithDates = parsed.map((e: Record<string, unknown>) => ({
            ...e,
            timestamp: new Date(e.timestamp as string),
            source: 'nids' as const,
          }));
          setNidsEvents(eventsWithDates);
        } catch (err) {
          console.error('Failed to parse stored NIDS events:', err);
        }
      }

      // Reload Mock events from storage (regardless of enabled flag — preserve data when toggled off)
      const storedMock = localStorage.getItem('soc-mock-events');
      if (storedMock) {
        try {
          const parsed = JSON.parse(storedMock);
          const eventsWithDates = parsed.map((e: Record<string, unknown>) => ({
            ...e,
            timestamp: new Date(e.timestamp as string),
            source: 'mock' as const,
          }));
          setMockEventsState(eventsWithDates);
        } catch (err) {
          console.error('Failed to parse stored mock events:', err);
        }
      }
      setLastUpdate(new Date());
    };
    
    window.addEventListener('soc-data-updated', handleDataUpdate);
    return () => window.removeEventListener('soc-data-updated', handleDataUpdate);
  }, []);

  // Mock event generation (only when enabled and WebSocket not connected)
  useEffect(() => {
    if (!isLive) return;
    
    // If WebSocket is connected OR mock data is disabled, don't generate mock events
    if (options?.useWebSocket && wsConnected) return;
    if (!isMockDataEnabled()) return;

    const interval = setInterval(() => {
      const newEvents = generateMockEvents(Math.floor(Math.random() * 3) + 1).map(e => ({
        ...e,
        source: 'mock' as const,
      }));
      setMockEventsState(prev => {
        const updated = [...newEvents, ...prev].slice(0, 2000);
        try {
          localStorage.setItem('soc-mock-events', JSON.stringify(updated.map(e => ({
            ...e,
            timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
          }))));
        } catch (err) {
          // Quota exceeded — trim further and retry once, then give up silently
          try {
            const trimmed = updated.slice(0, 500);
            localStorage.setItem('soc-mock-events', JSON.stringify(trimmed.map(e => ({
              ...e,
              timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
            }))));
          } catch {
            localStorage.removeItem('soc-mock-events');
          }
        }
        return updated;
      });
      setLastUpdate(new Date());
    }, 3000);

    return () => clearInterval(interval);
  }, [isLive, wsConnected, options?.useWebSocket]);

  const filteredEvents = (() => {
    const range = timeRanges.find(r => r.value === timeRange) || timeRanges[1];
    const now = new Date();
    const cutoff = new Date(now.getTime() - range.minutes * 60000);

    let filtered = events;
    
    if (range.minutes !== Infinity) {
      filtered = filtered.filter(e => e.timestamp >= cutoff);
    }

    if (viewMode === 'alerts') {
      filtered = filtered.filter(e => e.verdict === 'ALERT');
    }

    // Apply filters
    if (filters.verdictFocus !== 'All') {
      filtered = filtered.filter(e => e.verdict === filters.verdictFocus);
    }

    if (filters.ipFilter.trim()) {
      const pat = filters.ipFilter.trim().toLowerCase();
      filtered = filtered.filter(e => 
        e.src_ip.toLowerCase().includes(pat) || 
        e.dst_ip.toLowerCase().includes(pat)
      );
    }

    if (filters.sigFilter.trim()) {
      const pat = filters.sigFilter.trim().toLowerCase();
      filtered = filtered.filter(e => 
        e.attack_type.toLowerCase().includes(pat)
      );
    }

    if (filters.minConfidence > 0) {
      filtered = filtered.filter(e => e.confidence >= filters.minConfidence);
    }

    return filtered;
  })();

  const metrics: SOCMetrics = (() => {
    const range = timeRanges.find(r => r.value === timeRange) || timeRanges[1];
    const now = new Date();
    const cutoff = new Date(now.getTime() - range.minutes * 60000);
    
    let baseEvents = events;
    if (range.minutes !== Infinity) {
      baseEvents = baseEvents.filter(e => e.timestamp >= cutoff);
    }

    const total = baseEvents.length;
    const alerts = baseEvents.filter(e => e.verdict === 'ALERT').length;
    const suspicious = baseEvents.filter(e => e.verdict === 'SUSPICIOUS').length;
    const falsePos = baseEvents.filter(e => e.verdict === 'FALSE_POSITIVE').length;
    const uniqueSources = new Set(baseEvents.map(e => e.src_ip)).size;

    return {
      totalEvents: total,
      criticalAlerts: alerts,
      suspicious,
      falsePositives: falsePos,
      uniqueSources,
      alertRate: total > 0 ? (alerts / total) * 100 : 0
    };
  })();

  const topSources = (() => {
    const range = timeRanges.find(r => r.value === timeRange) || timeRanges[1];
    const now = new Date();
    const cutoff = new Date(now.getTime() - range.minutes * 60000);
    
    let baseEvents = events;
    if (range.minutes !== Infinity) {
      baseEvents = baseEvents.filter(e => e.timestamp >= cutoff);
    }

    const counts: Record<string, { count: number; lastSeen: Date }> = {};
    baseEvents.forEach(e => {
      if (!counts[e.src_ip]) {
        counts[e.src_ip] = { count: 0, lastSeen: e.timestamp };
      }
      counts[e.src_ip].count++;
      if (e.timestamp > counts[e.src_ip].lastSeen) {
        counts[e.src_ip].lastSeen = e.timestamp;
      }
    });

    return Object.entries(counts)
      .map(([ip, data]) => ({ ip, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  })();

  const attackTypeData = (() => {
    const range = timeRanges.find(r => r.value === timeRange) || timeRanges[1];
    const now = new Date();
    const cutoff = new Date(now.getTime() - range.minutes * 60000);
    
    let baseEvents = events;
    if (range.minutes !== Infinity) {
      baseEvents = baseEvents.filter(e => e.timestamp >= cutoff);
    }

    const alertEvents = baseEvents.filter(e => e.verdict === 'ALERT');
    const counts: Record<string, number> = {};
    alertEvents.forEach(e => {
      counts[e.attack_type] = (counts[e.attack_type] || 0) + 1;
    });

    const total = alertEvents.length;
    return Object.entries(counts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();

  const trafficData = (() => {
    const range = timeRanges.find(r => r.value === timeRange) || timeRanges[1];
    const now = new Date();
    const cutoff = new Date(now.getTime() - range.minutes * 60000);
    
    let baseEvents = events;
    if (range.minutes !== Infinity) {
      baseEvents = baseEvents.filter(e => e.timestamp >= cutoff);
    }

    const buckets: Record<string, { total: number; alerts: number }> = {};
    
    baseEvents.forEach(e => {
      const bucketTime = new Date(Math.floor(e.timestamp.getTime() / 60000) * 60000);
      const key = bucketTime.toISOString();
      
      if (!buckets[key]) {
        buckets[key] = { total: 0, alerts: 0 };
      }
      buckets[key].total++;
      if (e.verdict === 'ALERT') {
        buckets[key].alerts++;
      }
    });

    return Object.entries(buckets)
      .map(([timestamp, data]) => ({
        timestamp: new Date(timestamp),
        ...data
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  })();

  return {
    events: filteredEvents,
    metrics,
    topSources,
    attackTypeData,
    trafficData,
    lastUpdate,
    timeRanges,
    // WebSocket state
    wsConnected,
    setWsConnected,
    wsEventCount,
    addEvent,
    // Data source controls
    clearNidsEvents,
    clearMockEvents,
    nidsEventCount: nidsEvents.length,
    mockEventCount: mockEventsState.length,
  };
};
