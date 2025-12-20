import { useState, useEffect, useMemo } from 'react';
import { SOCEvent, SOCMetrics, TimeRange } from '@/types/soc';
import { mockEvents, generateMockEvents } from '@/data/mockEvents';

const timeRanges: TimeRange[] = [
  { label: 'Last 15m', value: '15m', minutes: 15 },
  { label: 'Last 1h', value: '1h', minutes: 60 },
  { label: 'Last 24h', value: '24h', minutes: 1440 },
  { label: 'All', value: 'all', minutes: Infinity }
];

export const useSOCData = (timeRange: string, viewMode: 'all' | 'alerts', isLive: boolean) => {
  const [events, setEvents] = useState<SOCEvent[]>(mockEvents);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Simulate live data updates
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const newEvents = generateMockEvents(Math.floor(Math.random() * 5) + 1);
      setEvents(prev => [...newEvents, ...prev].slice(0, 1000));
      setLastUpdate(new Date());
    }, 3000);

    return () => clearInterval(interval);
  }, [isLive]);

  const filteredEvents = useMemo(() => {
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

    return filtered;
  }, [events, timeRange, viewMode]);

  const metrics: SOCMetrics = useMemo(() => {
    const total = filteredEvents.length;
    const alerts = filteredEvents.filter(e => e.verdict === 'ALERT').length;
    const suspicious = filteredEvents.filter(e => e.verdict === 'SUSPICIOUS').length;
    const falsePos = filteredEvents.filter(e => e.verdict === 'FALSE_POSITIVE').length;
    const uniqueSources = new Set(filteredEvents.map(e => e.src_ip)).size;

    return {
      totalEvents: total,
      criticalAlerts: alerts,
      suspicious,
      falsePositives: falsePos,
      uniqueSources,
      alertRate: total > 0 ? (alerts / total) * 100 : 0
    };
  }, [filteredEvents]);

  const topSources = useMemo(() => {
    const counts: Record<string, { count: number; lastSeen: Date }> = {};
    filteredEvents.forEach(e => {
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
      .slice(0, 10);
  }, [filteredEvents]);

  const attackTypeData = useMemo(() => {
    const alertEvents = filteredEvents.filter(e => e.verdict === 'ALERT');
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
  }, [filteredEvents]);

  const trafficData = useMemo(() => {
    const buckets: Record<string, { total: number; alerts: number }> = {};
    
    filteredEvents.forEach(e => {
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
  }, [filteredEvents]);

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
