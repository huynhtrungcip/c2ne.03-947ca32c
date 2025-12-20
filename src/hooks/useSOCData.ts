import { useState, useEffect } from 'react';
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

export const useSOCData = (
  timeRange: string, 
  viewMode: 'all' | 'alerts', 
  isLive: boolean,
  filters: Filters
) => {
  const [events, setEvents] = useState<SOCEvent[]>(mockEvents);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const newEvents = generateMockEvents(Math.floor(Math.random() * 3) + 1);
      setEvents(prev => [...newEvents, ...prev].slice(0, 1000));
      setLastUpdate(new Date());
    }, 3000);

    return () => clearInterval(interval);
  }, [isLive]);

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
    timeRanges
  };
};
