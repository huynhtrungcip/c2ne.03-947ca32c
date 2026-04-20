import { useState, useEffect, useCallback } from 'react';
import { Activity, Shield, Bot, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface HealthStatus {
  status: 'checking' | 'healthy' | 'warning' | 'error' | 'unknown';
  message: string;
  lastCheck?: Date;
  details?: Record<string, unknown>;
}

interface SystemHealthMonitorProps {
  isDarkMode: boolean;
  apiUrl: string;
  onClose?: () => void;
}

const SystemHealthMonitor = ({ isDarkMode, apiUrl, onClose }: SystemHealthMonitorProps) => {
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [health, setHealth] = useState<{
    nids: HealthStatus;
    aiEngine: HealthStatus;
    pfsense: HealthStatus;
    telegram: HealthStatus;
  }>({
    nids: { status: 'unknown', message: 'Not checked' },
    aiEngine: { status: 'unknown', message: 'Not checked' },
    pfsense: { status: 'unknown', message: 'Not checked' },
    telegram: { status: 'unknown', message: 'Not checked' },
  });

  const checkNidsHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL not configured' };
    }
    const aiEngineUrl = apiUrl.replace(':3001', ':8000');

    try {
      const response = await fetch(`${aiEngineUrl}/ingest/health?max_age_seconds=120`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return { status: 'error' as const, message: `HTTP ${response.status}` };
      }

      const data = await response.json();
      if (!data.shipper_seen) {
        return {
          status: 'warning' as const,
          message: 'No NIDS shipper logs detected',
          details: data,
        };
      }

      if (!data.shipper_is_recent) {
        return {
          status: 'warning' as const,
          message: `NIDS shipper has not sent recent logs (${data.shipper_age_seconds}s)` ,
          details: data,
        };
      }

      return {
        status: 'healthy' as const,
        message: `NIDS OK - last log ${data.shipper_age_seconds}s ago • WS clients: ${data.connected_ws_clients ?? 0}`,
        details: data,
      };
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }, [apiUrl]);

  const checkAIEngineHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL not configured' };
    }
    const aiEngineUrl = apiUrl.replace(':3001', ':8000');
    try {
      const response = await fetch(`${aiEngineUrl}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        return { 
          status: 'healthy' as const, 
          message: `AI Engine running - Models: ${data.models_loaded ? 'Loaded' : 'Not loaded'}`,
          details: data
        };
      }
      return { status: 'error' as const, message: `HTTP ${response.status}` };
    } catch (error) {
      return { 
        status: 'error' as const, 
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }, [apiUrl]);

  const checkPfSenseHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL not configured' };
    }
    const aiEngineUrl = apiUrl.replace(':3001', ':8000');
    try {
      const response = await fetch(`${aiEngineUrl}/pfsense/status`, { 
        method: 'GET',
        signal: AbortSignal.timeout(8000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.connected) {
          return { 
            status: 'healthy' as const, 
            message: `pfSense connected - ${data.blocked_count || 0} IP blocked`,
            details: data
          };
        } else {
          // Check for 401 error specifically
          const errorMsg = data.error || data.message || 'Connection failed';
          if (errorMsg.includes('401')) {
            return { 
              status: 'error' as const, 
              message: 'HTTP 401 - API Key invalid or expired',
              details: data
            };
          }
          return { 
            status: 'warning' as const, 
            message: errorMsg,
            details: data
          };
        }
      }
      return { status: 'error' as const, message: `HTTP ${response.status}` };
    } catch (error) {
      return { 
        status: 'error' as const, 
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }, [apiUrl]);

  const checkTelegramHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL not configured' };
    }
    const aiEngineUrl = apiUrl.replace(':3001', ':8000');
    try {
      const response = await fetch(`${aiEngineUrl}/telegram/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.enabled) {
          return {
            status: 'healthy' as const,
            message: `Telegram OK - threshold ${data.confidence_threshold}%`,
            details: data
          };
        }
        return {
          status: 'warning' as const,
          message: 'Telegram not configured (token/chat_id)',
          details: data
        };
      }
      return { status: 'error' as const, message: `HTTP ${response.status}` };
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }, [apiUrl]);

  const runHealthChecks = useCallback(async () => {
    setIsRefreshing(true);
    
    // Mark all as checking
    setHealth(prev => ({
      nids: { ...prev.nids, status: 'checking', message: 'Checking...' },
      aiEngine: { ...prev.aiEngine, status: 'checking', message: 'Checking...' },
      pfsense: { ...prev.pfsense, status: 'checking', message: 'Checking...' },
      telegram: { ...prev.telegram, status: 'checking', message: 'Checking...' },
    }));

    // Run all checks in parallel
    const [nids, aiEngine, pfsense, telegram] = await Promise.all([
      checkNidsHealth(),
      checkAIEngineHealth(),
      checkPfSenseHealth(),
      checkTelegramHealth(),
    ]);

    const now = new Date();
    setHealth({
      nids: { ...nids, lastCheck: now },
      aiEngine: { ...aiEngine, lastCheck: now },
      pfsense: { ...pfsense, lastCheck: now },
      telegram: { ...telegram, lastCheck: now },
    });
    
    setLastRefresh(now);
    setIsRefreshing(false);
  }, [checkNidsHealth, checkAIEngineHealth, checkPfSenseHealth, checkTelegramHealth]);

  // Auto refresh
  useEffect(() => {
    if (!isAutoRefresh) return;
    
    const interval = setInterval(() => {
      runHealthChecks();
    }, refreshInterval * 1000);
    
    return () => clearInterval(interval);
  }, [isAutoRefresh, refreshInterval, runHealthChecks]);

  const getStatusIcon = (status: HealthStatus['status']) => {
    switch (status) {
      case 'checking':
        return <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />;
      case 'healthy':
        return <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--soc-success))]" />;
      case 'warning':
        return <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--soc-warning))]" />;
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-[hsl(var(--soc-alert))]" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const getStatusTone = (status: HealthStatus['status']) => {
    switch (status) {
      case 'checking': return { border: 'border-border', label: 'CHECK', text: 'text-muted-foreground' };
      case 'healthy':  return { border: 'border-[hsl(var(--soc-success)/0.4)]', label: 'OK',    text: 'text-[hsl(var(--soc-success))]' };
      case 'warning':  return { border: 'border-[hsl(var(--soc-warning)/0.4)]', label: 'WARN',  text: 'text-[hsl(var(--soc-warning))]' };
      case 'error':    return { border: 'border-[hsl(var(--soc-alert)/0.4)]',   label: 'ERR',   text: 'text-[hsl(var(--soc-alert))]' };
      default:         return { border: 'border-border',                         label: 'IDLE',  text: 'text-muted-foreground' };
    }
  };

  const services = [
    { key: 'nids', label: 'nids.shipper', icon: Activity, data: health.nids },
    { key: 'aiEngine', label: 'ai.engine', icon: Bot, data: health.aiEngine },
    { key: 'pfsense', label: 'pfsense.firewall', icon: Shield, data: health.pfsense },
    { key: 'telegram', label: 'telegram.bot', icon: Activity, data: health.telegram },
  ];

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Header — command bar style */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/60" />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-foreground">
            HEALTH
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">/</span>
          <span className="text-[10px] font-mono text-muted-foreground truncate">
            system.monitor
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Refresh Interval */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">interval</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="h-6 px-1.5 text-[10px] font-mono bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-foreground/40"
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={300}>5m</option>
            </select>
          </div>

          {/* Auto Refresh Toggle */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">auto</span>
            <button
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={`w-7 h-3.5 rounded-full transition-colors relative ${
                isAutoRefresh ? 'bg-[hsl(var(--soc-success))]' : 'bg-muted'
              }`}
            >
              <span className={`absolute top-0.5 w-2.5 h-2.5 bg-background rounded-full shadow transition-transform ${
                isAutoRefresh ? 'left-4' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Manual Refresh */}
          <button
            onClick={runHealthChecks}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 h-6 px-2 text-[10px] font-mono uppercase tracking-wider rounded-sm bg-muted/40 border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            check now
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="p-3 grid grid-cols-2 gap-2.5 bg-card">
        {services.map(({ key, label, icon: Icon, data }) => {
          const tone = getStatusTone(data.status);
          return (
            <div
              key={key}
              className={`border-l-2 ${tone.border} bg-muted/20 rounded-sm p-3 transition-colors`}
            >
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                  <span className="text-[11px] font-mono text-foreground truncate">
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[9px] font-mono font-semibold uppercase tracking-wider ${tone.text}`}>
                    {tone.label}
                  </span>
                  {getStatusIcon(data.status)}
                </div>
              </div>
              <p className="text-[10.5px] font-mono text-muted-foreground leading-relaxed break-words">
                {data.message}
              </p>
              {data.lastCheck && (
                <p className="text-[9px] font-mono text-muted-foreground/60 mt-1.5">
                  ts={data.lastCheck.toLocaleTimeString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {lastRefresh && (
        <div className="px-3 py-1.5 border-t border-border bg-muted/20">
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
            last_check={lastRefresh.toLocaleString()}
            {isAutoRefresh && ` · next=${refreshInterval}s`}
          </span>
        </div>
      )}
    </div>
  );
};

export default SystemHealthMonitor;
