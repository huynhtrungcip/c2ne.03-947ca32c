import { useState, useEffect, useCallback } from 'react';
import { Settings, Sun, Moon, X, Plus, Trash2, Edit2, HelpCircle, Clock, Shield, List, Users, Globe, Server, Wifi, WifiOff, Ban, RefreshCw, Database, RotateCcw, AlertTriangle, Send, Bell, MessageCircle, CheckCircle, Terminal, FileText, Activity } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import SystemHealthMonitor from '@/components/soc/SystemHealthMonitor';
import { ConfirmDialog, useConfirmDialog, ConfirmActionType } from './ConfirmDialog';

type Theme = 'light' | 'dark';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDarkMode: boolean;
}

interface ListItem {
  id: string;
  value: string;
  type: 'ip' | 'domain';
  note?: string;
}

interface ConnectedSource {
  id: string;
  ip_address: string;
  source_type: string;
  hostname: string;
  last_seen: string;
  total_events: number;
}

const TIMEZONES = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Vietnam (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Thailand (UTC+7)' },
  { value: 'Asia/Singapore', label: 'Singapore (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Japan (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Korea (UTC+9)' },
  { value: 'America/New_York', label: 'New York (UTC-5)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8)' },
  { value: 'Europe/London', label: 'London (UTC+0)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1)' },
  { value: 'UTC', label: 'UTC' },
];

const SettingsModal = ({ isOpen, onClose, theme, setTheme, isDarkMode }: SettingsModalProps) => {
  const { language, setLanguage, t } = useLanguage();
  const [activeSection, setActiveSection] = useState<'general' | 'telegram' | 'data' | 'sources' | 'nids_debug' | 'health' | 'blacklist' | 'whitelist' | 'blocked' | 'help'>('general');
  const [timezone, setTimezone] = useState(() => localStorage.getItem('soc-timezone') || 'Asia/Ho_Chi_Minh');
  const [connectedSources, setConnectedSources] = useState<ConnectedSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  
  // Confirmation dialog
  const { dialogState, showConfirm, closeConfirm } = useConfirmDialog();
  const [pendingAction, setPendingAction] = useState<{ action: () => Promise<void> | void; targetValue?: string; details?: string } | null>(null);
  
  // Blacklist state
  const [blacklist, setBlacklist] = useState<ListItem[]>(() => {
    const stored = localStorage.getItem('soc-blacklist');
    return stored ? JSON.parse(stored) : [
      { id: '1', value: '192.168.1.100', type: 'ip', note: 'Brute force attack' },
      { id: '2', value: '10.0.0.50', type: 'ip', note: 'SQL Injection' },
      { id: '3', value: 'malicious-domain.com', type: 'domain', note: 'Phishing' },
    ];
  });
  
  // Whitelist state
  const [whitelist, setWhitelist] = useState<ListItem[]>(() => {
    const stored = localStorage.getItem('soc-whitelist');
    return stored ? JSON.parse(stored) : [
      { id: '1', value: '192.168.1.1', type: 'ip', note: 'Gateway' },
      { id: '2', value: '8.8.8.8', type: 'ip', note: 'Google DNS' },
    ];
  });
  
  const [newItem, setNewItem] = useState({ value: '', type: 'ip' as 'ip' | 'domain', note: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Blocked IPs state (moved from renderBlockedIPsSection)
  const [blockedIPsLoading, setBlockedIPsLoading] = useState(false);
  const [pfSenseBlockedIPs, setPfSenseBlockedIPs] = useState<string[]>([]);
  const [unblockingIP, setUnblockingIP] = useState<string | null>(null);
  const [blockedIPsList, setBlockedIPsList] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]');
  });

  // Data management state
  const [pendingDelete, setPendingDelete] = useState<{ 
    timeRange: string; 
    deletedData: any[] | null; 
    countdown: number;
    intervalId: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [addingMockData, setAddingMockData] = useState(false);
  
  // Mock data toggle state - must be before any early returns
  const [mockDataEnabled, setMockDataEnabled] = useState(() => {
    return localStorage.getItem('soc-mock-data-enabled') === 'true';
  });

  // NIDS data toggle state (default: ON)
  const [nidsDataEnabled, setNidsDataEnabled] = useState(() => {
    return localStorage.getItem('soc-nids-data-enabled') !== 'false';
  });

  // API URL for backend - using state for reactivity
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('soc-api-url') || '');
  const [apiUrlInput, setApiUrlInput] = useState(() => localStorage.getItem('soc-api-url') || '');

  // Telegram settings state
  const [telegramConfig, setTelegramConfig] = useState(() => {
    const stored = localStorage.getItem('soc-telegram-config');
    return stored ? JSON.parse(stored) : {
      enabled: false,
      botToken: '',
      chatId: '',
      confidenceThreshold: 80,
      alertTypes: ['ALERT', 'SUSPICIOUS'],
      notifyBlockIP: true,
      notifyWhitelist: true,
      notifyBlacklist: true,
    };
  });
  const [telegramTestStatus, setTelegramTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [telegramTestMessage, setTelegramTestMessage] = useState('');

  // NIDS Debug logs state
  interface IngestLog {
    timestamp: string;
    level: string;
    source: string;
    message: string;
    details: Record<string, any>;
  }
  const [nidsLogs, setNidsLogs] = useState<IngestLog[]>([]);
  const [nidsLogsLoading, setNidsLogsLoading] = useState(false);
  const [nidsLogFilter, setNidsLogFilter] = useState<'all' | 'INFO' | 'WARNING' | 'ERROR'>('all');
  const [nidsSourceFilter, setNidsSourceFilter] = useState<'all' | 'suricata' | 'zeek'>('all');
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);

  // Time ranges for data management
  const TIME_RANGES = [
    { value: '5m', label: '5 phút', ms: 5 * 60 * 1000 },
    { value: '15m', label: '15 phút', ms: 15 * 60 * 1000 },
    { value: '30m', label: '30 phút', ms: 30 * 60 * 1000 },
    { value: '1h', label: '1 giờ', ms: 60 * 60 * 1000 },
    { value: '1d', label: '1 ngày', ms: 24 * 60 * 60 * 1000 },
    { value: 'all', label: 'Tất cả', ms: Infinity },
  ];
  
  // Define all useCallback hooks BEFORE any conditional returns
  const fetchConnectedSources = useCallback(async () => {
    if (!apiUrl) return;
    setLoadingSources(true);
    try {
      const response = await fetch(`${apiUrl}/api/sources`);
      if (response.ok) {
        const data = await response.json();
        setConnectedSources(data);
      }
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    } finally {
      setLoadingSources(false);
    }
  }, [apiUrl]);

  // Fetch NIDS ingest logs for debugging
  const fetchNidsLogs = useCallback(async () => {
    if (!apiUrl) return;
    setNidsLogsLoading(true);
    try {
      // AI Engine URL - ensure we're calling port 8000
      const aiEngineUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
      const params = new URLSearchParams({ limit: '200' });
      if (nidsLogFilter !== 'all') params.append('level', nidsLogFilter);
      if (nidsSourceFilter !== 'all') params.append('source', nidsSourceFilter);
      
      const response = await fetch(`${aiEngineUrl}/ingest/logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setNidsLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch NIDS logs:', error);
    } finally {
      setNidsLogsLoading(false);
    }
  }, [apiUrl, nidsLogFilter, nidsSourceFilter]);

  // Clear NIDS logs
  const clearNidsLogs = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const aiEngineUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
      await fetch(`${aiEngineUrl}/ingest/logs`, { method: 'DELETE' });
      setNidsLogs([]);
    } catch (error) {
      console.error('Failed to clear NIDS logs:', error);
    }
  }, [apiUrl]);

  const executeDeleteData = useCallback(async (timeRange: string) => {
    const range = TIME_RANGES.find(r => r.value === timeRange);
    if (!range) return;

    const currentEvents = localStorage.getItem('soc-events') || '[]';
    let parsedEvents: any[] = [];
    try {
      parsedEvents = JSON.parse(currentEvents);
    } catch (e) {
      console.error('Failed to parse events:', e);
      return;
    }
    
    // Check if there are events to delete
    if (parsedEvents.length === 0) {
      console.warn('No events in localStorage to delete');
      return;
    }
    
    let deletedData: any[] = [];
    let remainingData: any[] = [];
    const now = Date.now();
    
    if (timeRange === 'all') {
      deletedData = parsedEvents;
      remainingData = [];
    } else {
      parsedEvents.forEach((event: any) => {
        const eventTime = new Date(event.timestamp).getTime();
        // Delete events WITHIN the time range (recent events)
        if (now - eventTime <= range.ms) {
          deletedData.push(event);
        } else {
          remainingData.push(event);
        }
      });
    }

    console.log(`[Data Management] Deleting ${deletedData.length} events, keeping ${remainingData.length}`);

    // Save remaining data to localStorage
    localStorage.setItem('soc-events', JSON.stringify(remainingData));
    
    // Dispatch event to update dashboard
    window.dispatchEvent(new CustomEvent('soc-data-updated'));
    
    const intervalId = setInterval(() => {
      setPendingDelete(prev => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(prev.intervalId!);
          // Permanently delete - clear the backup
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    setPendingDelete({
      timeRange,
      deletedData,
      countdown: 120,
      intervalId,
    });

    if (apiUrl) {
      try {
        await fetch(`${apiUrl}/api/events/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeRange, deleteBefore: now - range.ms }),
        });
      } catch (error) {
        console.error('Failed to delete from backend:', error);
      }
    }
  }, [apiUrl]);

  const handleRecoverData = useCallback(() => {
    if (!pendingDelete?.deletedData || pendingDelete.deletedData.length === 0) return;
    
    const currentEvents = JSON.parse(localStorage.getItem('soc-events') || '[]');
    const restoredEvents = [...currentEvents, ...pendingDelete.deletedData];
    localStorage.setItem('soc-events', JSON.stringify(restoredEvents));
    
    // Dispatch event to update dashboard
    window.dispatchEvent(new CustomEvent('soc-data-updated'));
    
    console.log(`[Data Management] Restored ${pendingDelete.deletedData.length} events`);
    
    if (pendingDelete.intervalId) {
      clearInterval(pendingDelete.intervalId);
    }
    setPendingDelete(null);
  }, [pendingDelete]);

  const handleAddMockData = useCallback(async () => {
    setAddingMockData(true);
    try {
      const { generateMockEvents } = await import('@/data/mockEvents');
      // Generate 1000 events spread across 1 day for realistic demo
      const mockEvents = generateMockEvents(1000);
      
      const currentEvents = JSON.parse(localStorage.getItem('soc-events') || '[]');
      const newEvents = [...mockEvents.map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })), ...currentEvents];
      localStorage.setItem('soc-events', JSON.stringify(newEvents));
      
      window.dispatchEvent(new CustomEvent('soc-data-updated'));
    } catch (error) {
      console.error('Failed to add mock data:', error);
    } finally {
      setAddingMockData(false);
    }
  }, []);

  // Fetch connected sources when section is opened
  useEffect(() => {
    if (activeSection === 'sources' && apiUrl) {
      fetchConnectedSources();
    }
  }, [activeSection, apiUrl, fetchConnectedSources]);

  // Fetch NIDS logs when debug section is opened
  useEffect(() => {
    if (activeSection === 'nids_debug' && apiUrl) {
      fetchNidsLogs();
    }
  }, [activeSection, apiUrl, fetchNidsLogs]);

  // Auto-refresh NIDS logs
  useEffect(() => {
    if (!autoRefreshLogs || activeSection !== 'nids_debug') return;
    const interval = setInterval(fetchNidsLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefreshLogs, activeSection, fetchNidsLogs]);
  
  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('soc-timezone', timezone);
  }, [timezone]);
  
  useEffect(() => {
    localStorage.setItem('soc-blacklist', JSON.stringify(blacklist));
  }, [blacklist]);
  
  useEffect(() => {
    localStorage.setItem('soc-whitelist', JSON.stringify(whitelist));
  }, [whitelist]);

  // Save Telegram config
  useEffect(() => {
    localStorage.setItem('soc-telegram-config', JSON.stringify(telegramConfig));
  }, [telegramConfig]);

  // Telegram test function - call AI Engine (port 8000) directly
  const handleTestTelegram = useCallback(async () => {
    if (!telegramConfig.botToken?.trim() || !telegramConfig.chatId?.trim()) {
      setTelegramTestStatus('error');
      setTelegramTestMessage('Vui lòng nhập Bot Token và Chat ID');
      return;
    }

    // Validate chat_id (Telegram chat id is integer: can be negative for groups)
    const chatIdClean = telegramConfig.chatId.trim();
    if (!/^-?\d+$/.test(chatIdClean)) {
      setTelegramTestStatus('error');
      setTelegramTestMessage('Chat ID phải là số nguyên (ví dụ: 123456 hoặc -1001234567890)');
      return;
    }

    if (!apiUrl) {
      setTelegramTestStatus('error');
      setTelegramTestMessage('Vui lòng cấu hình AI Engine URL trong phần Telegram trước');
      return;
    }

    setTelegramTestStatus('testing');
    try {
      // AI Engine URL - ensure we're calling port 8000
      const aiEngineUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
      
      // First configure telegram bot on AI Engine
      const configResponse = await fetch(`${aiEngineUrl}/telegram/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: telegramConfig.botToken.trim(),
          chat_id: chatIdClean,
          confidence_threshold: telegramConfig.confidenceThreshold, // <-- must be integer percent
        }),
      });

      const configData = await configResponse.json().catch(() => ({}));
      
      // Helper to extract error message from various response formats
      const extractErrorMessage = (data: any): string => {
        if (!data) return '';
        if (typeof data === 'string') return data;
        if (typeof data.detail === 'string') return data.detail;
        if (typeof data.detail === 'object' && data.detail?.msg) return data.detail.msg;
        if (Array.isArray(data.detail)) return data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        if (typeof data.error === 'string') return data.error;
        if (typeof data.error === 'object') return JSON.stringify(data.error);
        if (typeof data.message === 'string') return data.message;
        if (typeof data.message === 'object') return JSON.stringify(data.message);
        return '';
      };
      
      if (!configResponse.ok) {
        const errorMsg = extractErrorMessage(configData) || `Configure failed (${configResponse.status})`;
        throw new Error(errorMsg);
      }

      // Then send test alert through AI Engine
      const response = await fetch(`${aiEngineUrl}/telegram/send-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: 'test-' + Date.now(),
          verdict: 'ALERT',
          confidence: 0.95,
          src_ip: '192.168.1.100',
          dst_ip: '10.0.0.1',
          attack_type: 'Test Connection',
          description: `✅ Kết nối Telegram thành công!\n📊 Confidence threshold: ${telegramConfig.confidenceThreshold}%\n⏰ ${new Date().toLocaleString('vi-VN')}`,
        }),
      });

      const data = await response.json().catch(() => ({}));
      
      if (response.ok && data.success) {
        setTelegramTestStatus('success');
        setTelegramTestMessage('Gửi tin nhắn test thành công!');
      } else {
        setTelegramTestStatus('error');
        const errorMsg = extractErrorMessage(data) || `Send failed (${response.status})`;
        setTelegramTestMessage(errorMsg);
      }
    } catch (error: any) {
      console.error('Telegram test error:', error);
      setTelegramTestStatus('error');
      const errMsg = error?.message || '';
      setTelegramTestMessage(typeof errMsg === 'string' ? errMsg : 'Không thể kết nối đến AI Engine. Kiểm tra URL.');
    }

    // Reset status after 5s
    setTimeout(() => {
      setTelegramTestStatus('idle');
      setTelegramTestMessage('');
    }, 5000);
  }, [telegramConfig, apiUrl]);
  
  // Early return AFTER all hooks are defined
  if (!isOpen) return null;
  
  const currentList = activeSection === 'blacklist' ? blacklist : whitelist;
  const setCurrentList = activeSection === 'blacklist' ? setBlacklist : setWhitelist;
  
  // Helper to show confirmation for critical actions
  const confirmAction = (
    actionType: ConfirmActionType,
    action: () => Promise<void> | void,
    targetValue?: string,
    details?: string
  ) => {
    showConfirm(actionType, action, targetValue, details);
  };
  
  const handleAddItem = () => {
    if (!newItem.value.trim()) return;
    
    const executeAdd = () => {
      const item: ListItem = {
        id: Date.now().toString(),
        value: newItem.value.trim(),
        type: newItem.type,
        note: newItem.note.trim(),
      };
      setCurrentList([...currentList, item]);
      setNewItem({ value: '', type: 'ip', note: '' });
    };
    
    // Show confirmation for adding to lists
    confirmAction(
      activeSection === 'blacklist' ? 'add_blacklist' : 'add_whitelist',
      executeAdd,
      newItem.value.trim(),
      newItem.note.trim() || undefined
    );
  };
  
  const handleDeleteItem = (id: string) => {
    const item = currentList.find(i => i.id === id);
    if (!item) return;
    
    const executeDelete = () => {
      setCurrentList(currentList.filter(i => i.id !== id));
    };
    
    confirmAction(
      activeSection === 'blacklist' ? 'remove_blacklist' : 'remove_whitelist',
      executeDelete,
      item.value,
      item.note || undefined
    );
  };
  
  const handleUpdateItem = (id: string, updates: Partial<ListItem>) => {
    setCurrentList(currentList.map(item => item.id === id ? { ...item, ...updates } : item));
    setEditingId(null);
  };

  const handleSaveApiUrl = () => {
    const trimmedUrl = apiUrlInput.trim();
    localStorage.setItem('soc-api-url', trimmedUrl);
    setApiUrl(trimmedUrl); // Update state for reactivity
    fetchConnectedSources();
  };
  
  const sections = [
    { id: 'general', label: t('settings.general'), icon: Settings },
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'telegram', label: 'Telegram Alerts', icon: Send },
    { id: 'data', label: 'Data Management', icon: Database },
    { id: 'sources', label: 'NIDS Sources', icon: Server },
    { id: 'nids_debug', label: 'NIDS Debug Logs', icon: Terminal },
    { id: 'blocked', label: 'Blocked IPs', icon: Ban },
    { id: 'blacklist', label: t('settings.blacklist'), icon: Shield },
    { id: 'whitelist', label: t('settings.whitelist'), icon: List },
    
  ];

  // Health Section Renderer
  const renderHealthSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold text-foreground`}>
        System Health
      </div>
      <p className={`text-[11px] text-muted-foreground`}>
        Kiểm tra định kỳ tình trạng NIDS shipper và pfSense/Telegram để tránh nhấp nháy trạng thái trên giao diện.
      </p>
      <SystemHealthMonitor isDarkMode={isDarkMode} apiUrl={apiUrl} />
    </div>
  );

  // Telegram Section Renderer
  const renderTelegramSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold text-foreground`}>
        Telegram Alert Configuration
      </div>
      <p className={`text-[11px] text-muted-foreground`}>
        Cấu hình gửi cảnh báo qua Telegram Bot. Chỉ gửi các sự kiện có mức độ tin cậy cao để tránh spam.
      </p>

      {/* Enable Toggle */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${telegramConfig.enabled ? 'bg-muted text-foreground' : 'bg-muted/50 text-muted-foreground/60'}`}>
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-[12px] font-semibold text-foreground`}>
                Telegram Alerts
              </div>
              <div className={`text-[10px] text-muted-foreground`}>
                {telegramConfig.enabled ? 'Đang bật - Gửi cảnh báo tự động' : 'Đang tắt'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setTelegramConfig({ ...telegramConfig, enabled: !telegramConfig.enabled })}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              telegramConfig.enabled ? 'bg-foreground' : 'bg-muted'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
              telegramConfig.enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* AI Engine URL - Required for Telegram */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className={`text-[11px] font-semibold mb-2 flex items-center gap-2 text-foreground`}>
          <Server className="w-4 h-4 text-muted-foreground" />
          AI Engine URL
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="http://10.10.10.20:8000"
            value={apiUrlInput}
            onChange={(e) => setApiUrlInput(e.target.value)}
            className={`flex-1 h-9 px-3 text-[11px] font-mono border rounded-md bg-background border-border text-foreground placeholder:text-muted-foreground/60`}
          />
          <button
            onClick={handleSaveApiUrl}
            className="px-4 h-9 text-[11px] font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors"
          >
            Lưu
          </button>
        </div>
        <p className={`mt-1.5 text-[9px] text-muted-foreground/70`}>
          URL của AI Engine (port 8000). Ví dụ: http://10.10.10.20:8000. Bắt buộc để gửi Telegram và block IP.
        </p>
        {apiUrl && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--soc-success))] animate-pulse" />
            <span className={`text-[9px] text-[hsl(var(--soc-success))]`}>
              Đã kết nối: {apiUrl}
            </span>
          </div>
        )}
      </div>

      {/* Bot Configuration */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className={`text-[11px] font-semibold mb-4 flex items-center gap-2 text-foreground`}>
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          Bot Configuration
        </div>

        <div className="space-y-4">
          {/* Bot Token */}
          <div>
            <label className={`block text-[11px] font-medium mb-1.5 text-muted-foreground`}>
              Bot Token
            </label>
            <input
              type="password"
              placeholder="123456789:ABCDefGHIjklMNOpqrSTUvwxYZ"
              value={telegramConfig.botToken}
              onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
              className={`w-full h-9 px-3 text-[11px] font-mono border rounded-md bg-background border-border text-foreground placeholder:text-muted-foreground/60`}
            />
            <p className={`mt-1 text-[9px] text-muted-foreground/70`}>
              Tạo bot tại @BotFather, copy token có dạng: 123456789:ABCxyz...
            </p>
          </div>

          {/* Chat ID */}
          <div>
            <label className={`block text-[11px] font-medium mb-1.5 text-muted-foreground`}>
              Chat ID
            </label>
            <input
              type="text"
              placeholder="-1001234567890 hoặc 123456789"
              value={telegramConfig.chatId}
              onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
              className={`w-full h-9 px-3 text-[11px] font-mono border rounded-md bg-background border-border text-foreground placeholder:text-muted-foreground/60`}
            />
            <p className={`mt-1 text-[9px] text-muted-foreground/70`}>
              Chat ID của nhóm hoặc cá nhân. Dùng @userinfobot để lấy ID
            </p>
          </div>

          {/* Test Button */}
          <button
            onClick={handleTestTelegram}
            disabled={telegramTestStatus === 'testing' || !telegramConfig.botToken || !telegramConfig.chatId}
            className={`w-full flex items-center justify-center gap-2 h-10 rounded-md font-medium text-[11px] transition-colors ${
              telegramTestStatus === 'success'
                ? 'bg-[hsl(var(--soc-success))] text-background'
                : telegramTestStatus === 'error'
                  ? 'bg-[hsl(var(--soc-alert))] text-background'
                  : 'bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground'
            }`}
          >
            {telegramTestStatus === 'testing' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Đang gửi test...
              </>
            ) : telegramTestStatus === 'success' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                {telegramTestMessage}
              </>
            ) : telegramTestStatus === 'error' ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                {telegramTestMessage}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Test Kết Nối
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alert Settings */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className={`text-[11px] font-semibold mb-4 flex items-center gap-2 text-foreground`}>
          <Bell className="w-4 h-4 text-muted-foreground" />
          Alert Settings
        </div>

        {/* Confidence Threshold */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className={`text-[11px] font-medium text-muted-foreground`}>
              Confidence Threshold
            </label>
            <span className={`text-[12px] font-bold ${
              telegramConfig.confidenceThreshold >= 90 ? 'text-[hsl(var(--soc-alert))]' :
              telegramConfig.confidenceThreshold >= 80 ? 'text-[hsl(var(--soc-warning))]' : 'text-foreground'
            }`}>
              {telegramConfig.confidenceThreshold}%
            </span>
          </div>
          <input
            type="range"
            min="50"
            max="99"
            value={telegramConfig.confidenceThreshold}
            onChange={(e) => setTelegramConfig({ ...telegramConfig, confidenceThreshold: parseInt(e.target.value) })}
            className="w-full h-2 rounded-md appearance-none cursor-pointer bg-muted"
            style={{
              background: `linear-gradient(to right, hsl(var(--foreground)) 0%, hsl(var(--foreground)) ${(telegramConfig.confidenceThreshold - 50) / 49 * 100}%, hsl(var(--muted)) ${(telegramConfig.confidenceThreshold - 50) / 49 * 100}%, hsl(var(--muted)) 100%)`
            }}
          />
          <p className={`mt-2 text-[9px] text-muted-foreground/70`}>
            Chỉ gửi cảnh báo khi AI confidence ≥ {telegramConfig.confidenceThreshold}%. Khuyến nghị: 80-90% để tránh spam.
          </p>
        </div>

        {/* Alert Types */}
        <div className="mb-4">
          <label className={`block text-[11px] font-medium mb-2 text-muted-foreground`}>
            Loại cảnh báo gửi
          </label>
          <div className="grid grid-cols-2 gap-2">
            {['ALERT', 'SUSPICIOUS'].map((type) => (
              <button
                key={type}
                onClick={() => {
                  const types = telegramConfig.alertTypes.includes(type)
                    ? telegramConfig.alertTypes.filter((t: string) => t !== type)
                    : [...telegramConfig.alertTypes, type];
                  setTelegramConfig({ ...telegramConfig, alertTypes: types });
                }}
                className={`p-2 rounded-md border text-[11px] font-medium transition-all ${
                  telegramConfig.alertTypes.includes(type)
                    ? type === 'ALERT'
                      ? 'bg-[hsl(var(--soc-alert))]/10 border-[hsl(var(--soc-alert))]/40 text-[hsl(var(--soc-alert))]'
                      : 'bg-[hsl(var(--soc-warning))]/10 border-[hsl(var(--soc-warning))]/40 text-[hsl(var(--soc-warning))]'
                    : 'bg-background/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Action Notifications */}
        <div>
          <label className={`block text-[11px] font-medium mb-2 text-muted-foreground`}>
            Thông báo hành động quan trọng
          </label>
          <div className="space-y-2">
            {[
              { key: 'notifyBlockIP', label: 'Block IP', desc: 'Khi có IP bị block trên firewall' },
              { key: 'notifyWhitelist', label: 'Whitelist', desc: 'Thêm/xóa IP khỏi whitelist' },
              { key: 'notifyBlacklist', label: 'Blacklist', desc: 'Thêm/xóa IP khỏi blacklist' },
            ].map(({ key, label, desc }) => (
              <div 
                key={key}
                className={`flex items-center justify-between p-3 rounded-md border bg-background/40 border-border`}
              >
                <div>
                  <div className={`text-[11px] font-medium text-foreground`}>{label}</div>
                  <div className={`text-[9px] text-muted-foreground/70`}>{desc}</div>
                </div>
                <button
                  onClick={() => setTelegramConfig({ ...telegramConfig, [key]: !telegramConfig[key as keyof typeof telegramConfig] })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    telegramConfig[key as keyof typeof telegramConfig] ? 'bg-foreground' : 'bg-muted'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    telegramConfig[key as keyof typeof telegramConfig] ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Telegram Bot Commands Info */}
      <div className={`p-4 rounded-md border bg-muted/30 border-border`}>
        <div className={`text-[11px] font-semibold mb-3 text-foreground`}>
          Telegram Bot Commands
        </div>
        <div className={`space-y-2 text-[10px] font-mono text-muted-foreground`}>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-muted rounded text-foreground">/status</code>
            <span>- Xem trạng thái hệ thống (CPU, RAM, Disk, Network)</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-muted rounded text-foreground">/logs [5m|30m|1h|12h|1d]</code>
            <span>- Xem log theo thời gian</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-muted rounded text-foreground">/blocked</code>
            <span>- Danh sách IP đang bị block</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-muted rounded text-foreground">/stats</code>
            <span>- Thống kê sự kiện hôm nay</span>
          </div>
        </div>
        <p className={`mt-3 text-[9px] text-muted-foreground/70`}>
          Bot cần được chạy trên server backend (AI-Engine) để xử lý commands.
        </p>
      </div>
    </div>
  );

  const handleDeleteData = (timeRange: string) => {
    const range = TIME_RANGES.find(r => r.value === timeRange);
    confirmAction(
      'delete_data',
      () => executeDeleteData(timeRange),
      range?.label || timeRange,
      'Dữ liệu có thể khôi phục trong vòng 2 phút'
    );
  };

  const handleToggleMockData = (enabled: boolean) => {
    setMockDataEnabled(enabled);
    localStorage.setItem('soc-mock-data-enabled', enabled ? 'true' : 'false');
    // Dispatch event to update dashboard
    window.dispatchEvent(new CustomEvent('soc-data-updated'));
  };

  const renderDataManagementSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold text-foreground`}>
        Data Management
      </div>
      <p className={`text-[11px] text-muted-foreground`}>
        Quản lý dữ liệu sự kiện trong dashboard. Bật/tắt mock data, xóa dữ liệu cũ hoặc thêm dữ liệu demo.
      </p>

      {/* NIDS Data Toggle */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${nidsDataEnabled ? 'bg-[hsl(var(--soc-success))]/20 text-[#4ade80]' : isDarkMode ? 'bg-muted text-muted-foreground/70' : 'bg-muted text-muted-foreground/70'}`}>
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-[12px] font-semibold text-foreground`}>
                NIDS Data (Real)
              </div>
              <div className={`text-[10px] text-muted-foreground`}>
                {nidsDataEnabled ? 'Đang bật - Nhận dữ liệu từ Suricata/Zeek' : 'Đang tắt - Không hiển thị dữ liệu NIDS'}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              const newValue = !nidsDataEnabled;
              setNidsDataEnabled(newValue);
              localStorage.setItem('soc-nids-data-enabled', String(newValue));
              window.dispatchEvent(new CustomEvent('soc-data-updated'));
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              nidsDataEnabled ? 'bg-[hsl(var(--soc-success))]' : isDarkMode ? 'bg-muted' : 'bg-muted'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
              nidsDataEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
        <p className={`mt-3 text-[9px] text-muted-foreground/70`}>
          Dữ liệu thật từ NIDS (Suricata/Zeek) qua WebSocket. Mặc định: BẬT.
        </p>
      </div>

      {/* Mock Data Toggle */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${mockDataEnabled ? 'bg-[hsl(var(--soc-warning))]/10 text-[hsl(var(--soc-warning))]' : isDarkMode ? 'bg-muted text-muted-foreground/70' : 'bg-muted text-muted-foreground/70'}`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-[12px] font-semibold text-foreground`}>
                Mock Data (Demo)
              </div>
              <div className={`text-[10px] text-muted-foreground`}>
                {mockDataEnabled ? 'Đang bật - Tự động tạo dữ liệu giả lập' : 'Đang tắt - Chỉ hiển thị dữ liệu thật'}
              </div>
            </div>
          </div>
          <button
            onClick={() => handleToggleMockData(!mockDataEnabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              mockDataEnabled ? 'bg-[#f59e0b]' : isDarkMode ? 'bg-muted' : 'bg-muted'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
              mockDataEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
        <p className={`mt-3 text-[9px] text-muted-foreground/70`}>
          Khi tắt, dashboard sẽ chỉ hiển thị dữ liệu thật từ NIDS. Mặc định: TẮT.
        </p>
      </div>

      {/* Recovery Banner */}
      {pendingDelete && (
        <div className={`p-4 rounded-md border-2 animate-pulse ${isDarkMode ? 'bg-[#422006] border-[hsl(var(--soc-warning))]/40' : 'bg-[#fef3c7] border-[hsl(var(--soc-warning))]/40'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-[hsl(var(--soc-warning))]" />
              <div>
                <div className={`text-[12px] font-semibold ${isDarkMode ? 'text-[hsl(var(--soc-warning))]' : 'text-[#92400e]'}`}>
                  Dữ liệu đã xóa - Có thể khôi phục
                </div>
                <div className={`text-[10px] ${isDarkMode ? 'text-[#fcd34d]' : 'text-[#a16207]'}`}>
                  {pendingDelete.deletedData?.length || 0} sự kiện đã bị xóa. Còn {pendingDelete.countdown}s để khôi phục.
                </div>
              </div>
            </div>
            <button
              onClick={handleRecoverData}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-[hsl(var(--soc-success))] text-background text-[11px] font-semibold hover:bg-[hsl(var(--soc-success))]/85 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Khôi phục ({pendingDelete.countdown}s)
            </button>
          </div>
          <div className="mt-3 h-1 bg-[#fcd34d]/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#f59e0b] transition-all duration-1000"
              style={{ width: `${(pendingDelete.countdown / 120) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Delete Data Section */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className={`text-[11px] font-semibold mb-3 flex items-center gap-2 text-foreground`}>
          <Trash2 className="w-4 h-4 text-[hsl(var(--soc-alert))]" />
          Xóa Dữ Liệu Sự Kiện
        </div>
        <p className={`text-[10px] mb-4 text-muted-foreground`}>
          Xóa các sự kiện trong khoảng thời gian. Dữ liệu có thể khôi phục trong vòng 2 phút sau khi xóa.
        </p>
        
        <div className="grid grid-cols-3 gap-2">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => handleDeleteData(range.value)}
              disabled={!!pendingDelete}
              className={`p-3 rounded-md border text-center transition-all ${
                isDarkMode
                  ? 'bg-background/60 border-border text-muted-foreground hover:border-[hsl(var(--soc-alert))]/40 hover:text-[hsl(var(--soc-alert))] disabled:opacity-50'
                  : 'bg-white border-border text-muted-foreground hover:border-[hsl(var(--soc-alert))]/40 hover:text-[hsl(var(--soc-alert))] disabled:opacity-50'
              }`}
            >
              <div className={`text-[12px] font-medium text-foreground`}>
                {range.label}
              </div>
              <div className={`text-[9px] mt-0.5 text-muted-foreground/70`}>
                {range.value === 'all' ? 'Xóa toàn bộ' : `Trong ${range.label} qua`}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Add Mock Data Section */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className={`text-[11px] font-semibold mb-3 flex items-center gap-2 text-foreground`}>
          <Plus className="w-4 h-4 text-foreground" />
          Thêm Dữ Liệu Demo
        </div>
        <p className={`text-[10px] mb-4 text-muted-foreground`}>
          Thêm 1000 sự kiện giả lập (70% Suricata, 30% Zeek) phân bổ trong 24h để demo dashboard. Lưu ý: Zeek không có ALERT, chỉ Suricata mới có.
        </p>
        
        <button
          onClick={handleAddMockData}
          disabled={addingMockData}
          className={`w-full p-3 rounded-md border flex items-center justify-center gap-2 transition-all ${
            isDarkMode
              ? 'bg-[#1e3a5f] border-border text-foreground hover:bg-[#1e40af] disabled:opacity-50'
              : 'bg-[#eff6ff] border-border text-foreground hover:bg-[#dbeafe] disabled:opacity-50'
          }`}
        >
          {addingMockData ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Đang thêm...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Thêm 1000 Sự Kiện Demo
            </>
          )}
        </button>
      </div>

      {/* Warning */}
      <div className={`p-3 rounded-md border ${isDarkMode ? 'bg-[#450a0a] border-[hsl(var(--soc-alert))]/40/30' : 'bg-[#fef2f2] border-[#fecaca]'}`}>
        <div className={`text-[10px] ${isDarkMode ? 'text-[#fca5a5]' : 'text-[#b91c1c]'}`}>
          <strong>Lưu ý:</strong> Sau 2 phút, dữ liệu sẽ bị xóa vĩnh viễn và không thể khôi phục. 
          Hãy đảm bảo bạn đã sao lưu dữ liệu quan trọng trước khi xóa.
        </div>
      </div>
    </div>
  );

  const renderSourcesSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold text-foreground`}>
        Connected NIDS Sources
      </div>
      <p className={`text-[11px] text-muted-foreground`}>
        View IP addresses of machines sending logs (Suricata/Zeek) to this dashboard.
      </p>

      {/* API URL Configuration */}
      <div className={`p-4 rounded-md border bg-background/40 border-border`}>
        <div className={`text-[11px] font-semibold mb-2 text-foreground`}>
          Backend API URL
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="http://192.168.1.100:3001"
            value={apiUrlInput}
            onChange={(e) => setApiUrlInput(e.target.value)}
            className={`flex-1 h-9 px-3 text-[11px] border rounded-md bg-background border-border text-foreground placeholder:text-muted-foreground/60`}
          />
          <button
            onClick={handleSaveApiUrl}
            className="px-4 h-9 text-[11px] font-medium bg-foreground text-white rounded-md hover:bg-[#2563eb]"
          >
            Save & Test
          </button>
        </div>
        <p className={`mt-2 text-[10px] text-muted-foreground/70`}>
          Enter the URL of your self-hosted SOC backend server
        </p>
      </div>

      {/* Connected Sources List */}
      <div className={`border rounded-md overflow-hidden border-border`}>
        <div className={`p-3 border-b ${isDarkMode ? 'bg-background/60 border-border' : 'bg-muted border-border'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium text-muted-foreground`}>
              NIDS Machines Sending Logs
            </span>
            <button
              onClick={fetchConnectedSources}
              className={`text-[10px] px-2 py-1 rounded ${isDarkMode ? 'bg-muted text-muted-foreground hover:bg-[#3f3f46]' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
            >
              Refresh
            </button>
          </div>
        </div>

        {loadingSources ? (
          <div className={`p-8 text-center text-muted-foreground/70`}>
            <div className="animate-spin w-6 h-6 border-2 border-border border-t-transparent rounded-full mx-auto mb-2"></div>
            Loading...
          </div>
        ) : !apiUrl ? (
          <div className={`p-8 text-center text-muted-foreground/70`}>
            <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-[11px]">Configure Backend API URL first</div>
          </div>
        ) : connectedSources.length === 0 ? (
          <div className={`p-8 text-center text-muted-foreground/70`}>
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-[11px]">No NIDS sources connected yet</div>
            <div className="text-[10px] mt-1">Start sending logs from Suricata/Zeek</div>
          </div>
        ) : (
          <div className="divide-y divide-[#27272a]">
            {connectedSources.map((source) => (
              <div key={source.id} className={`p-4 hover:bg-muted/40`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center ${
                      source.source_type.includes('Suricata') 
                        ? 'bg-[hsl(var(--soc-alert))]/10 text-[hsl(var(--soc-alert))]' 
                        : 'bg-muted text-foreground'
                    }`}>
                      <Wifi className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`text-[13px] font-mono font-semibold text-foreground`}>
                        {source.ip_address}
                      </div>
                      <div className={`text-[10px] text-muted-foreground`}>
                        {source.hostname}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-1">
                      {source.source_type.split(', ').map((type, i) => (
                        <span key={i} className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                          type === 'Suricata' 
                            ? 'bg-[hsl(var(--soc-alert))]/10 text-[hsl(var(--soc-alert))]' 
                            : 'bg-muted text-foreground'
                        }`}>
                          {type}
                        </span>
                      ))}
                    </div>
                    <div className={`text-[10px] mt-1 text-muted-foreground/70`}>
                      {source.total_events.toLocaleString()} events
                    </div>
                  </div>
                </div>
                <div className={`mt-2 text-[10px] text-muted-foreground/70`}>
                  Last seen: {new Date(source.last_seen).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Endpoint Info */}
      {apiUrl && (
        <div className={`p-4 rounded-md border bg-background/40 border-border`}>
          <div className={`text-[11px] font-semibold mb-3 text-foreground`}>
            Log Ingestion Endpoints
          </div>
          <div className={`space-y-2 text-[11px] font-mono text-muted-foreground`}>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[hsl(var(--soc-alert))]/10 text-[hsl(var(--soc-alert))] rounded text-[9px]">Suricata</span>
              <code className={`flex-1 p-2 rounded ${isDarkMode ? 'bg-background' : 'bg-muted'}`}>
                POST {apiUrl}/api/ingest/suricata
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-muted text-foreground rounded text-[9px]">Zeek</span>
              <code className={`flex-1 p-2 rounded ${isDarkMode ? 'bg-background' : 'bg-muted'}`}>
                POST {apiUrl}/api/ingest/zeek
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // NIDS Debug Logs Section
  const renderNidsDebugSection = () => {
    const getLevelColor = (level: string) => {
      switch (level) {
        case 'ERROR': return 'bg-[hsl(var(--soc-alert))]/10 text-[hsl(var(--soc-alert))]';
        case 'WARNING': return 'bg-[hsl(var(--soc-warning))]/10 text-[hsl(var(--soc-warning))]';
        default: return 'bg-muted text-foreground';
      }
    };

    const getSourceColor = (source: string) => {
      if (source.toLowerCase().includes('suricata')) return 'bg-[hsl(var(--soc-alert))]/10 text-[hsl(var(--soc-alert))]';
      if (source.toLowerCase().includes('zeek')) return 'bg-muted text-foreground';
      if (source.toLowerCase().includes('backend')) return 'bg-[#8b5cf6]/20 text-[#a78bfa]';
      if (source.toLowerCase().includes('websocket')) return 'bg-[hsl(var(--soc-success))]/20 text-[#4ade80]';
      return isDarkMode ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground';
    };

    return (
      <div className="space-y-6">
        <div className={`text-sm font-semibold text-foreground`}>
          NIDS Ingest Debug Logs
        </div>
        <p className={`text-[11px] text-muted-foreground`}>
          Xem logs từ ai_log_shipper để debug khi không nhận được events. Logs được lưu trong bộ nhớ AI Engine (tối đa 500 entries).
        </p>

        {/* Controls */}
        <div className={`p-4 rounded-md border bg-background/40 border-border`}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Level Filter */}
            <select
              value={nidsLogFilter}
              onChange={(e) => setNidsLogFilter(e.target.value as any)}
              className={`h-8 px-2 text-[11px] border rounded-md ${
                isDarkMode 
                  ? 'bg-background border-border text-foreground' 
                  : 'bg-white border-border text-foreground'
              }`}
            >
              <option value="all">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
            </select>

            {/* Source Filter */}
            <select
              value={nidsSourceFilter}
              onChange={(e) => setNidsSourceFilter(e.target.value as any)}
              className={`h-8 px-2 text-[11px] border rounded-md ${
                isDarkMode 
                  ? 'bg-background border-border text-foreground' 
                  : 'bg-white border-border text-foreground'
              }`}
            >
              <option value="all">All Sources</option>
              <option value="suricata">Suricata</option>
              <option value="zeek">Zeek</option>
            </select>

            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
              className={`flex items-center gap-1.5 h-8 px-3 text-[11px] rounded-md border transition-colors ${
                autoRefreshLogs
                  ? 'bg-[hsl(var(--soc-success))]/20 border-[#22c55e]/50 text-[#4ade80]'
                  : isDarkMode 
                    ? 'bg-background border-border text-muted-foreground hover:bg-background/60' 
                    : 'bg-white border-border text-muted-foreground hover:bg-muted/30'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${autoRefreshLogs ? 'animate-spin' : ''}`} />
              Auto (3s)
            </button>

            {/* Manual Refresh */}
            <button
              onClick={fetchNidsLogs}
              disabled={nidsLogsLoading}
              className={`flex items-center gap-1.5 h-8 px-3 text-[11px] rounded-md transition-colors ${
                isDarkMode 
                  ? 'bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground' 
                  : 'bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${nidsLogsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {/* Clear Logs */}
            <button
              onClick={clearNidsLogs}
              className={`flex items-center gap-1.5 h-8 px-3 text-[11px] rounded-md transition-colors ${
                isDarkMode 
                  ? 'bg-[hsl(var(--soc-alert))]/10 text-[hsl(var(--soc-alert))] hover:bg-[#dc2626]/30' 
                  : 'bg-[#fef2f2] text-[hsl(var(--soc-alert))] hover:bg-[#fee2e2]'
              }`}
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>

          {/* Stats */}
          <div className={`flex items-center gap-4 text-[10px] text-muted-foreground/70`}>
            <span>Showing: {nidsLogs.length} logs</span>
          </div>
        </div>

        {/* Logs Display */}
        <div className={`rounded-md border overflow-hidden ${isDarkMode ? 'bg-background border-border' : 'bg-muted/30 border-border'}`}>
          {!apiUrl ? (
            <div className={`p-8 text-center text-muted-foreground/70`}>
              <Terminal className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <div className="text-[12px]">Cấu hình Backend API URL trong mục General để xem logs</div>
            </div>
          ) : nidsLogsLoading && nidsLogs.length === 0 ? (
            <div className={`p-8 text-center text-muted-foreground/70`}>
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <div className="text-[11px]">Loading logs...</div>
            </div>
          ) : nidsLogs.length === 0 ? (
            <div className={`p-8 text-center text-muted-foreground/70`}>
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <div className="text-[12px] mb-1">Chưa có logs</div>
              <div className="text-[10px]">Logs sẽ xuất hiện khi ai_log_shipper gửi dữ liệu đến /ingest endpoint</div>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {nidsLogs.map((log, index) => (
                <div 
                  key={index} 
                  className={`p-3 border-b last:border-b-0 ${
                    isDarkMode ? 'border-[#1f1f1f] hover:bg-[#111]' : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="flex items-start gap-2 mb-1">
                    {/* Timestamp */}
                    <span className={`text-[9px] font-mono shrink-0 text-muted-foreground/70`}>
                      {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                    </span>
                    
                    {/* Level Badge */}
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium shrink-0 ${getLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                    
                    {/* Source Badge */}
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium shrink-0 ${getSourceColor(log.source)}`}>
                      {log.source}
                    </span>
                    
                    {/* Message */}
                    <span className={`text-[11px] text-foreground`}>
                      {log.message}
                    </span>
                  </div>
                  
                  {/* Details (if any) */}
                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className={`ml-[60px] mt-1 text-[10px] font-mono text-muted-foreground`}>
                      {Object.entries(log.details).map(([key, value]) => (
                        <span key={key} className="mr-3">
                          <span className={isDarkMode ? 'text-muted-foreground/70' : 'text-muted-foreground/70'}>{key}:</span>{' '}
                          <span className={isDarkMode ? 'text-muted-foreground' : 'text-muted-foreground'}>
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help Info */}
        <div className={`p-4 rounded-md border bg-background/40 border-border`}>
          <div className={`text-[11px] font-semibold mb-2 flex items-center gap-2 text-foreground`}>
            <HelpCircle className="w-4 h-4 text-foreground" />
            Troubleshooting
          </div>
          <ul className={`text-[10px] space-y-1 text-muted-foreground`}>
            <li>• Nếu không thấy logs: Kiểm tra ai_log_shipper.py đang chạy trên NIDS (172.16.16.20)</li>
            <li>• Kiểm tra AI_SERVER_URL trong shipper trỏ đúng: http://10.10.10.20:8000/ingest</li>
            <li>• Xác nhận firewall mở port 8000 trên máy AI</li>
            <li>• Chạy: <code className={`px-1 py-0.5 rounded bg-muted`}>curl http://10.10.10.20:8000/ingest/status</code></li>
          </ul>
        </div>
      </div>
    );
  };

  const renderBlockedIPsSection = () => {
    const fetchPfSenseBlockedIPs = async () => {
      if (!apiUrl) return;
      setBlockedIPsLoading(true);
      try {
        // AI Engine uses port 8000
        const aiEngineUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
        const response = await fetch(`${aiEngineUrl}/blocked-ips`);
        if (response.ok) {
          const data = await response.json();
          setPfSenseBlockedIPs(data.ips || []);
        }
      } catch (error) {
        console.error('Failed to fetch blocked IPs:', error);
      } finally {
        setBlockedIPsLoading(false);
      }
    };

    const executeUnblockIP = async (ip: string) => {
      setUnblockingIP(ip);
      try {
        if (apiUrl) {
          // AI Engine uses port 8000
          const aiEngineUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
          await fetch(`${aiEngineUrl}/unblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip }),
          });
        }
        
        // Remove from localStorage and state
        const updated = blockedIPsList.filter((i: string) => i !== ip);
        localStorage.setItem('soc-blocked-ips', JSON.stringify(updated));
        setBlockedIPsList(updated);
      } catch (error) {
        console.error('Unblock failed:', error);
      } finally {
        setUnblockingIP(null);
      }
    };

    const handleUnblockIP = (ip: string) => {
      confirmAction(
        'unblock_ip',
        () => executeUnblockIP(ip),
        ip,
        'IP này sẽ được gỡ block khỏi pfSense Firewall'
      );
    };

    const executeRemoveFromList = (ip: string) => {
      const updated = blockedIPsList.filter((i: string) => i !== ip);
      localStorage.setItem('soc-blocked-ips', JSON.stringify(updated));
      setBlockedIPsList(updated);
    };

    const handleRemoveFromList = (ip: string) => {
      confirmAction(
        'remove_blacklist',
        () => executeRemoveFromList(ip),
        ip,
        'Chỉ xóa khỏi danh sách hiển thị, không ảnh hưởng đến firewall'
      );
    };

    return (
      <div className="space-y-6">
        <div className={`text-sm font-semibold text-foreground`}>
          Blocked IP Addresses
        </div>
        
        {/* Explanation box */}
        <div className={`p-3 rounded-md border ${isDarkMode ? 'bg-background/40 border-border' : 'bg-[#fef3c7] border-[#fcd34d]'}`}>
          <div className={`text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-[hsl(var(--soc-warning))]' : 'text-[#92400e]'}`}>
            Blocked IPs vs Blacklist - Sự khác biệt:
          </div>
          <div className={`text-[10px] space-y-1 ${isDarkMode ? 'text-muted-foreground' : 'text-[#78350f]'}`}>
            <p><strong className={isDarkMode ? 'text-[hsl(var(--soc-alert))]' : 'text-[hsl(var(--soc-alert))]'}>Blocked IPs:</strong> IP đã bị chặn THỰC SỰ trên Firewall (pfSense). Các IP này không thể truy cập hệ thống.</p>
            <p><strong className={isDarkMode ? 'text-[hsl(var(--soc-warning))]' : 'text-[#d97706]'}>Blacklist:</strong> Danh sách IP/Domain đánh dấu là độc hại để THAM KHẢO. Chưa bị block, dùng để cảnh báo khi xuất hiện.</p>
          </div>
        </div>

        <p className={`text-[11px] text-muted-foreground`}>
          Các IP bên dưới đã bị chặn trên Firewall thông qua AI-SOC hoặc pfSense. Chúng không thể kết nối đến hệ thống của bạn.
        </p>

        {/* Local Blocked IPs */}
        <div className={`border rounded-md overflow-hidden border-border`}>
          <div className={`p-3 border-b flex items-center justify-between ${isDarkMode ? 'bg-background/60 border-border' : 'bg-muted border-border'}`}>
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-[hsl(var(--soc-alert))]" />
              <span className={`text-[11px] font-semibold text-foreground`}>
                Blocked IPs ({blockedIPsList.length})
              </span>
            </div>
            {apiUrl && (
              <button
                onClick={fetchPfSenseBlockedIPs}
                disabled={blockedIPsLoading}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${isDarkMode ? 'bg-muted text-muted-foreground hover:bg-[#3f3f46]' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
              >
                <RefreshCw className={`w-3 h-3 ${blockedIPsLoading ? 'animate-spin' : ''}`} />
                Sync with pfSense
              </button>
            )}
          </div>

          {blockedIPsList.length === 0 ? (
            <div className={`p-8 text-center text-muted-foreground/70`}>
              <Ban className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <div className="text-[11px]">Chưa có IP nào bị block</div>
              <div className="text-[10px] mt-1">Các IP bị block sẽ hiển thị ở đây</div>
            </div>
          ) : (
            <div className="divide-y divide-[#27272a]">
              {blockedIPsList.map((ip) => (
                <div key={ip} className={`p-4 flex items-center justify-between hover:bg-muted/40`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-[hsl(var(--soc-alert))]/10 flex items-center justify-center">
                      <Ban className="w-5 h-5 text-[hsl(var(--soc-alert))]" />
                    </div>
                    <div>
                      <div className={`text-[13px] font-mono font-semibold text-foreground`}>
                        {ip}
                      </div>
                      <div className={`text-[10px] text-muted-foreground`}>
                        Blocked by AI-SOC
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-[hsl(var(--soc-alert))]/10 text-[hsl(var(--soc-alert))]">
                      BLOCKED
                    </span>
                    {apiUrl && (
                      <button
                        onClick={() => handleUnblockIP(ip)}
                        disabled={unblockingIP === ip}
                        className="px-3 py-1.5 text-[10px] font-medium bg-[#052e16] text-[#4ade80] border border-[#166534] rounded hover:bg-[#166534]/50 disabled:opacity-50"
                      >
                        {unblockingIP === ip ? '...' : 'Unblock'}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveFromList(ip)}
                      className="p-1.5 text-muted-foreground hover:text-[hsl(var(--soc-alert))] hover:bg-[#450a0a] rounded transition-colors"
                      title="Remove from list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* pfSense Sync Info */}
        {apiUrl && (
          <div className={`p-4 rounded-md border bg-background/40 border-border`}>
            <div className={`text-[11px] font-semibold mb-2 text-foreground`}>
              pfSense Integration
            </div>
            <p className={`text-[10px] text-muted-foreground`}>
              Khi block IP thông qua dashboard, IP sẽ được gửi đến AI-Engine để thêm vào alias <code className="bg-muted px-1 rounded">AI_Blocked_IP</code> trên pfSense firewall.
            </p>
            <div className={`mt-3 text-[10px] font-mono text-muted-foreground/70`}>
              API Endpoint: POST {apiUrl.replace(':3001', ':8000').replace(':3002', ':8000')}/block
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const renderListSection = () => (
    <div className="space-y-4">
      <div className={`text-sm font-semibold text-foreground`}>
        {activeSection === 'blacklist' ? t('list.blacklistTitle') : t('list.whitelistTitle')}
      </div>
      
      {/* Blacklist specific explanation */}
      {activeSection === 'blacklist' && (
        <div className={`p-3 rounded-md border ${isDarkMode ? 'bg-background/60 border-border' : 'bg-[#fef9c3] border-[#facc15]'}`}>
          <div className={`text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-[hsl(var(--soc-warning))]' : 'text-[#a16207]'}`}>
            Blacklist vs Blocked IPs:
          </div>
          <div className={`text-[10px] ${isDarkMode ? 'text-muted-foreground' : 'text-[#713f12]'}`}>
            Blacklist là danh sách <strong>THAM KHẢO</strong> các IP/Domain độc hại đã biết. Khi traffic từ các địa chỉ này xuất hiện, hệ thống sẽ cảnh báo ưu tiên cao hơn. Để CHẶN hoàn toàn IP trên firewall, hãy sử dụng tính năng "Block IP" trong Event Inspector.
          </div>
        </div>
      )}
      
      {/* Whitelist specific explanation */}
      {activeSection === 'whitelist' && (
        <div className={`p-3 rounded-md border ${isDarkMode ? 'bg-[#052e16] border-[#166534]' : 'bg-[#dcfce7] border-[#22c55e]'}`}>
          <div className={`text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-[#4ade80]' : 'text-[#166534]'}`}>
            Lưu ý về Whitelist:
          </div>
          <div className={`text-[10px] ${isDarkMode ? 'text-[#86efac]' : 'text-[#14532d]'}`}>
            Whitelist là danh sách IP/Domain được tin cậy. Traffic từ các địa chỉ này sẽ có mức cảnh báo thấp hơn. Các IP nội bộ, Gateway, DNS server nên được thêm vào đây.
          </div>
        </div>
      )}
      
      <p className={`text-[11px] text-muted-foreground`}>
        {activeSection === 'blacklist' ? t('list.blacklistDesc') : t('list.whitelistDesc')}
      </p>
      
      {/* Add new item form */}
      <div className={`p-3 border rounded-md bg-background/40 border-border`}>
        <div className="grid grid-cols-12 gap-2">
          <input
            type="text"
            placeholder={t('list.ipOrDomain')}
            value={newItem.value}
            onChange={(e) => setNewItem({ ...newItem, value: e.target.value })}
            className={`col-span-4 h-8 px-3 text-[11px] border rounded bg-background border-border text-foreground placeholder:text-muted-foreground/60`}
          />
          <select
            value={newItem.type}
            onChange={(e) => setNewItem({ ...newItem, type: e.target.value as 'ip' | 'domain' })}
            className={`col-span-2 h-8 px-2 text-[11px] border rounded ${
              isDarkMode 
                ? 'bg-background border-border text-foreground' 
                : 'bg-white border-border text-foreground'
            }`}
          >
            <option value="ip">IP</option>
            <option value="domain">Domain</option>
          </select>
          <input
            type="text"
            placeholder={t('list.note')}
            value={newItem.note}
            onChange={(e) => setNewItem({ ...newItem, note: e.target.value })}
            className={`col-span-4 h-8 px-3 text-[11px] border rounded bg-background border-border text-foreground placeholder:text-muted-foreground/60`}
          />
          <button
            onClick={handleAddItem}
            className={`col-span-2 h-8 text-[11px] font-medium rounded flex items-center justify-center gap-1 ${
              activeSection === 'blacklist'
                ? 'bg-[hsl(var(--soc-alert))] text-background hover:bg-[hsl(var(--soc-alert))]/85'
                : 'bg-[hsl(var(--soc-success))] text-background hover:bg-[hsl(var(--soc-success))]/85'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('list.add')}
          </button>
        </div>
      </div>
      
      {/* List items */}
      <div className={`border rounded-md overflow-hidden border-border`}>
        <table className="w-full text-[11px]">
          <thead>
            <tr className={isDarkMode ? 'bg-background/60' : 'bg-muted'}>
              <th className={`text-left py-2 px-3 font-medium text-muted-foreground`}>{t('list.value')}</th>
              <th className={`text-left py-2 px-3 font-medium text-muted-foreground`}>{t('list.type')}</th>
              <th className={`text-left py-2 px-3 font-medium text-muted-foreground`}>{t('list.note')}</th>
              <th className={`text-right py-2 px-3 font-medium text-muted-foreground`}>{t('list.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {currentList.length === 0 ? (
              <tr>
                <td colSpan={4} className={`text-center py-6 text-muted-foreground/70`}>
                  {t('list.empty')}
                </td>
              </tr>
            ) : currentList.map((item) => (
              <tr key={item.id} className={`border-t border-border`}>
                <td className={`py-2 px-3 font-mono text-foreground`}>
                  {editingId === item.id ? (
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) => handleUpdateItem(item.id, { value: e.target.value })}
                      className={`h-6 px-2 text-[11px] border rounded w-full ${
                        isDarkMode 
                          ? 'bg-background border-border text-foreground' 
                          : 'bg-white border-border text-foreground'
                      }`}
                    />
                  ) : item.value}
                </td>
                <td className={`py-2 px-3 text-muted-foreground`}>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    item.type === 'ip' 
                      ? isDarkMode ? 'bg-[#1e3a5f] text-foreground' : 'bg-[#dbeafe] text-foreground'
                      : isDarkMode ? 'bg-[#422006] text-[hsl(var(--soc-warning))]' : 'bg-[#fef3c7] text-[#d97706]'
                  }`}>
                    {item.type.toUpperCase()}
                  </span>
                </td>
                <td className={`py-2 px-3 text-muted-foreground`}>{item.note || '-'}</td>
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                      className={`p-1 rounded hover:bg-opacity-20 ${isDarkMode ? 'text-muted-foreground hover:bg-foreground hover:text-foreground' : 'text-muted-foreground/70 hover:bg-foreground hover:text-foreground'}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className={`p-1 rounded hover:bg-opacity-20 ${isDarkMode ? 'text-muted-foreground hover:bg-[#dc2626] hover:text-[hsl(var(--soc-alert))]' : 'text-muted-foreground/70 hover:bg-[#dc2626] hover:text-[hsl(var(--soc-alert))]'}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className={`text-[10px] text-muted-foreground/70`}>
        {t('list.total')}: {currentList.length} {t('list.items')}
      </div>
    </div>
  );
  
  const renderGeneralSection = () => (
    <div className="divide-y divide-border">
      {/* Language */}
      <div className="grid grid-cols-12 gap-4 py-4">
        <div className="col-span-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/90">
            {t('settings.language')}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Interface language</div>
        </div>
        <div className="col-span-8 flex gap-1">
          {[
            { value: 'en', label: 'English' },
            { value: 'vi', label: 'Tiếng Việt' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLanguage(value as 'en' | 'vi')}
              className={`h-8 px-3.5 text-[11px] font-medium tracking-normal rounded-md border transition-all ${
                language === value
                  ? 'bg-muted border-border text-foreground shadow-sm'
                  : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="grid grid-cols-12 gap-4 py-4">
        <div className="col-span-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/90">
            {t('settings.theme')}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Color scheme</div>
        </div>
        <div className="col-span-8 flex gap-1">
          {[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value as Theme)}
              className={`h-8 px-3.5 text-[11px] font-medium tracking-normal rounded-md border transition-all ${
                theme === value
                  ? 'bg-muted border-border text-foreground shadow-sm'
                  : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Timezone */}
      <div className="grid grid-cols-12 gap-4 py-4">
        <div className="col-span-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/90">
            {t('settings.timezone')}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t('settings.timezoneHint')}</div>
        </div>
        <div className="col-span-8">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full h-8 px-3 text-[11px] bg-background/60 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* System Info */}
      <div className="pt-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2 font-mono">
          {t('settings.sysInfo')}
        </div>
        <div className="border border-border rounded-md divide-y divide-border bg-background/40 overflow-hidden">
          {[
            { label: t('settings.version'), value: '2.0.0' },
            { label: t('settings.engine'), value: 'Hybrid NIDS' },
            { label: 'Mode', value: 'False Positive Reduction' },
            { label: t('settings.timezone'), value: timezone },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between px-3.5 py-2.5 text-[11px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-mono text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Credits */}
      <div className="pt-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2 font-mono">
          {t('help.devTeam')}
        </div>
        <div className="border border-border rounded-md bg-background/40 px-3.5 py-3 text-[11px] space-y-0.5">
          <div className="text-foreground font-medium">C1NE.03 Team</div>
          <div className="text-muted-foreground">Cybersecurity K28 · Duy Tan University</div>
          <div className="text-muted-foreground/70 text-[10px] pt-2 mt-2 border-t border-border font-mono">
            © 2025 SOC Dashboard
          </div>
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal — SIEM/Splunk-style flat panel */}
      <div className="relative w-[920px] h-[86vh] bg-card border border-border rounded-md shadow-2xl overflow-hidden flex flex-col">
        {/* Top command bar — matches Event Inspector / Confirm Dialog header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/60" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-foreground">
              SYSTEM
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/60">/</span>
            <span className="text-[11px] font-mono text-muted-foreground truncate">
              settings.{activeSection}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-mono text-muted-foreground/60 hidden sm:inline">
              esc to close
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-6 w-6 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar — log-like nav with mono labels */}
          <div className="w-52 border-r border-border flex-shrink-0 bg-background/30 flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-mono">
                navigation
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1.5">
              {sections.map((section) => {
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id as any)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono transition-colors border-l-2 ${
                      active
                        ? 'bg-muted/60 text-foreground border-foreground'
                        : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30 hover:border-border'
                    }`}
                  >
                    <section.icon className="w-3.5 h-3.5 opacity-70 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{section.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-w-0 bg-card">
            {/* Sub-header showing current section */}
            <div className="flex items-center justify-between px-5 py-2 border-b border-border bg-muted/15 shrink-0">
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-foreground shrink-0">
                  {sections.find(s => s.id === activeSection)?.label}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/60">·</span>
                <span className="text-[10px] font-mono text-muted-foreground truncate">
                  scope=local · persisted=localStorage
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {activeSection === 'general' && renderGeneralSection()}
              {activeSection === 'health' && renderHealthSection()}
              {activeSection === 'telegram' && renderTelegramSection()}
              {activeSection === 'data' && renderDataManagementSection()}
              {activeSection === 'sources' && renderSourcesSection()}
              {activeSection === 'nids_debug' && renderNidsDebugSection()}
              {activeSection === 'blocked' && renderBlockedIPsSection()}
              {(activeSection === 'blacklist' || activeSection === 'whitelist') && renderListSection()}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={closeConfirm}
        onConfirm={dialogState.onConfirm}
        actionType={dialogState.actionType}
        targetValue={dialogState.targetValue}
        details={dialogState.details}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default SettingsModal;
