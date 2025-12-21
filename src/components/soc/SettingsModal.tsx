import { useState, useEffect } from 'react';
import { Settings, Sun, Moon, X, Plus, Trash2, Edit2, HelpCircle, Clock, Shield, List, Users, Globe, Server, Wifi, WifiOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const [activeSection, setActiveSection] = useState<'general' | 'sources' | 'blacklist' | 'whitelist' | 'help'>('general');
  const [timezone, setTimezone] = useState(() => localStorage.getItem('soc-timezone') || 'Asia/Ho_Chi_Minh');
  const [connectedSources, setConnectedSources] = useState<ConnectedSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  
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

  // API URL for backend
  const apiUrl = localStorage.getItem('soc-api-url') || '';
  const [apiUrlInput, setApiUrlInput] = useState(apiUrl);
  
  // Fetch connected sources when section is opened
  useEffect(() => {
    if (activeSection === 'sources' && apiUrl) {
      fetchConnectedSources();
    }
  }, [activeSection, apiUrl]);
  
  const fetchConnectedSources = async () => {
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
  };
  
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
  
  if (!isOpen) return null;
  
  const currentList = activeSection === 'blacklist' ? blacklist : whitelist;
  const setCurrentList = activeSection === 'blacklist' ? setBlacklist : setWhitelist;
  
  const handleAddItem = () => {
    if (!newItem.value.trim()) return;
    const item: ListItem = {
      id: Date.now().toString(),
      value: newItem.value.trim(),
      type: newItem.type,
      note: newItem.note.trim(),
    };
    setCurrentList([...currentList, item]);
    setNewItem({ value: '', type: 'ip', note: '' });
  };
  
  const handleDeleteItem = (id: string) => {
    setCurrentList(currentList.filter(item => item.id !== id));
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
    { id: 'sources', label: 'NIDS Sources', icon: Server },
    { id: 'blacklist', label: t('settings.blacklist'), icon: Shield },
    { id: 'whitelist', label: t('settings.whitelist'), icon: List },
    { id: 'help', label: t('settings.help'), icon: HelpCircle },
  ];

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
  
  const renderListSection = () => (
    <div className="space-y-4">
      <div className={`text-sm font-semibold ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>
        {activeSection === 'blacklist' ? t('list.blacklistTitle') : t('list.whitelistTitle')}
      </div>
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
            {activeSection === 'sources' && renderSourcesSection()}
            {(activeSection === 'blacklist' || activeSection === 'whitelist') && renderListSection()}
            {activeSection === 'help' && renderHelpSection()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
