import { useState, useEffect, useCallback } from 'react';
import { Activity, Server, Shield, Bot, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

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
    backend: HealthStatus;
    aiEngine: HealthStatus;
    pfsense: HealthStatus;
    telegram: HealthStatus;
  }>({
    backend: { status: 'unknown', message: 'Chưa kiểm tra' },
    aiEngine: { status: 'unknown', message: 'Chưa kiểm tra' },
    pfsense: { status: 'unknown', message: 'Chưa kiểm tra' },
    telegram: { status: 'unknown', message: 'Chưa kiểm tra' },
  });

  const checkBackendHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL chưa được cấu hình' };
    }
    try {
      const response = await fetch(`${apiUrl}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        return { 
          status: 'healthy' as const, 
          message: `Backend hoạt động - WebSocket: ${data.websocketClients || 0} clients`,
          details: data
        };
      }
      return { status: 'error' as const, message: `HTTP ${response.status}` };
    } catch (error) {
      return { 
        status: 'error' as const, 
        message: error instanceof Error ? error.message : 'Không thể kết nối'
      };
    }
  }, [apiUrl]);

  const checkAIEngineHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL chưa được cấu hình' };
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
          message: `AI Engine hoạt động - Models: ${data.models_loaded ? 'Loaded' : 'Not loaded'}`,
          details: data
        };
      }
      return { status: 'error' as const, message: `HTTP ${response.status}` };
    } catch (error) {
      return { 
        status: 'error' as const, 
        message: error instanceof Error ? error.message : 'Không thể kết nối'
      };
    }
  }, [apiUrl]);

  const checkPfSenseHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL chưa được cấu hình' };
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
            message: `pfSense kết nối OK - ${data.blocked_count || 0} IP blocked`,
            details: data
          };
        } else {
          // Check for 401 error specifically
          const errorMsg = data.error || data.message || 'Không kết nối được';
          if (errorMsg.includes('401')) {
            return { 
              status: 'error' as const, 
              message: 'HTTP 401 - API Key không hợp lệ hoặc hết hạn',
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
        message: error instanceof Error ? error.message : 'Không thể kết nối'
      };
    }
  }, [apiUrl]);

  const checkTelegramHealth = useCallback(async () => {
    if (!apiUrl) {
      return { status: 'error' as const, message: 'API URL chưa được cấu hình' };
    }
    const aiEngineUrl = apiUrl.replace(':3001', ':8000');
    try {
      const response = await fetch(`${aiEngineUrl}/telegram/status`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.configured) {
          return { 
            status: 'healthy' as const, 
            message: `Telegram đã cấu hình - Chat ID: ${data.chat_id?.slice(-6) || '...'}`,
            details: data
          };
        }
        return { 
          status: 'warning' as const, 
          message: 'Telegram chưa được cấu hình',
          details: data
        };
      }
      return { status: 'error' as const, message: `HTTP ${response.status}` };
    } catch (error) {
      return { 
        status: 'error' as const, 
        message: error instanceof Error ? error.message : 'Không thể kết nối'
      };
    }
  }, [apiUrl]);

  const runHealthChecks = useCallback(async () => {
    setIsRefreshing(true);
    
    // Mark all as checking
    setHealth(prev => ({
      backend: { ...prev.backend, status: 'checking', message: 'Đang kiểm tra...' },
      aiEngine: { ...prev.aiEngine, status: 'checking', message: 'Đang kiểm tra...' },
      pfsense: { ...prev.pfsense, status: 'checking', message: 'Đang kiểm tra...' },
      telegram: { ...prev.telegram, status: 'checking', message: 'Đang kiểm tra...' },
    }));

    // Run all checks in parallel
    const [backend, aiEngine, pfsense, telegram] = await Promise.all([
      checkBackendHealth(),
      checkAIEngineHealth(),
      checkPfSenseHealth(),
      checkTelegramHealth(),
    ]);

    const now = new Date();
    setHealth({
      backend: { ...backend, lastCheck: now },
      aiEngine: { ...aiEngine, lastCheck: now },
      pfsense: { ...pfsense, lastCheck: now },
      telegram: { ...telegram, lastCheck: now },
    });
    
    setLastRefresh(now);
    setIsRefreshing(false);
  }, [checkBackendHealth, checkAIEngineHealth, checkPfSenseHealth, checkTelegramHealth]);

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
        return <RefreshCw className="w-4 h-4 text-[#3b82f6] animate-spin" />;
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-[#22c55e]" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-[#f59e0b]" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-[#ef4444]" />;
      default:
        return <Activity className="w-4 h-4 text-[#71717a]" />;
    }
  };

  const getStatusColor = (status: HealthStatus['status']) => {
    switch (status) {
      case 'checking': return 'border-[#3b82f6]/30 bg-[#3b82f6]/5';
      case 'healthy': return 'border-[#22c55e]/30 bg-[#22c55e]/5';
      case 'warning': return 'border-[#f59e0b]/30 bg-[#f59e0b]/5';
      case 'error': return 'border-[#ef4444]/30 bg-[#ef4444]/5';
      default: return isDarkMode ? 'border-[#27272a] bg-[#18181b]' : 'border-[#e5e7eb] bg-[#f9fafb]';
    }
  };

  const services = [
    { key: 'backend', label: 'Backend Server', icon: Server, data: health.backend },
    { key: 'aiEngine', label: 'AI Engine', icon: Bot, data: health.aiEngine },
    { key: 'pfsense', label: 'pfSense Firewall', icon: Shield, data: health.pfsense },
    { key: 'telegram', label: 'Telegram Bot', icon: Activity, data: health.telegram },
  ];

  return (
    <div className={`rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-white border-[#e5e7eb]'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-[#27272a]' : 'border-[#e5e7eb]'}`}>
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`} />
          <span className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#374151]'}`}>
            System Health Monitor
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Refresh Interval Selector */}
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>Interval:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className={`h-6 px-2 text-[10px] border rounded ${
                isDarkMode 
                  ? 'bg-[#0a0a0a] border-[#27272a] text-[#a1a1aa]' 
                  : 'bg-white border-[#d1d5db] text-[#374151]'
              }`}
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={300}>5m</option>
            </select>
          </div>

          {/* Auto Refresh Toggle */}
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>Auto:</span>
            <button
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                isAutoRefresh ? 'bg-[#22c55e]' : isDarkMode ? 'bg-[#27272a]' : 'bg-[#d1d5db]'
              }`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                isAutoRefresh ? 'left-4' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={runHealthChecks}
            disabled={isRefreshing}
            className={`flex items-center gap-1 h-6 px-2 text-[10px] font-medium rounded transition-colors ${
              isDarkMode 
                ? 'bg-[#1e3a5f] text-[#60a5fa] hover:bg-[#1e40af] disabled:opacity-50' 
                : 'bg-[#eff6ff] text-[#2563eb] hover:bg-[#dbeafe] disabled:opacity-50'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Check Now
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {services.map(({ key, label, icon: Icon, data }) => (
          <div 
            key={key}
            className={`p-3 rounded-lg border transition-all ${getStatusColor(data.status)}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`} />
              <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#374151]'}`}>
                {label}
              </span>
              <div className="ml-auto">
                {getStatusIcon(data.status)}
              </div>
            </div>
            <p className={`text-[10px] ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
              {data.message}
            </p>
            {data.lastCheck && (
              <p className={`text-[9px] mt-1 ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
                Last: {data.lastCheck.toLocaleTimeString()}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {lastRefresh && (
        <div className={`px-4 py-2 border-t text-center ${isDarkMode ? 'border-[#27272a]' : 'border-[#e5e7eb]'}`}>
          <span className={`text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
            Last full check: {lastRefresh.toLocaleString()} 
            {isAutoRefresh && ` • Next in ${refreshInterval}s`}
          </span>
        </div>
      )}
    </div>
  );
};

export default SystemHealthMonitor;
