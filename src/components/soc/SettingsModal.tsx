import { useState, useEffect, useCallback } from 'react';
import { Settings, Sun, Moon, X, Plus, Trash2, Edit2, HelpCircle, Clock, Shield, List, Users, Globe, Server, Wifi, WifiOff, Ban, RefreshCw, Database, RotateCcw, AlertTriangle, Send, Bell, MessageCircle, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
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
  const [activeSection, setActiveSection] = useState<'general' | 'telegram' | 'data' | 'sources' | 'blacklist' | 'whitelist' | 'blocked' | 'help'>('general');
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
    intervalId: NodeJS.Timeout | null;
  } | null>(null);
  const [addingMockData, setAddingMockData] = useState(false);

  // API URL for backend
  const apiUrl = localStorage.getItem('soc-api-url') || '';
  const [apiUrlInput, setApiUrlInput] = useState(apiUrl);

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

  // Telegram test function
  const handleTestTelegram = useCallback(async () => {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      setTelegramTestStatus('error');
      setTelegramTestMessage('Vui lòng nhập Bot Token và Chat ID');
      return;
    }

    setTelegramTestStatus('testing');
    try {
      const response = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: `🔔 *SOC Dashboard - Test Alert*\n\n✅ Kết nối Telegram thành công!\n📊 Confidence threshold: ${telegramConfig.confidenceThreshold}%\n⏰ ${new Date().toLocaleString('vi-VN')}`,
          parse_mode: 'Markdown',
        }),
      });

      if (response.ok) {
        setTelegramTestStatus('success');
        setTelegramTestMessage('Gửi tin nhắn test thành công!');
      } else {
        const data = await response.json();
        setTelegramTestStatus('error');
        setTelegramTestMessage(data.description || 'Lỗi kết nối Telegram');
      }
    } catch (error) {
      setTelegramTestStatus('error');
      setTelegramTestMessage('Không thể kết nối đến Telegram API');
    }

    // Reset status after 5s
    setTimeout(() => {
      setTelegramTestStatus('idle');
      setTelegramTestMessage('');
    }, 5000);
  }, [telegramConfig]);
  
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
    localStorage.setItem('soc-api-url', apiUrlInput);
    fetchConnectedSources();
  };
  
  const sections = [
    { id: 'general', label: t('settings.general'), icon: Settings },
    { id: 'telegram', label: 'Telegram Alerts', icon: Send },
    { id: 'data', label: 'Data Management', icon: Database },
    { id: 'sources', label: 'NIDS Sources', icon: Server },
    { id: 'blocked', label: 'Blocked IPs', icon: Ban },
    { id: 'blacklist', label: t('settings.blacklist'), icon: Shield },
    { id: 'whitelist', label: t('settings.whitelist'), icon: List },
    { id: 'help', label: t('settings.help'), icon: HelpCircle },
  ];

  // Telegram Section Renderer
  const renderTelegramSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
        Telegram Alert Configuration
      </div>
      <p className={`text-[11px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
        Cấu hình gửi cảnh báo qua Telegram Bot. Chỉ gửi các sự kiện có mức độ tin cậy cao để tránh spam.
      </p>

      {/* Enable Toggle */}
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${telegramConfig.enabled ? 'bg-[#3b82f6]/20 text-[#60a5fa]' : isDarkMode ? 'bg-[#27272a] text-[#52525b]' : 'bg-[#e5e7eb] text-[#9ca3af]'}`}>
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-[12px] font-semibold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
                Telegram Alerts
              </div>
              <div className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
                {telegramConfig.enabled ? 'Đang bật - Gửi cảnh báo tự động' : 'Đang tắt'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setTelegramConfig({ ...telegramConfig, enabled: !telegramConfig.enabled })}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              telegramConfig.enabled ? 'bg-[#3b82f6]' : isDarkMode ? 'bg-[#27272a]' : 'bg-[#d1d5db]'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
              telegramConfig.enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Bot Configuration */}
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[11px] font-semibold mb-4 flex items-center gap-2 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
          <MessageCircle className="w-4 h-4 text-[#3b82f6]" />
          Bot Configuration
        </div>

        <div className="space-y-4">
          {/* Bot Token */}
          <div>
            <label className={`block text-[11px] font-medium mb-1.5 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
              Bot Token
            </label>
            <input
              type="password"
              placeholder="123456789:ABCDefGHIjklMNOpqrSTUvwxYZ"
              value={telegramConfig.botToken}
              onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
              className={`w-full h-9 px-3 text-[11px] font-mono border rounded-lg ${
                isDarkMode 
                  ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7] placeholder-[#52525b]' 
                  : 'bg-white border-[#d1d5db] text-[#111827] placeholder-[#9ca3af]'
              }`}
            />
            <p className={`mt-1 text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
              Tạo bot tại @BotFather trên Telegram, sau đó copy token
            </p>
          </div>

          {/* Chat ID */}
          <div>
            <label className={`block text-[11px] font-medium mb-1.5 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
              Chat ID
            </label>
            <input
              type="text"
              placeholder="-1001234567890 hoặc 123456789"
              value={telegramConfig.chatId}
              onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
              className={`w-full h-9 px-3 text-[11px] font-mono border rounded-lg ${
                isDarkMode 
                  ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7] placeholder-[#52525b]' 
                  : 'bg-white border-[#d1d5db] text-[#111827] placeholder-[#9ca3af]'
              }`}
            />
            <p className={`mt-1 text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
              Chat ID của nhóm hoặc cá nhân. Dùng @userinfobot để lấy ID
            </p>
          </div>

          {/* Test Button */}
          <button
            onClick={handleTestTelegram}
            disabled={telegramTestStatus === 'testing' || !telegramConfig.botToken || !telegramConfig.chatId}
            className={`w-full flex items-center justify-center gap-2 h-10 rounded-lg font-medium text-[11px] transition-colors ${
              telegramTestStatus === 'success' 
                ? 'bg-[#22c55e] text-white' 
                : telegramTestStatus === 'error'
                  ? 'bg-[#dc2626] text-white'
                  : isDarkMode 
                    ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:bg-[#27272a] disabled:text-[#52525b]' 
                    : 'bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:bg-[#e5e7eb] disabled:text-[#9ca3af]'
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
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[11px] font-semibold mb-4 flex items-center gap-2 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
          <Bell className="w-4 h-4 text-[#f59e0b]" />
          Alert Settings
        </div>

        {/* Confidence Threshold */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className={`text-[11px] font-medium ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
              Confidence Threshold
            </label>
            <span className={`text-[12px] font-bold ${
              telegramConfig.confidenceThreshold >= 90 ? 'text-[#dc2626]' : 
              telegramConfig.confidenceThreshold >= 80 ? 'text-[#f59e0b]' : 'text-[#22c55e]'
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
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[#27272a]"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(telegramConfig.confidenceThreshold - 50) / 49 * 100}%, ${isDarkMode ? '#27272a' : '#e5e7eb'} ${(telegramConfig.confidenceThreshold - 50) / 49 * 100}%, ${isDarkMode ? '#27272a' : '#e5e7eb'} 100%)`
            }}
          />
          <p className={`mt-2 text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
            Chỉ gửi cảnh báo khi AI confidence ≥ {telegramConfig.confidenceThreshold}%. Khuyến nghị: 80-90% để tránh spam.
          </p>
        </div>

        {/* Alert Types */}
        <div className="mb-4">
          <label className={`block text-[11px] font-medium mb-2 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
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
                className={`p-2 rounded-lg border text-[11px] font-medium transition-all ${
                  telegramConfig.alertTypes.includes(type)
                    ? type === 'ALERT' 
                      ? 'bg-[#dc2626]/20 border-[#dc2626] text-[#f87171]'
                      : 'bg-[#f59e0b]/20 border-[#f59e0b] text-[#fbbf24]'
                    : isDarkMode 
                      ? 'bg-[#18181b] border-[#27272a] text-[#71717a]' 
                      : 'bg-[#f9fafb] border-[#e5e7eb] text-[#9ca3af]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Action Notifications */}
        <div>
          <label className={`block text-[11px] font-medium mb-2 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
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
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isDarkMode ? 'bg-[#18181b] border-[#27272a]' : 'bg-white border-[#e5e7eb]'
                }`}
              >
                <div>
                  <div className={`text-[11px] font-medium ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>{label}</div>
                  <div className={`text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{desc}</div>
                </div>
                <button
                  onClick={() => setTelegramConfig({ ...telegramConfig, [key]: !telegramConfig[key as keyof typeof telegramConfig] })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    telegramConfig[key as keyof typeof telegramConfig] ? 'bg-[#22c55e]' : isDarkMode ? 'bg-[#27272a]' : 'bg-[#d1d5db]'
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
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#1e3a5f]/30 border-[#3b82f6]/30' : 'bg-[#eff6ff] border-[#3b82f6]/30'}`}>
        <div className={`text-[11px] font-semibold mb-3 ${isDarkMode ? 'text-[#60a5fa]' : 'text-[#2563eb]'}`}>
          Telegram Bot Commands
        </div>
        <div className={`space-y-2 text-[10px] font-mono ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-[#27272a] rounded text-[#60a5fa]">/status</code>
            <span>- Xem trạng thái hệ thống (CPU, RAM, Disk, Network)</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-[#27272a] rounded text-[#60a5fa]">/logs [5m|30m|1h|12h|1d]</code>
            <span>- Xem log theo thời gian</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-[#27272a] rounded text-[#60a5fa]">/blocked</code>
            <span>- Danh sách IP đang bị block</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-1.5 py-0.5 bg-[#27272a] rounded text-[#60a5fa]">/stats</code>
            <span>- Thống kê sự kiện hôm nay</span>
          </div>
        </div>
        <p className={`mt-3 text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
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

  const renderDataManagementSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
        Data Management
      </div>
      <p className={`text-[11px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
        Quản lý dữ liệu sự kiện trong dashboard. Xóa dữ liệu cũ hoặc thêm dữ liệu demo.
      </p>

      {/* Recovery Banner */}
      {pendingDelete && (
        <div className={`p-4 rounded-lg border-2 animate-pulse ${isDarkMode ? 'bg-[#422006] border-[#f59e0b]' : 'bg-[#fef3c7] border-[#f59e0b]'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-[#f59e0b]" />
              <div>
                <div className={`text-[12px] font-semibold ${isDarkMode ? 'text-[#fbbf24]' : 'text-[#92400e]'}`}>
                  Dữ liệu đã xóa - Có thể khôi phục
                </div>
                <div className={`text-[10px] ${isDarkMode ? 'text-[#fcd34d]' : 'text-[#a16207]'}`}>
                  {pendingDelete.deletedData?.length || 0} sự kiện đã bị xóa. Còn {pendingDelete.countdown}s để khôi phục.
                </div>
              </div>
            </div>
            <button
              onClick={handleRecoverData}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#22c55e] text-white text-[11px] font-semibold hover:bg-[#16a34a] transition-colors"
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
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[11px] font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
          <Trash2 className="w-4 h-4 text-[#dc2626]" />
          Xóa Dữ Liệu Sự Kiện
        </div>
        <p className={`text-[10px] mb-4 ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
          Xóa các sự kiện trong khoảng thời gian. Dữ liệu có thể khôi phục trong vòng 2 phút sau khi xóa.
        </p>
        
        <div className="grid grid-cols-3 gap-2">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => handleDeleteData(range.value)}
              disabled={!!pendingDelete}
              className={`p-3 rounded-lg border text-center transition-all ${
                isDarkMode
                  ? 'bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:border-[#dc2626] hover:text-[#f87171] disabled:opacity-50'
                  : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#dc2626] hover:text-[#dc2626] disabled:opacity-50'
              }`}
            >
              <div className={`text-[12px] font-medium ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
                {range.label}
              </div>
              <div className={`text-[9px] mt-0.5 ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
                {range.value === 'all' ? 'Xóa toàn bộ' : `Trong ${range.label} qua`}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Add Mock Data Section */}
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[11px] font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
          <Plus className="w-4 h-4 text-[#3b82f6]" />
          Thêm Dữ Liệu Demo
        </div>
        <p className={`text-[10px] mb-4 ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
          Thêm 1000 sự kiện giả lập (70% Suricata, 30% Zeek) phân bổ trong 24h để demo dashboard. Lưu ý: Zeek không có ALERT, chỉ Suricata mới có.
        </p>
        
        <button
          onClick={handleAddMockData}
          disabled={addingMockData}
          className={`w-full p-3 rounded-lg border flex items-center justify-center gap-2 transition-all ${
            isDarkMode
              ? 'bg-[#1e3a5f] border-[#3b82f6] text-[#60a5fa] hover:bg-[#1e40af] disabled:opacity-50'
              : 'bg-[#eff6ff] border-[#3b82f6] text-[#2563eb] hover:bg-[#dbeafe] disabled:opacity-50'
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
      <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-[#450a0a] border-[#dc2626]/30' : 'bg-[#fef2f2] border-[#fecaca]'}`}>
        <div className={`text-[10px] ${isDarkMode ? 'text-[#fca5a5]' : 'text-[#b91c1c]'}`}>
          <strong>Lưu ý:</strong> Sau 2 phút, dữ liệu sẽ bị xóa vĩnh viễn và không thể khôi phục. 
          Hãy đảm bảo bạn đã sao lưu dữ liệu quan trọng trước khi xóa.
        </div>
      </div>
    </div>
  );

  const renderSourcesSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
        Connected NIDS Sources
      </div>
      <p className={`text-[11px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
        View IP addresses of machines sending logs (Suricata/Zeek) to this dashboard.
      </p>

      {/* API URL Configuration */}
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[11px] font-semibold mb-2 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
          Backend API URL
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="http://192.168.1.100:3001"
            value={apiUrlInput}
            onChange={(e) => setApiUrlInput(e.target.value)}
            className={`flex-1 h-9 px-3 text-[11px] border rounded-lg ${
              isDarkMode 
                ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7] placeholder-[#52525b]' 
                : 'bg-white border-[#d1d5db] text-[#111827] placeholder-[#9ca3af]'
            }`}
          />
          <button
            onClick={handleSaveApiUrl}
            className="px-4 h-9 text-[11px] font-medium bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb]"
          >
            Save & Test
          </button>
        </div>
        <p className={`mt-2 text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
          Enter the URL of your self-hosted SOC backend server
        </p>
      </div>

      {/* Connected Sources List */}
      <div className={`border rounded-lg overflow-hidden ${isDarkMode ? 'border-[#27272a]' : 'border-[#e5e7eb]'}`}>
        <div className={`p-3 border-b ${isDarkMode ? 'bg-[#18181b] border-[#27272a]' : 'bg-[#f3f4f6] border-[#e5e7eb]'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
              NIDS Machines Sending Logs
            </span>
            <button
              onClick={fetchConnectedSources}
              className={`text-[10px] px-2 py-1 rounded ${isDarkMode ? 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]' : 'bg-[#e5e7eb] text-[#6b7280] hover:bg-[#d1d5db]'}`}
            >
              Refresh
            </button>
          </div>
        </div>

        {loadingSources ? (
          <div className={`p-8 text-center ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
            <div className="animate-spin w-6 h-6 border-2 border-[#3b82f6] border-t-transparent rounded-full mx-auto mb-2"></div>
            Loading...
          </div>
        ) : !apiUrl ? (
          <div className={`p-8 text-center ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
            <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-[11px]">Configure Backend API URL first</div>
          </div>
        ) : connectedSources.length === 0 ? (
          <div className={`p-8 text-center ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-[11px]">No NIDS sources connected yet</div>
            <div className="text-[10px] mt-1">Start sending logs from Suricata/Zeek</div>
          </div>
        ) : (
          <div className="divide-y divide-[#27272a]">
            {connectedSources.map((source) => (
              <div key={source.id} className={`p-4 ${isDarkMode ? 'hover:bg-[#18181b]' : 'hover:bg-[#f9fafb]'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      source.source_type.includes('Suricata') 
                        ? 'bg-[#dc2626]/20 text-[#f87171]' 
                        : 'bg-[#3b82f6]/20 text-[#60a5fa]'
                    }`}>
                      <Wifi className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`text-[13px] font-mono font-semibold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
                        {source.ip_address}
                      </div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
                        {source.hostname}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-1">
                      {source.source_type.split(', ').map((type, i) => (
                        <span key={i} className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                          type === 'Suricata' 
                            ? 'bg-[#dc2626]/20 text-[#f87171]' 
                            : 'bg-[#3b82f6]/20 text-[#60a5fa]'
                        }`}>
                          {type}
                        </span>
                      ))}
                    </div>
                    <div className={`text-[10px] mt-1 ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
                      {source.total_events.toLocaleString()} events
                    </div>
                  </div>
                </div>
                <div className={`mt-2 text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
                  Last seen: {new Date(source.last_seen).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Endpoint Info */}
      {apiUrl && (
        <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
          <div className={`text-[11px] font-semibold mb-3 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
            Log Ingestion Endpoints
          </div>
          <div className={`space-y-2 text-[11px] font-mono ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[#dc2626]/20 text-[#f87171] rounded text-[9px]">Suricata</span>
              <code className={`flex-1 p-2 rounded ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#f3f4f6]'}`}>
                POST {apiUrl}/api/ingest/suricata
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[#3b82f6]/20 text-[#60a5fa] rounded text-[9px]">Zeek</span>
              <code className={`flex-1 p-2 rounded ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#f3f4f6]'}`}>
                POST {apiUrl}/api/ingest/zeek
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderBlockedIPsSection = () => {
    const fetchPfSenseBlockedIPs = async () => {
      if (!apiUrl) return;
      setBlockedIPsLoading(true);
      try {
        const aiEngineUrl = apiUrl.replace(':3001', ':5000');
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
          const aiEngineUrl = apiUrl.replace(':3001', ':5000');
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
        <div className={`text-sm font-semibold ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
          Blocked IP Addresses
        </div>
        
        {/* Explanation box */}
        <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#fef3c7] border-[#fcd34d]'}`}>
          <div className={`text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-[#fbbf24]' : 'text-[#92400e]'}`}>
            Blocked IPs vs Blacklist - Sự khác biệt:
          </div>
          <div className={`text-[10px] space-y-1 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#78350f]'}`}>
            <p><strong className={isDarkMode ? 'text-[#f87171]' : 'text-[#dc2626]'}>Blocked IPs:</strong> IP đã bị chặn THỰC SỰ trên Firewall (pfSense). Các IP này không thể truy cập hệ thống.</p>
            <p><strong className={isDarkMode ? 'text-[#fbbf24]' : 'text-[#d97706]'}>Blacklist:</strong> Danh sách IP/Domain đánh dấu là độc hại để THAM KHẢO. Chưa bị block, dùng để cảnh báo khi xuất hiện.</p>
          </div>
        </div>

        <p className={`text-[11px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
          Các IP bên dưới đã bị chặn trên Firewall thông qua AI-SOC hoặc pfSense. Chúng không thể kết nối đến hệ thống của bạn.
        </p>

        {/* Local Blocked IPs */}
        <div className={`border rounded-lg overflow-hidden ${isDarkMode ? 'border-[#27272a]' : 'border-[#e5e7eb]'}`}>
          <div className={`p-3 border-b flex items-center justify-between ${isDarkMode ? 'bg-[#18181b] border-[#27272a]' : 'bg-[#f3f4f6] border-[#e5e7eb]'}`}>
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-[#dc2626]" />
              <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
                Blocked IPs ({blockedIPsList.length})
              </span>
            </div>
            {apiUrl && (
              <button
                onClick={fetchPfSenseBlockedIPs}
                disabled={blockedIPsLoading}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${isDarkMode ? 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]' : 'bg-[#e5e7eb] text-[#6b7280] hover:bg-[#d1d5db]'}`}
              >
                <RefreshCw className={`w-3 h-3 ${blockedIPsLoading ? 'animate-spin' : ''}`} />
                Sync with pfSense
              </button>
            )}
          </div>

          {blockedIPsList.length === 0 ? (
            <div className={`p-8 text-center ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
              <Ban className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <div className="text-[11px]">Chưa có IP nào bị block</div>
              <div className="text-[10px] mt-1">Các IP bị block sẽ hiển thị ở đây</div>
            </div>
          ) : (
            <div className="divide-y divide-[#27272a]">
              {blockedIPsList.map((ip) => (
                <div key={ip} className={`p-4 flex items-center justify-between ${isDarkMode ? 'hover:bg-[#18181b]' : 'hover:bg-[#f9fafb]'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#dc2626]/20 flex items-center justify-center">
                      <Ban className="w-5 h-5 text-[#f87171]" />
                    </div>
                    <div>
                      <div className={`text-[13px] font-mono font-semibold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
                        {ip}
                      </div>
                      <div className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
                        Blocked by AI-SOC
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-[#dc2626]/20 text-[#f87171]">
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
                      className="p-1.5 text-[#71717a] hover:text-[#f87171] hover:bg-[#450a0a] rounded transition-colors"
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
          <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
            <div className={`text-[11px] font-semibold mb-2 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
              pfSense Integration
            </div>
            <p className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
              Khi block IP thông qua dashboard, IP sẽ được gửi đến AI-Engine để thêm vào alias <code className="bg-[#27272a] px-1 rounded">AI_Blocked_IP</code> trên pfSense firewall.
            </p>
            <div className={`mt-3 text-[10px] font-mono ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
              API Endpoint: POST {apiUrl.replace(':3001', ':5000')}/block
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const renderListSection = () => (
    <div className="space-y-4">
      <div className={`text-sm font-semibold ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
        {activeSection === 'blacklist' ? t('list.blacklistTitle') : t('list.whitelistTitle')}
      </div>
      
      {/* Blacklist specific explanation */}
      {activeSection === 'blacklist' && (
        <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-[#18181b] border-[#27272a]' : 'bg-[#fef9c3] border-[#facc15]'}`}>
          <div className={`text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-[#fbbf24]' : 'text-[#a16207]'}`}>
            Blacklist vs Blocked IPs:
          </div>
          <div className={`text-[10px] ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#713f12]'}`}>
            Blacklist là danh sách <strong>THAM KHẢO</strong> các IP/Domain độc hại đã biết. Khi traffic từ các địa chỉ này xuất hiện, hệ thống sẽ cảnh báo ưu tiên cao hơn. Để CHẶN hoàn toàn IP trên firewall, hãy sử dụng tính năng "Block IP" trong Event Inspector.
          </div>
        </div>
      )}
      
      {/* Whitelist specific explanation */}
      {activeSection === 'whitelist' && (
        <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-[#052e16] border-[#166534]' : 'bg-[#dcfce7] border-[#22c55e]'}`}>
          <div className={`text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-[#4ade80]' : 'text-[#166534]'}`}>
            Lưu ý về Whitelist:
          </div>
          <div className={`text-[10px] ${isDarkMode ? 'text-[#86efac]' : 'text-[#14532d]'}`}>
            Whitelist là danh sách IP/Domain được tin cậy. Traffic từ các địa chỉ này sẽ có mức cảnh báo thấp hơn. Các IP nội bộ, Gateway, DNS server nên được thêm vào đây.
          </div>
        </div>
      )}
      
      <p className={`text-[11px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
        {activeSection === 'blacklist' ? t('list.blacklistDesc') : t('list.whitelistDesc')}
      </p>
      
      {/* Add new item form */}
      <div className={`p-3 border rounded-lg ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className="grid grid-cols-12 gap-2">
          <input
            type="text"
            placeholder={t('list.ipOrDomain')}
            value={newItem.value}
            onChange={(e) => setNewItem({ ...newItem, value: e.target.value })}
            className={`col-span-4 h-8 px-3 text-[11px] border rounded ${
              isDarkMode 
                ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7] placeholder-[#52525b]' 
                : 'bg-white border-[#d1d5db] text-[#111827] placeholder-[#9ca3af]'
            }`}
          />
          <select
            value={newItem.type}
            onChange={(e) => setNewItem({ ...newItem, type: e.target.value as 'ip' | 'domain' })}
            className={`col-span-2 h-8 px-2 text-[11px] border rounded ${
              isDarkMode 
                ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7]' 
                : 'bg-white border-[#d1d5db] text-[#111827]'
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
            className={`col-span-4 h-8 px-3 text-[11px] border rounded ${
              isDarkMode 
                ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7] placeholder-[#52525b]' 
                : 'bg-white border-[#d1d5db] text-[#111827] placeholder-[#9ca3af]'
            }`}
          />
          <button
            onClick={handleAddItem}
            className={`col-span-2 h-8 text-[11px] font-medium rounded flex items-center justify-center gap-1 ${
              activeSection === 'blacklist'
                ? 'bg-[#dc2626] text-white hover:bg-[#b91c1c]'
                : 'bg-[#22c55e] text-white hover:bg-[#16a34a]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('list.add')}
          </button>
        </div>
      </div>
      
      {/* List items */}
      <div className={`border rounded-lg overflow-hidden ${isDarkMode ? 'border-[#27272a]' : 'border-[#e5e7eb]'}`}>
        <table className="w-full text-[11px]">
          <thead>
            <tr className={isDarkMode ? 'bg-[#18181b]' : 'bg-[#f3f4f6]'}>
              <th className={`text-left py-2 px-3 font-medium ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{t('list.value')}</th>
              <th className={`text-left py-2 px-3 font-medium ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{t('list.type')}</th>
              <th className={`text-left py-2 px-3 font-medium ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{t('list.note')}</th>
              <th className={`text-right py-2 px-3 font-medium ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{t('list.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {currentList.length === 0 ? (
              <tr>
                <td colSpan={4} className={`text-center py-6 ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
                  {t('list.empty')}
                </td>
              </tr>
            ) : currentList.map((item) => (
              <tr key={item.id} className={`border-t ${isDarkMode ? 'border-[#27272a]' : 'border-[#e5e7eb]'}`}>
                <td className={`py-2 px-3 font-mono ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
                  {editingId === item.id ? (
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) => handleUpdateItem(item.id, { value: e.target.value })}
                      className={`h-6 px-2 text-[11px] border rounded w-full ${
                        isDarkMode 
                          ? 'bg-[#0a0a0a] border-[#3b82f6] text-[#e4e4e7]' 
                          : 'bg-white border-[#3b82f6] text-[#111827]'
                      }`}
                    />
                  ) : item.value}
                </td>
                <td className={`py-2 px-3 ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    item.type === 'ip' 
                      ? isDarkMode ? 'bg-[#1e3a5f] text-[#60a5fa]' : 'bg-[#dbeafe] text-[#2563eb]'
                      : isDarkMode ? 'bg-[#422006] text-[#fbbf24]' : 'bg-[#fef3c7] text-[#d97706]'
                  }`}>
                    {item.type.toUpperCase()}
                  </span>
                </td>
                <td className={`py-2 px-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{item.note || '-'}</td>
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                      className={`p-1 rounded hover:bg-opacity-20 ${isDarkMode ? 'text-[#71717a] hover:bg-[#3b82f6] hover:text-[#60a5fa]' : 'text-[#9ca3af] hover:bg-[#3b82f6] hover:text-[#2563eb]'}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className={`p-1 rounded hover:bg-opacity-20 ${isDarkMode ? 'text-[#71717a] hover:bg-[#dc2626] hover:text-[#f87171]' : 'text-[#9ca3af] hover:bg-[#dc2626] hover:text-[#dc2626]'}`}
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
      
      <div className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
        {t('list.total')}: {currentList.length} {t('list.items')}
      </div>
    </div>
  );
  
  const renderGeneralSection = () => (
    <div className="space-y-6">
      {/* Language Selection */}
      <div>
        <div className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
          <Globe className="w-4 h-4" />
          {t('settings.language')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'en', label: t('settings.english'), flag: '🇺🇸' },
            { value: 'vi', label: t('settings.vietnamese'), flag: '🇻🇳' },
          ].map(({ value, label, flag }) => (
            <button
              key={value}
              onClick={() => setLanguage(value as 'en' | 'vi')}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                language === value
                  ? isDarkMode 
                    ? 'bg-[#1e3a5f] border-[#3b82f6] text-[#60a5fa]'
                    : 'bg-[#eff6ff] border-[#3b82f6] text-[#2563eb]'
                  : isDarkMode
                    ? 'bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:border-[#3f3f46]'
                    : 'bg-[#f9fafb] border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
              }`}
            >
              <span className="text-xl">{flag}</span>
              <div className="text-left">
                <div className="text-[12px] font-medium">{label}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Theme Selection */}
      <div>
        <div className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>{t('settings.theme')}</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'light', icon: Sun, label: t('settings.light'), desc: t('settings.lightDesc') },
            { value: 'dark', icon: Moon, label: t('settings.dark'), desc: t('settings.darkDesc') },
          ].map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              onClick={() => setTheme(value as Theme)}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                theme === value
                  ? isDarkMode 
                    ? 'bg-[#1e3a5f] border-[#3b82f6] text-[#60a5fa]'
                    : 'bg-[#eff6ff] border-[#3b82f6] text-[#2563eb]'
                  : isDarkMode
                    ? 'bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:border-[#3f3f46]'
                    : 'bg-[#f9fafb] border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <div className="text-left">
                <div className="text-[12px] font-medium">{label}</div>
                <div className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Timezone Selection */}
      <div>
        <div className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
          <Clock className="w-4 h-4" />
          {t('settings.timezone')}
        </div>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className={`w-full h-10 px-3 text-[12px] border rounded-lg ${
            isDarkMode 
              ? 'bg-[#0a0a0a] border-[#27272a] text-[#e4e4e7]' 
              : 'bg-white border-[#d1d5db] text-[#111827]'
          }`}
        >
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
        <p className={`mt-2 text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
          {t('settings.timezoneHint')}
        </p>
      </div>
      
      {/* Dashboard Info */}
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[10px] uppercase tracking-wider mb-3 ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>
          {t('settings.sysInfo')}
        </div>
        <div className={`space-y-2 text-[11px] ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
          <div className="flex justify-between">
            <span>{t('settings.version')}:</span>
            <span className={`font-mono ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>2.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>{t('settings.engine')}:</span>
            <span className={`font-mono ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>Hybrid NIDS</span>
          </div>
          <div className="flex justify-between">
            <span>Mode:</span>
            <span className={`font-mono ${isDarkMode ? 'text-[#22c55e]' : 'text-[#16a34a]'}`}>False Positive Reduction</span>
          </div>
          <div className="flex justify-between">
            <span>{t('settings.timezone')}:</span>
            <span className={`font-mono ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>{timezone}</span>
          </div>
        </div>
      </div>
    </div>
  );
  
  const renderHelpSection = () => (
    <div className="space-y-6">
      <div className={`text-sm font-semibold ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
        {t('help.title')}
      </div>

      {/* System Architecture */}
      <div className={`p-4 rounded-lg border-2 ${isDarkMode ? 'bg-[#0f0f0f] border-[#3b82f6]/30' : 'bg-[#eff6ff] border-[#3b82f6]/30'}`}>
        <div className={`text-[11px] font-semibold mb-3 ${isDarkMode ? 'text-[#60a5fa]' : 'text-[#2563eb]'}`}>
          False Positive Reduction System
        </div>
        <div className={`space-y-2 text-[11px] ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#dc2626]/20 text-[#f87171] flex items-center justify-center text-[10px] font-bold">1</span>
            <span>Suricata alert received → Status: <span className="text-[#f59e0b]">PENDING</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#3b82f6]/20 text-[#60a5fa] flex items-center justify-center text-[10px] font-bold">2</span>
            <span>Correlate with Zeek flow (community_id / 5-tuple)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#22c55e]/20 text-[#4ade80] flex items-center justify-center text-[10px] font-bold">3</span>
            <span>AI analyzes combined data → Final verdict</span>
          </div>
        </div>
      </div>
      
      {/* Quick Guide */}
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[11px] font-semibold mb-3 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
          {t('help.tabOverview')}
        </div>
        <div className={`space-y-3 text-[11px] ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
          <div>
            <span className={`font-medium ${isDarkMode ? 'text-[#60a5fa]' : 'text-[#2563eb]'}`}>Overview:</span> {t('help.overviewDesc')}
          </div>
          <div>
            <span className={`font-medium ${isDarkMode ? 'text-[#60a5fa]' : 'text-[#2563eb]'}`}>Events:</span> {t('help.eventsDesc')}
          </div>
          <div>
            <span className={`font-medium ${isDarkMode ? 'text-[#60a5fa]' : 'text-[#2563eb]'}`}>Threats:</span> {t('help.threatsDesc')}
          </div>
          <div>
            <span className={`font-medium ${isDarkMode ? 'text-[#60a5fa]' : 'text-[#2563eb]'}`}>Reports:</span> {t('help.reportsDesc')}
          </div>
        </div>
      </div>
      
      {/* Verdicts Guide */}
      <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
        <div className={`text-[11px] font-semibold mb-3 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
          {t('help.verdictMeaning')}
        </div>
        <div className="space-y-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#f59e0b]"></span>
            <span className={isDarkMode ? 'text-[#fbbf24]' : 'text-[#d97706]'}>PENDING:</span>
            <span className={isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}>Waiting for Zeek correlation</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#dc2626]"></span>
            <span className={isDarkMode ? 'text-[#f87171]' : 'text-[#dc2626]'}>ALERT:</span>
            <span className={isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}>{t('help.alertDesc')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#f59e0b]"></span>
            <span className={isDarkMode ? 'text-[#fbbf24]' : 'text-[#d97706]'}>SUSPICIOUS:</span>
            <span className={isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}>{t('help.suspiciousDesc')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#22c55e]"></span>
            <span className={isDarkMode ? 'text-[#4ade80]' : 'text-[#16a34a]'}>FALSE_POSITIVE:</span>
            <span className={isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}>{t('help.falsePositiveDesc')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#71717a]"></span>
            <span className={isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}>BENIGN:</span>
            <span className={isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}>{t('help.benignDesc')}</span>
          </div>
        </div>
      </div>
      
      {/* Credits */}
      <div className={`p-4 rounded-lg border-2 ${isDarkMode ? 'bg-[#0f0f0f] border-[#3b82f6]/30' : 'bg-[#eff6ff] border-[#3b82f6]/30'}`}>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-[#3b82f6]" />
          <div className={`text-[11px] font-semibold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>
            {t('help.devTeam')}
          </div>
        </div>
        <div className={`text-[12px] font-medium ${isDarkMode ? 'text-[#60a5fa]' : 'text-[#2563eb]'}`}>
          C1NE.03 Team
        </div>
        <div className={`text-[11px] mt-1 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
          Cybersecurity K28
        </div>
        <div className={`text-[11px] ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>
          Duy Tan University
        </div>
        <div className={`mt-3 pt-3 border-t text-[10px] ${isDarkMode ? 'border-[#27272a] text-[#52525b]' : 'border-[#e5e7eb] text-[#9ca3af]'}`}>
          © 2025 SOC Dashboard - All Rights Reserved
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-[800px] max-h-[85vh] rounded-xl shadow-2xl overflow-hidden flex ${
        isDarkMode ? 'bg-[#0f0f0f] border border-[#27272a]' : 'bg-white border border-[#e5e7eb]'
      }`}>
        {/* Sidebar */}
        <div className={`w-52 border-r flex-shrink-0 ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
          <div className={`p-4 border-b ${isDarkMode ? 'border-[#1f1f1f]' : 'border-[#e5e7eb]'}`}>
            <div className={`text-sm font-bold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>{t('settings.title')}</div>
          </div>
          <div className="p-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as any)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeSection === section.id
                    ? isDarkMode 
                      ? 'bg-[#1e3a5f] text-[#60a5fa]'
                      : 'bg-[#eff6ff] text-[#2563eb]'
                    : isDarkMode
                      ? 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#e4e4e7]'
                      : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]'
                }`}
              >
                <section.icon className="w-4 h-4" />
                {section.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className={`flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'border-[#1f1f1f]' : 'border-[#e5e7eb]'}`}>
            <div className={`text-[11px] uppercase tracking-wider font-medium ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
              {sections.find(s => s.id === activeSection)?.label}
            </div>
            <button 
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isDarkMode 
                  ? 'text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#27272a]' 
                  : 'text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6]'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === 'general' && renderGeneralSection()}
            {activeSection === 'telegram' && renderTelegramSection()}
            {activeSection === 'data' && renderDataManagementSection()}
            {activeSection === 'sources' && renderSourcesSection()}
            {activeSection === 'blocked' && renderBlockedIPsSection()}
            {(activeSection === 'blacklist' || activeSection === 'whitelist') && renderListSection()}
            {activeSection === 'help' && renderHelpSection()}
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
