import { useState, useEffect, useCallback } from 'react';
import { SOCEvent, SOCMetrics, TimeRange } from '@/types/soc';
import { historicalEvents } from '@/data/historicalDataset';

const timeRanges: TimeRange[] = [
  { label: 'Last 15m', value: '15m', minutes: 15 },
  { label: 'Last 1h', value: '1h', minutes: 60 },
  { label: 'Last 24h', value: '24h', minutes: 1440 },
  { label: 'Last 7d', value: '7d', minutes: 1440 * 7 },
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
  // ===== DEMO TIMESTAMP NORMALISATION =====
  // Any live NIDS event sourced from the demo attacker IP must appear on the
  // dashboard as if it happened on the live-demo day (2026-04-25), regardless
  // of when it was actually generated. This keeps the storyline consistent
  // when the operator practises the demo on, say, 2026-04-21.
  const DEMO_ATTACKER_IP = '192.168.168.23';
  const DEMO_DAY_START = new Date('2026-04-25T09:00:00+07:00').getTime();
  const normalizeDemoTimestamp = (e: SOCEvent): SOCEvent => {
    if (e.src_ip !== DEMO_ATTACKER_IP) return e;
    // Already on 2026-04-25? leave it alone.
    const ts = e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp);
    if (ts.toISOString().slice(0, 10) === '2026-04-25') return { ...e, timestamp: ts };
    // Map current wall-clock time of day onto 2026-04-25 same time-of-day.
    const now = new Date();
    const dayMinutes = now.getHours() * 60 + now.getMinutes();
    const shifted = DEMO_DAY_START + (dayMinutes * 60_000) + (now.getSeconds() * 1000);
    return { ...e, timestamp: new Date(shifted) };
  };

  // Separate storage for NIDS (live attack day-25) and historical baseline (20-24/04).
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
    // Historical baseline (20-24/04/2026) — always loaded, never togglable.
    // Bumped key (v2) to force reseed after dataset fix (NAT dst + full 5-day coverage).
    const STORAGE_KEY = 'soc-mock-events-v2';
    try { localStorage.removeItem('soc-mock-events'); } catch { /* ignore */ }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.map((e: Record<string, unknown>) => ({
          ...e,
          timestamp: new Date(e.timestamp as string),
          source: 'mock' as const,
        }));
      } catch {
        return historicalEvents.map(e => ({ ...e, source: 'mock' as const }));
      }
    }
    const seed = historicalEvents.map(e => ({ ...e, source: 'mock' as const }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed.map(e => ({
        ...e, timestamp: e.timestamp.toISOString(),
      }))));
    } catch { /* ignore quota */ }
    return seed;
  });

  // Always combine: historical baseline + live NIDS (no toggles).
  const events = (() => {
    return [...nidsEvents, ...mockEventsState]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  })();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [wsConnected, setWsConnected] = useState(false);
  const [wsEventCount, setWsEventCount] = useState(0);

  // Add new event (from WebSocket/NIDS) — applies demo timestamp normalisation.
  const addEvent = useCallback((event: SOCEvent) => {
    const eventWithSource = normalizeDemoTimestamp({ ...event, source: 'nids' as const });
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

  // Clear NIDS events (= clear day-25 live attack data ONLY).
  // Historical baseline (20-24/04) lives in mockEventsState and is preserved.
  const clearNidsEvents = useCallback(() => {
    setNidsEvents([]);
    localStorage.removeItem('soc-nids-events');
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
      const storedMock = localStorage.getItem('soc-mock-events-v2');
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

  // NOTE: The historical dataset (20-24/04/2026) is fixed and deterministic.
  // We no longer generate random mock events on a timer — live events come
  // exclusively from the NIDS WebSocket stream (Suricata/Zeek shippers).

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
    // Data source controls — only "Clear day-25 live data" is exposed.
    clearNidsEvents,
    nidsEventCount: nidsEvents.length,
    mockEventCount: mockEventsState.length,
  };
};
