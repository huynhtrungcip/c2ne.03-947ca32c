export interface SOCEvent {
  id: string;
  timestamp: Date;
  src_ip: string;
  dst_ip: string;
  src_port?: number;
  dst_port?: number;
  protocol: string;
  verdict: 'ALERT' | 'SUSPICIOUS' | 'BENIGN' | 'FALSE_POSITIVE';
  attack_type: string;
  confidence: number;
  source_engine: string;
  community_id: string;
  raw_log?: string;
  action_taken?: string;
}

export interface SOCMetrics {
  totalEvents: number;
  criticalAlerts: number;
  suspicious: number;
  falsePositives: number;
  uniqueSources: number;
  alertRate: number;
}

export interface TimeRange {
  label: string;
  value: string;
  minutes: number;
}

export type ViewMode = 'all' | 'alerts';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface TopSource {
  ip: string;
  count: number;
  lastSeen: Date;
}

export interface AttackTypeData {
  type: string;
  count: number;
  percentage: number;
}

export interface TrafficData {
  timestamp: Date;
  total: number;
  alerts: number;
}
