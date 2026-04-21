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
    // Historical baseline (5 days ending "now") — always re-shifted on load
    // so the X-axis matches wall-clock time at demo time, regardless of when
    // the operator actually runs the demo.
    //
    // The raw dataset lives on the calendar 2026-04-20 → 2026-04-25. We shift
    // every timestamp by Δ = (Date.now() - newestRawTimestamp) so the most
    // recent historical event lands at the current wall-clock minute.
    //
    // We DO NOT cache the shifted result in localStorage — re-shifting on
    // every page load is cheap (~5k events) and guarantees the chart always
    // ends at "now". Old cached versions are purged.
    ['soc-mock-events', 'soc-mock-events-v2', 'soc-mock-events-v3',
     'soc-mock-events-v4', 'soc-mock-events-v5', 'soc-mock-events-v6']
      .forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });

    if (historicalEvents.length === 0) return [];
    const newestRaw = Math.max(...historicalEvents.map(e => e.timestamp.getTime()));
    const delta = Date.now() - newestRaw;
    return historicalEvents.map(e => ({
      ...e,
      timestamp: new Date(e.timestamp.getTime() + delta),
      source: 'mock' as const,
    }));
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
      const storedMock = localStorage.getItem('soc-mock-events-v6');
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

  // ----- Time-range anchor -----
  // Use max(now, newest-event-ts) as the anchor so a dataset whose timestamps
  // sit in the future (or far in the past) is still bracketed correctly by
  // "Last 1h / 24h / 7d". Without this, future-dated demo events would be
  // included in EVERY range because the filter only checks `>= cutoff`.
  const newestEventTs = events.length > 0
    ? Math.max(...events.map(e => e.timestamp.getTime()))
    : Date.now();
  const anchorMs = Math.max(Date.now(), newestEventTs);

  const filteredEvents = (() => {
    const range = timeRanges.find(r => r.value === timeRange) || timeRanges[1];
    const cutoff = new Date(anchorMs - range.minutes * 60000);
    const upper = new Date(anchorMs);

    let filtered = events;

    if (range.minutes !== Infinity) {
      filtered = filtered.filter(e => e.timestamp >= cutoff && e.timestamp <= upper);
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

  // Helper: bracket events by current range using the anchor.
  const bracketByRange = (): SOCEvent[] => {
    const range = timeRanges.find(r => r.value === timeRange) || timeRanges[1];
    if (range.minutes === Infinity) return events;
    const cutoff = anchorMs - range.minutes * 60000;
    return events.filter(e => {
      const t = e.timestamp.getTime();
      return t >= cutoff && t <= anchorMs;
    });
  };

  const metrics: SOCMetrics = (() => {
    const baseEvents = bracketByRange();
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
    const baseEvents = bracketByRange();
    const counts: Record<string, { count: number; alerts: number; suspicious: number; lastSeen: Date }> = {};
    baseEvents.forEach(e => {
      if (!counts[e.src_ip]) {
        counts[e.src_ip] = { count: 0, alerts: 0, suspicious: 0, lastSeen: e.timestamp };
      }
      counts[e.src_ip].count++;
      if (e.verdict === 'ALERT') counts[e.src_ip].alerts++;
      if (e.verdict === 'SUSPICIOUS') counts[e.src_ip].suspicious++;
      if (e.timestamp > counts[e.src_ip].lastSeen) {
        counts[e.src_ip].lastSeen = e.timestamp;
      }
    });

    return Object.entries(counts)
      .map(([ip, data]) => ({
        ip,
        count: data.count,
        lastSeen: data.lastSeen,
        threatScore: data.alerts * 5 + data.suspicious * 2 + data.count * 0.05,
      }))
      .sort((a, b) => b.threatScore - a.threatScore)
      .slice(0, 8);
  })();

  const attackTypeData = (() => {
    const baseEvents = bracketByRange();
    const threatEvents = baseEvents.filter(
      e => e.verdict === 'ALERT' || e.verdict === 'SUSPICIOUS'
    );
    const counts: Record<string, number> = {};
    threatEvents.forEach(e => {
      counts[e.attack_type] = (counts[e.attack_type] || 0) + 1;
    });

    const total = threatEvents.length;
    return Object.entries(counts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  })();

  const trafficData = (() => {
    const baseEvents = bracketByRange();
    if (baseEvents.length === 0) return [];

    const tsList = baseEvents.map(e => e.timestamp.getTime());
    const newest = Math.max(...tsList);
    const oldest = Math.min(...tsList);
    const spanMs = Math.max(60_000, newest - oldest);
    const TARGET_BUCKETS = 60;
    const STANDARD_BUCKETS_MS = [
      60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
      60 * 60_000, 3 * 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000,
    ];
    const idealBucket = spanMs / TARGET_BUCKETS;
    const bucketMs = STANDARD_BUCKETS_MS.find(b => b >= idealBucket) ?? STANDARD_BUCKETS_MS[STANDARD_BUCKETS_MS.length - 1];

    const startBucket = Math.floor(oldest / bucketMs) * bucketMs;
    const endBucket = Math.floor(newest / bucketMs) * bucketMs;
    const numBuckets = Math.min(180, Math.max(1, Math.floor((endBucket - startBucket) / bucketMs) + 1));
    const seq: { timestamp: Date; total: number; alerts: number }[] = [];
    for (let i = 0; i < numBuckets; i++) {
      seq.push({ timestamp: new Date(startBucket + i * bucketMs), total: 0, alerts: 0 });
    }
    baseEvents.forEach(e => {
      const idx = Math.floor((e.timestamp.getTime() - startBucket) / bucketMs);
      if (idx >= 0 && idx < seq.length) {
        seq[idx].total++;
        if (e.verdict === 'ALERT') seq[idx].alerts++;
      }
    });
    return seq;
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
