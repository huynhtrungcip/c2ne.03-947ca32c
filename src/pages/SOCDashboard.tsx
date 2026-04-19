import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSOCData } from '@/hooks/useSOCData';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SOCEvent } from '@/types/soc';
import { Area, AreaChart, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart, PieChart, Pie, Cell, BarChart, Bar, Tooltip, CartesianGrid } from 'recharts';
import { Settings, Wifi, WifiOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SettingsModal from '@/components/soc/SettingsModal';
import VirtualizedEventTable from '@/components/soc/VirtualizedEventTable';
import { SystemResourcesPanel } from '@/components/soc/SystemResourcesPanel';
import { EventsRatePanel } from '@/components/soc/EventsRatePanel';
import { VerdictDistributionPanel } from '@/components/soc/VerdictDistributionPanel';
import { MetricStatCard, MetricKind } from '@/components/soc/MetricStatCard';
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type Theme = 'light' | 'dark';
type TabType = 'overview' | 'events' | 'threats' | 'reports';

// MegaLLM Configuration
const MEGALLM_API_KEY = 'sk-mega-7bd02bf1c5720f9bde518db892d4da8ef94671adcca28dd19299b1c2d8d4e753';
const MEGALLM_BASE_URL = 'https://ai.megallm.io/v1';
const MEGALLM_MODELS = [
  'openai-gpt-oss-120b',
  'openai-gpt-oss-20b',
  'deepseek-r1-distill-llama-70b',
  'llama3.3-70b-instruct',
];
const DEFAULT_MODEL = 'openai-gpt-oss-120b';

// AI Chatbot Panel Component - Gọi trực tiếp MegaLLM API
const AIChatPanel = ({ 
  isOpen, 
  onClose, 
  events = [],
  selectedEvent = null 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  events?: SOCEvent[];
  selectedEvent?: SOCEvent | null;
}) => {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { 
      role: 'assistant', 
      content: `Xin chào, tôi là **SOC AI Assistant** của hệ thống AI-SOC Dashboard, được phát triển bởi nhóm **C1NE.03 – K28 An ninh mạng, Đại học Duy Tân**.

- Tôi chỉ tập trung vào **phân tích sự kiện an ninh**, logs, alerts và traffic trong SOC.
- Anh/chị có thể hỏi bằng **tiếng Việt (có/không dấu) hoặc tiếng Anh**.
- Phong cách trả lời theo chuẩn **SOC Tier-2**, ngắn gọn, rõ ràng, tập trung vào hành động.

Ví dụ câu hỏi:
- IP nao tan cong he thong nhieu nhat trong 1h qua?
- Are these ICMP alerts likely to be a scan or health check?
- De xuat hanh dong xu ly cho cac PortScan trong 1h gan day` 
    }
  ]);

  // Build context from events for AI analysis
  const buildEventsContext = () => {
    if (events.length === 0) return '';
    
    // Get last 100 events for context (to avoid token limit)
    const recentEvents = events.slice(0, 100).map(e => ({
      time: e.timestamp.toISOString(),
      verdict: e.verdict,
      src_ip: e.src_ip,
      dst_ip: e.dst_ip,
      dst_port: e.dst_port,
      protocol: e.protocol,
      signature: e.attack_type,
      confidence: e.confidence.toFixed(2),
      engine: e.source_engine
    }));
    
    // Group by IP for summary
    const ipSummary: Record<string, { count: number; alerts: number; suspicious: number }> = {};
    events.forEach(e => {
      if (!ipSummary[e.src_ip]) {
        ipSummary[e.src_ip] = { count: 0, alerts: 0, suspicious: 0 };
      }
      ipSummary[e.src_ip].count++;
      if (e.verdict === 'ALERT') ipSummary[e.src_ip].alerts++;
      if (e.verdict === 'SUSPICIOUS') ipSummary[e.src_ip].suspicious++;
    });
    
    const topAttackers = Object.entries(ipSummary)
      .sort((a, b) => (b[1].alerts + b[1].suspicious) - (a[1].alerts + a[1].suspicious))
      .slice(0, 10);

    return `
--- SOC EVENTS SNAPSHOT ---
Total events: ${events.length}
Time range: ${events[events.length - 1]?.timestamp.toISOString()} to ${events[0]?.timestamp.toISOString()}

TOP 10 SOURCE IPs BY THREAT LEVEL:
${topAttackers.map(([ip, data]) => `- ${ip}: ${data.count} events (${data.alerts} ALERT, ${data.suspicious} SUSPICIOUS)`).join('\n')}

RECENT EVENTS (last 100):
${JSON.stringify(recentEvents, null, 2)}
--- END SNAPSHOT ---`;
  };

  const SOC_SYSTEM_PROMPT = `You are an AI SOC analyst (Tier 2) working on a hybrid NIDS stack with Zeek, Suricata and AI correlation.
You receive:
1) A natural language question from the analyst.
2) A compact JSON snapshot of recent SOC alerts (provided below).

You must:
- Correlate patterns.
- Identify likely attack scenarios.
- Propose CLEAR next actions (block / investigate / ignore).
- NEVER hallucinate log entries that are not present in JSON.
- Answer in concise Vietnamese, nhưng giữ technical terms tiếng Anh khi cần.

${buildEventsContext()}`;

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = message.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${MEGALLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MEGALLM_API_KEY}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: SOC_SYSTEM_PROMPT },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
          ],
          max_tokens: 2048,
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.choices && data.choices[0]?.message?.content) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.choices[0].message.content }]);
      } else {
        throw new Error('Invalid response format from MegaLLM');
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `[ERROR] ${error instanceof Error ? error.message : 'Unknown error'}

Kiểm tra:
1. Kết nối internet
2. MegaLLM API key còn hiệu lực
3. Thử lại sau vài giây` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed right-4 bottom-4 w-[420px] bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg shadow-2xl z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#e4e4e7] uppercase tracking-wider">SOC AI Assistant</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="h-6 px-2 text-[9px] bg-[#0a0a0a] border border-[#27272a] rounded text-[#a1a1aa] focus:outline-none focus:border-[#3b82f6]"
          >
            {MEGALLM_MODELS.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
        <button onClick={onClose} className="text-[#71717a] hover:text-[#e4e4e7] text-sm">×</button>
      </div>
      <div className="h-80 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-[11px] ${
              msg.role === 'user' 
                ? 'bg-[#1e3a5f] text-[#93c5fd] whitespace-pre-wrap' 
                : 'bg-[#18181b] text-[#a1a1aa]'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-invert prose-xs max-w-none [&_table]:w-full [&_table]:text-[10px] [&_table]:border-collapse [&_th]:border [&_th]:border-[#3f3f46] [&_th]:bg-[#27272a] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#e4e4e7] [&_td]:border [&_td]:border-[#3f3f46] [&_td]:px-2 [&_td]:py-1 [&_td]:text-[#a1a1aa] [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:text-[#e4e4e7] [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-[#e4e4e7] [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-[#e4e4e7] [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:text-[#e4e4e7] [&_h3]:mt-2 [&_h3]:mb-1 [&_code]:bg-[#27272a] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#60a5fa] [&_pre]:bg-[#0a0a0a] [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-[#3b82f6] [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:text-[#71717a]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#18181b] text-[#a1a1aa] px-3 py-2 rounded-lg text-[11px]">
              <span className="animate-pulse">Đang phân tích với {selectedModel}...</span>
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-[#1f1f1f]">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Hỏi về logs, alerts, correlation..."
            disabled={isLoading}
            className="flex-1 h-8 px-3 text-[11px] bg-[#0a0a0a] border border-[#27272a] rounded text-[#e4e4e7] placeholder-[#3f3f46] focus:outline-none focus:border-[#3b82f6] disabled:opacity-50"
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !message.trim()}
            className="px-3 h-8 text-[10px] bg-[#1e3a5f] text-[#60a5fa] border border-[#1e40af] rounded hover:bg-[#1e40af]/50 transition-colors font-medium disabled:opacity-50"
          >
            {isLoading ? '...' : 'Gửi'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SOCDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  // Realtime streaming is always-on (SIEM-style). No pause toggle.
  const isLive = true;
  const [autoBlock, setAutoBlock] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all');
  const [selectedEvent, setSelectedEvent] = useState<SOCEvent | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalysisOptions, setShowAnalysisOptions] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [blockingIP, setBlockingIP] = useState(false);
  const [pieHoverIdx, setPieHoverIdx] = useState<number | null>(null);
  const [blockResult, setBlockResult] = useState<{ success: boolean; message: string } | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('soc-theme') as Theme;
    return stored || 'dark';
  });
  
  const [verdictFocus, setVerdictFocus] = useState('All');
  const [ipFilter, setIpFilter] = useState('');
  const [sigFilter, setSigFilter] = useState('');
  const [minConfidence, setMinConfidence] = useState(0);

  // WebSocket configuration
  const apiUrl = localStorage.getItem('soc-api-url') || '';
  const wsUrl = apiUrl ? apiUrl.replace('http://', 'ws://').replace(':3001', ':8000') + '/ws' : '';
  const [useWsRealtime, setUseWsRealtime] = useState(true);

  const { events, metrics, topSources, attackTypeData, trafficData, timeRanges, wsConnected, setWsConnected, addEvent } = useSOCData(
    timeRange,
    viewMode,
    isLive,
    { verdictFocus, ipFilter, sigFilter, minConfidence },
    { useWebSocket: useWsRealtime && isLive && !!wsUrl }
  );

  // WebSocket connection for real-time events
  const handleWebSocketEvent = useCallback((event: SOCEvent) => {
    if (isLive) {
      addEvent(event);
    }
  }, [isLive, addEvent]);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setWsConnected(connected);
  }, [setWsConnected]);

  const { isConnected: wsIsConnected, eventCount: wsEventCount } = useWebSocket({
    url: wsUrl,
    enabled: useWsRealtime && isLive && !!wsUrl,
    onEvent: handleWebSocketEvent,
    onConnectionChange: handleConnectionChange,
    reconnectInterval: 5000,
  });

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem('soc-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const isDarkMode = theme === 'dark';

  // Reset selected event when switching tabs / time range / view mode
  useEffect(() => {
    setSelectedEvent(null);
  }, [activeTab, timeRange, viewMode]);

  // Click row to pin & inspect; click again to unpin. Stream keeps flowing.
  const handleEventClick = (event: SOCEvent) => {
    if (selectedEvent?.id !== event.id) {
      setAnalysisResult(null);
      setBlockResult(null);
    }
    setSelectedEvent(selectedEvent?.id === event.id ? null : event);
  };

  const now = new Date().toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  const timeRangeLabel = timeRanges.find(r => r.value === timeRange)?.label || timeRange;

  const chartData = trafficData.map(d => ({
    time: d.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    Traffic: d.total,
    Alerts: d.alerts
  }));

  const COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#ea580c', '#16a34a', '#ca8a04'];
  const OTHER_COLOR = '#71717a';
  const TOP_N = 5;
  const totalAttackTypes = attackTypeData.length;
  const pieData = (() => {
    const sorted = [...attackTypeData].sort((a, b) => b.count - a.count);
    if (sorted.length <= TOP_N + 1) {
      return sorted.map(d => ({ name: d.type, value: d.count, isOther: false }));
    }
    const top = sorted.slice(0, TOP_N).map(d => ({ name: d.type, value: d.count, isOther: false }));
    const rest = sorted.slice(TOP_N);
    const otherSum = rest.reduce((s, d) => s + d.count, 0);
    return [
      ...top,
      { name: `Other (${rest.length})`, value: otherSum, isOther: true as const },
    ];
  })();

  const barData = topSources.map(d => ({ ip: d.ip, count: d.count }));
  const sortedEvents = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const displayEvents = sortedEvents.slice(0, 20000); // Hiển thị tối đa 20000 events với virtualization
  const alertEvents = sortedEvents.filter(e => e.verdict === 'ALERT');

  const getVerdictClass = (verdict: string) => {
    const v = verdict.toUpperCase();
    if (v === 'ALERT') return 'text-[#dc2626]';
    if (v === 'SUSPICIOUS') return 'text-[#d97706]';
    return 'text-[#16a34a]';
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'events', label: 'Events' },
    { id: 'threats', label: 'Threats' },
    { id: 'reports', label: 'Reports' },
  ];

  // Unified filter component - themed
  const renderFilters = () => (
    <div className={`border p-3 mb-4 ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`text-[10px] uppercase tracking-wider font-medium ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>Filters</div>
        <select 
          value={verdictFocus} 
          onChange={(e) => setVerdictFocus(e.target.value)}
          className={`h-7 px-2 text-[11px] border ${isDarkMode ? 'bg-[#0a0a0a] border-[#27272a] text-[#a1a1aa]' : 'bg-white border-[#d1d5db] text-[#374151]'}`}
        >
          <option value="All">All Verdicts</option>
          <option value="ALERT">ALERT</option>
          <option value="SUSPICIOUS">SUSPICIOUS</option>
          <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
          <option value="BENIGN">BENIGN</option>
        </select>
        <input 
          type="text"
          placeholder="Filter by IP..."
          value={ipFilter}
          onChange={(e) => setIpFilter(e.target.value)}
          className={`h-7 px-3 text-[11px] border w-36 ${isDarkMode ? 'bg-[#0a0a0a] border-[#27272a] text-[#a1a1aa] placeholder-[#3f3f46]' : 'bg-white border-[#d1d5db] text-[#374151] placeholder-[#9ca3af]'}`}
        />
        <input 
          type="text"
          placeholder="Filter by Signature..."
          value={sigFilter}
          onChange={(e) => setSigFilter(e.target.value)}
          className={`h-7 px-3 text-[11px] border w-44 ${isDarkMode ? 'bg-[#0a0a0a] border-[#27272a] text-[#a1a1aa] placeholder-[#3f3f46]' : 'bg-white border-[#d1d5db] text-[#374151] placeholder-[#9ca3af]'}`}
        />
        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>Min Confidence</span>
          <input 
            type="range" min="0" max="1" step="0.05"
            value={minConfidence}
            onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
            className="w-20 h-1.5 bg-[#3b82f6] rounded appearance-none cursor-pointer"
          />
          <span className={`text-[11px] font-mono w-8 ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>{(minConfidence * 100).toFixed(0)}%</span>
        </div>
        {(verdictFocus !== 'All' || ipFilter || sigFilter || minConfidence > 0) && (
          <button 
            onClick={() => { setVerdictFocus('All'); setIpFilter(''); setSigFilter(''); setMinConfidence(0); }}
            className={`text-[10px] underline ${isDarkMode ? 'text-[#71717a] hover:text-[#a1a1aa]' : 'text-[#6b7280] hover:text-[#374151]'}`}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );

  const renderEventTable = (eventList: SOCEvent[]) => (
    <VirtualizedEventTable
      events={eventList}
      isLive={isLive}
      isDarkMode={isDarkMode}
      selectedEvent={selectedEvent}
      onEventClick={handleEventClick}
    />
  );

  const renderInspector = () => {
    if (!selectedEvent) return null;
    
    const verdictBorderColor = selectedEvent.verdict === 'ALERT' ? '#dc2626' : 
                               selectedEvent.verdict === 'SUSPICIOUS' ? '#d97706' : '#16a34a';
    
    const apiUrl = localStorage.getItem('soc-api-url') || '';
    
    // Check if IP is already blocked
    const blockedIPs = JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]') as string[];
    const isAlreadyBlocked = blockedIPs.includes(selectedEvent.src_ip);
    
    const handleAnalyzeFlow = async (analyzeAll: boolean) => {
      setShowAnalysisOptions(false);
      setAnalysisLoading(true);
      setAnalysisResult(null);
      
      try {
        const eventData = analyzeAll 
          ? { ip: selectedEvent.src_ip, events: events.filter(e => e.src_ip === selectedEvent.src_ip).slice(0, 50) }
          : { event: selectedEvent };
        
        const prompt = analyzeAll 
          ? `Phân tích TẤT CẢ flows từ IP ${selectedEvent.src_ip}. Dữ liệu:\n${JSON.stringify(eventData, null, 2)}`
          : `Phân tích flow đơn lẻ này:\n${JSON.stringify(eventData, null, 2)}`;
        
        // Call MegaLLM API directly
        const response = await fetch(`${MEGALLM_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MEGALLM_API_KEY}`
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [
              { role: 'system', content: `You are an AI SOC analyst (Tier 2). Analyze the provided network flow data and provide a CONCISE report with:

## Risk Level
(Critical/High/Medium/Low) - One line explanation

## Attack Classification
- Attack Type: [type]
- Technique: [MITRE ATT&CK if applicable]

## Key Indicators
- List 2-3 bullet points of suspicious indicators

## Recommended Actions
| Priority | Action | Reason |
|----------|--------|--------|
| 1 | ... | ... |
| 2 | ... | ... |

Keep response SHORT and actionable. Answer in Vietnamese, keep technical terms in English.` },
              { role: 'user', content: prompt }
            ],
            max_tokens: 1500,
            temperature: 0.5
          }),
        });
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        const analysis = data.choices?.[0]?.message?.content || 'Không thể phân tích';
        
        // Store result to display inline
        setAnalysisResult(analysis);
      } catch (error) {
        console.error('Analysis error:', error);
        setAnalysisResult(`**Lỗi phân tích:** ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setAnalysisLoading(false);
      }
    };
    
    const handleBlockIP = async () => {
      if (!selectedEvent?.src_ip) return;
      setBlockingIP(true);
      setBlockResult(null);
      
      try {
        // Try to call AI-Engine API if available
        if (apiUrl) {
          const aiEngineUrl = apiUrl.replace(':3001', ':5000');
          const response = await fetch(`${aiEngineUrl}/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: selectedEvent.src_ip }),
          });
          
          if (response.ok) {
            const data = await response.json();
            setBlockResult({ success: data.success, message: data.message || 'IP đã được block thành công!' });
          } else {
            throw new Error('API không phản hồi');
          }
        } else {
          // Simulate blocking for demo
          await new Promise(resolve => setTimeout(resolve, 1000));
          setBlockResult({ success: true, message: `IP ${selectedEvent.src_ip} đã được thêm vào danh sách block!` });
        }
        
        // Save to local storage
        const currentBlocked = JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]');
        if (!currentBlocked.includes(selectedEvent.src_ip)) {
          currentBlocked.push(selectedEvent.src_ip);
          localStorage.setItem('soc-blocked-ips', JSON.stringify(currentBlocked));
        }
      } catch (error) {
        setBlockResult({ 
          success: false, 
          message: `Lỗi: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      } finally {
        setBlockingIP(false);
      }
    };
    
    return (
      <div className="mt-4 bg-[#0a0a0a] border-2 rounded-lg shadow-xl" style={{ borderColor: verdictBorderColor }}>
        <div className="p-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#0f0f0f] rounded-t-lg">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#e4e4e7] uppercase tracking-wider">Event Inspector</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
              selectedEvent.verdict === 'ALERT' ? 'bg-[#450a0a] text-[#f87171]' :
              selectedEvent.verdict === 'SUSPICIOUS' ? 'bg-[#451a03] text-[#fbbf24]' : 'bg-[#052e16] text-[#4ade80]'
            }`}>
              {selectedEvent.verdict}
            </span>
          </div>
          <button 
            onClick={() => setSelectedEvent(null)}
            className="w-6 h-6 flex items-center justify-center text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#27272a] rounded transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div className="p-5 grid grid-cols-4 gap-x-6 gap-y-4">
          {[
            { label: 'Timestamp', value: selectedEvent.timestamp.toLocaleString(), className: 'text-[#e4e4e7]' },
            { label: 'Signature', value: selectedEvent.attack_type, className: 'font-semibold text-[#fbbf24]' },
            { label: 'Engine', value: selectedEvent.source_engine, className: 'text-[#e4e4e7]' },
            { label: 'Confidence', value: `${(selectedEvent.confidence * 100).toFixed(0)}%`, className: 'text-[#e4e4e7]' },
            { label: 'Source IP', value: selectedEvent.src_ip, className: 'text-[#60a5fa] font-mono' },
            { label: 'Destination', value: `${selectedEvent.dst_ip}:${selectedEvent.dst_port || '-'}`, className: 'font-mono text-[#e4e4e7]' },
            { label: 'Protocol', value: selectedEvent.protocol, className: 'text-[#e4e4e7]' },
            { label: 'Community ID', value: selectedEvent.community_id, className: 'font-mono text-[10px] text-[#e4e4e7]' },
          ].map((field, i) => (
            <div key={i}>
              <div className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1">{field.label}</div>
              <div className={`text-[12px] ${field.className}`}>{field.value}</div>
            </div>
          ))}
        </div>
        
        <div className="px-5 pb-4">
          {(() => {
            const raw = selectedEvent.raw_log || '{}';
            let pretty = raw;
            try {
              pretty = JSON.stringify(JSON.parse(raw), null, 2);
            } catch {
              // keep raw if not valid JSON
            }
            const sizeBytes = new Blob([raw]).size;
            const sizeLabel = sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} B`;
            const lineCount = pretty.split('\n').length;

            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Raw Payload</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      JSON · {lineCount} lines · {sizeLabel}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pretty);
                      toast.success('Copied to clipboard');
                    }}
                    className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-border/80"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-[11px] font-mono leading-relaxed text-foreground/90 bg-background p-3 rounded-md border border-border overflow-auto max-h-72 [scrollbar-width:thin]">
                  {pretty}
                </pre>
              </>
            );
          })()}
        </div>
        
        {/* Block Result Feedback */}
        {blockResult && (
          <div className={`mx-5 mb-4 p-3 rounded-lg border text-[11px] ${
            blockResult.success 
              ? 'bg-[#052e16] border-[#166534] text-[#4ade80]' 
              : 'bg-[#450a0a] border-[#7f1d1d] text-[#f87171]'
          }`}>
            {blockResult.success ? '✓' : '✗'} {blockResult.message}
          </div>
        )}
        
        <div className="px-5 pb-5 flex gap-3">
          {/* Ask ASSISTANT with dropdown */}
          <div className="relative flex-1">
            <button 
              onClick={() => setShowAnalysisOptions(!showAnalysisOptions)}
              disabled={analysisLoading}
              className="w-full px-4 py-2.5 text-[11px] font-semibold bg-[#1e3a5f] text-[#60a5fa] border border-[#1e40af] rounded-lg hover:bg-[#1e40af]/50 transition-colors disabled:opacity-50"
            >
              {analysisLoading ? 'Đang phân tích...' : 'Ask ASSISTANT About This Flow'}
            </button>
            
            {/* Dropdown options */}
            {showAnalysisOptions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl z-10 overflow-hidden">
                <button
                  onClick={() => handleAnalyzeFlow(false)}
                  className="w-full px-4 py-3 text-left text-[11px] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#e4e4e7] transition-colors border-b border-[#27272a]"
                >
                  <div className="font-semibold text-[#60a5fa]">Analyze This Flow</div>
                  <div className="text-[10px] text-[#52525b] mt-0.5">Chỉ phân tích sự kiện đang chọn</div>
                </button>
                <button
                  onClick={() => handleAnalyzeFlow(true)}
                  className="w-full px-4 py-3 text-left text-[11px] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#e4e4e7] transition-colors"
                >
                  <div className="font-semibold text-[#fbbf24]">Analyze ALL from IP {selectedEvent.src_ip}</div>
                  <div className="text-[10px] text-[#52525b] mt-0.5">Phân tích toàn bộ flows từ IP nguồn này</div>
                </button>
              </div>
            )}
          </div>
          
          {/* Block IP Button */}
          <button 
            onClick={handleBlockIP}
            disabled={blockingIP || isAlreadyBlocked}
            className={`flex-1 px-4 py-2.5 text-[11px] font-semibold rounded-lg transition-colors ${
              isAlreadyBlocked
                ? 'bg-[#27272a] text-[#52525b] border border-[#3f3f46] cursor-not-allowed'
                : 'bg-[#450a0a] text-[#f87171] border border-[#7f1d1d] hover:bg-[#7f1d1d]/50'
            } disabled:opacity-50`}
          >
            {blockingIP ? 'Đang block...' : isAlreadyBlocked ? `IP đã bị block` : `Block IP ${selectedEvent.src_ip}`}
          </button>
        </div>

        {/* AI Analysis Result - Inline Display */}
        {(analysisLoading || analysisResult) && (
          <div className="mx-5 mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-[#71717a] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse"></span>
                AI Analysis Result
              </div>
              {analysisResult && (
                <button 
                  onClick={() => setAnalysisResult(null)}
                  className="text-[10px] text-[#52525b] hover:text-[#a1a1aa]"
                >
                  Đóng
                </button>
              )}
            </div>
            
            {analysisLoading ? (
              <div className="bg-[#0f0f0f] border border-[#1e3a5f] rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[11px] text-[#60a5fa]">Đang phân tích với {DEFAULT_MODEL}...</span>
                </div>
              </div>
            ) : analysisResult && (
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg overflow-hidden">
                <div className="bg-[#18181b] px-4 py-2 border-b border-[#27272a] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div>
                  <span className="text-[10px] text-[#a1a1aa] font-medium">Analysis Complete</span>
                </div>
                <div className="p-4 max-h-[300px] overflow-y-auto">
                  <div className="prose prose-invert prose-xs max-w-none [&_table]:w-full [&_table]:text-[10px] [&_table]:border-collapse [&_th]:border [&_th]:border-[#3f3f46] [&_th]:bg-[#27272a] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#e4e4e7] [&_td]:border [&_td]:border-[#3f3f46] [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-[#a1a1aa] [&_p]:my-2 [&_p]:text-[11px] [&_p]:leading-relaxed [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_li]:text-[11px] [&_strong]:text-[#e4e4e7] [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-[#60a5fa] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:pb-1 [&_h1]:border-b [&_h1]:border-[#27272a] [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-[#60a5fa] [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:text-[#a1a1aa] [&_h3]:mt-2 [&_h3]:mb-1 [&_code]:bg-[#27272a] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#fbbf24] [&_code]:text-[10px] [&_pre]:bg-[#000] [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-[#27272a] [&_blockquote]:border-l-2 [&_blockquote]:border-[#3b82f6] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[#71717a]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderOverviewTab = () => (
    <>
      {/* Metrics Row - Grafana radial gauge stat panels */}
      <div className="grid grid-cols-5 gap-px mb-4" style={{ backgroundColor: isDarkMode ? 'hsl(var(--border))' : '#e5e7eb' }}>
        {([
          { label: 'EVENTS', value: metrics.totalEvents, accent: '#3b82f6', kind: 'total' as MetricKind },
          { label: 'CRITICAL', value: metrics.criticalAlerts, delta: `+${metrics.alertRate.toFixed(1)}%`, accent: '#ef4444', kind: 'alert' as MetricKind },
          { label: 'SUSPICIOUS', value: metrics.suspicious, accent: '#f59e0b', kind: 'suspicious' as MetricKind },
          { label: 'FALSE POS', value: metrics.falsePositives, accent: '#22c55e', kind: 'false_positive' as MetricKind },
          { label: 'SOURCES', value: metrics.uniqueSources, accent: '#8b5cf6', kind: 'sources' as MetricKind },
        ]).map((m) => (
          <MetricStatCard
            key={m.kind}
            label={m.label}
            value={m.value}
            accent={m.accent}
            kind={m.kind}
            delta={m.delta}
            events={sortedEvents}
            windowMinutes={30}
          />
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Traffic Chart - Professional SIEM Style */}
        <div className={`col-span-8 border rounded-md p-4 flex flex-col ${isDarkMode ? 'bg-card border-border' : 'bg-white border-[#e5e7eb]'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isDarkMode ? 'text-muted-foreground' : 'text-[#374151]'}`}>
              Traffic & Alerts
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'hsl(217, 91%, 50%)' }}></span>
                <span className={isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}>Traffic</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}></span>
                <span className={isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}>Alerts</span>
              </div>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className={`flex-1 min-h-[180px] flex items-center justify-center text-xs ${isDarkMode ? 'text-[#3f3f46]' : 'text-[#9ca3af]'}`}>No data available</div>
          ) : (
            <div className="flex-1 flex flex-col gap-2 min-h-[240px]">
              {/* Main chart - fixed nice ratio */}
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={isDarkMode ? '#1f1f1f' : '#f3f4f6'} vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fill: isDarkMode ? '#525252' : '#9ca3af', fontSize: 9 }} 
                      axisLine={{ stroke: isDarkMode ? '#1a1a1a' : '#e5e7eb' }} 
                      tickLine={false} 
                    />
                    <YAxis 
                      tick={{ fill: isDarkMode ? '#525252' : '#9ca3af', fontSize: 9 }} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDarkMode ? '#1a1a1a' : '#fff', 
                        border: `1px solid ${isDarkMode ? '#2a2a2a' : '#e5e7eb'}`, 
                        borderRadius: 2, 
                        fontSize: 10,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                      }}
                      labelStyle={{ color: isDarkMode ? '#e4e4e7' : '#111827', fontWeight: 600, marginBottom: 4 }}
                    />
                    <Area 
                      type="linear" 
                      dataKey="Traffic" 
                      stroke="hsl(217, 91%, 50%)" 
                      strokeWidth={1.5} 
                      fill="hsl(217, 91%, 50%)"
                      fillOpacity={0.08}
                      dot={{ fill: 'hsl(217, 91%, 50%)', strokeWidth: 0, r: 2 }}
                      activeDot={{ fill: 'hsl(217, 91%, 50%)', strokeWidth: 2, stroke: isDarkMode ? '#fff' : '#000', r: 4 }}
                    />
                    <Line 
                      type="linear" 
                      dataKey="Alerts" 
                      stroke="hsl(0, 84%, 60%)" 
                      strokeWidth={1.5} 
                      dot={{ fill: 'hsl(0, 84%, 60%)', strokeWidth: 0, r: 2 }}
                      activeDot={{ fill: 'hsl(0, 84%, 60%)', strokeWidth: 2, stroke: isDarkMode ? '#fff' : '#000', r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Stat note - text summary instead of chart */}
              {(() => {
                const trafficVals = chartData.map(d => d.Traffic);
                const alertVals = chartData.map(d => d.Alerts);
                const trafficPeak = Math.max(0, ...trafficVals);
                const trafficAvg = trafficVals.length ? Math.round(trafficVals.reduce((s, v) => s + v, 0) / trafficVals.length) : 0;
                const alertPeak = Math.max(0, ...alertVals);
                const alertTotal = alertVals.reduce((s, v) => s + v, 0);
                const trafficTotal = trafficVals.reduce((s, v) => s + v, 0);
                const alertRate = trafficTotal ? ((alertTotal / trafficTotal) * 100) : 0;
                // Trend: compare last 25% vs first 25%
                const q = Math.max(1, Math.floor(trafficVals.length / 4));
                const firstAvg = trafficVals.slice(0, q).reduce((s, v) => s + v, 0) / q;
                const lastAvg = trafficVals.slice(-q).reduce((s, v) => s + v, 0) / q;
                const trendPct = firstAvg ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;
                const trendUp = trendPct >= 0;
                const trendColor = Math.abs(trendPct) < 5
                  ? (isDarkMode ? '#71717a' : '#9ca3af')
                  : trendUp ? 'hsl(0, 84%, 60%)' : 'hsl(142, 71%, 45%)';

                // Color thresholds
                const alertRateColor =
                  alertRate > 10 ? 'hsl(0, 84%, 60%)' :       // đỏ: bất thường
                  alertRate > 5  ? 'hsl(38, 92%, 50%)' :      // vàng: cần chú ý
                  undefined;                                   // bình thường

                const Stat = ({ label, value, color, hint }: { label: string; value: string; color?: string; hint: string }) => (
                  <UITooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col cursor-help group">
                        <span className={`text-[8px] uppercase tracking-wider flex items-center gap-1 ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>
                          {label}
                          <span className="text-[8px] opacity-40 group-hover:opacity-100 transition-opacity">ⓘ</span>
                        </span>
                        <span
                          className="text-[12px] font-mono font-semibold tabular-nums leading-tight"
                          style={{ color: color || (isDarkMode ? '#e4e4e7' : '#111827') }}
                        >
                          {value}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="start"
                      className="max-w-[260px] text-[11px] leading-relaxed font-normal bg-popover text-popover-foreground border border-border shadow-lg"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
                      {hint}
                    </TooltipContent>
                  </UITooltip>
                );

                return (
                  <div className={`flex-1 min-h-[44px] grid grid-cols-5 gap-3 px-1 pt-2 border-t ${isDarkMode ? 'border-[#1f1f1f]' : 'border-[#f1f5f9]'}`}>
                    <Stat
                      label="Traffic Peak"
                      value={trafficPeak.toLocaleString()}
                      hint="Lưu lượng cao nhất ghi nhận trong 1 khoảng (bucket) — đỉnh traffic của khoảng thời gian đang xem."
                    />
                    <Stat
                      label="Traffic Avg"
                      value={trafficAvg.toLocaleString()}
                      hint="Số events trung bình mỗi khoảng — mức nền bình thường của hệ thống."
                    />
                    <Stat
                      label="Alert Peak"
                      value={alertPeak.toLocaleString()}
                      color="hsl(0, 84%, 60%)"
                      hint="Số cảnh báo cao nhất trong 1 khoảng — có thể là burst tấn công hoặc scan dồn dập."
                    />
                    <Stat
                      label="Alert Rate"
                      value={`${alertRate.toFixed(1)}%`}
                      color={alertRateColor}
                      hint={`Tỉ lệ % event là cảnh báo (alerts / total). Bình thường <5%. Vàng: >5% cần chú ý. Đỏ: >10% bất thường — kiểm tra Top Sources & Attack Distribution.`}
                    />
                    <Stat
                      label="Trend"
                      value={`${trendUp ? '▲' : '▼'} ${Math.abs(trendPct).toFixed(0)}%`}
                      color={trendColor}
                      hint="So sánh 25% cuối với 25% đầu của khoảng thời gian. ▲ đỏ = traffic tăng mạnh (đáng ngờ). ▼ xanh = đang giảm. Xám = ổn định (<5%)."
                    />
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Attack Types - Professional Style */}
        <div className={`col-span-4 border rounded-md p-4 ${isDarkMode ? 'bg-card border-border' : 'bg-white border-[#e5e7eb]'}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] mb-2 ${isDarkMode ? 'text-muted-foreground' : 'text-[#374151]'}`}>Attack Distribution</div>
          {pieData.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center">
              <span className={`text-2xl mb-2 ${isDarkMode ? 'text-[#22c55e]' : 'text-[#16a34a]'}`}>✓</span>
              <span className={`text-sm font-medium ${isDarkMode ? 'text-[#22c55e]' : 'text-[#16a34a]'}`}>System Safe</span>
              <span className={`text-[9px] ${isDarkMode ? 'text-[#3f3f46]' : 'text-[#9ca3af]'}`}>No active threats</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative w-full" style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={pieData} 
                      cx="50%" 
                      cy="50%" 
                      innerRadius={45} 
                      outerRadius={70} 
                      paddingAngle={1} 
                      dataKey="value" 
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                      onMouseEnter={(_, idx) => setPieHoverIdx(idx)}
                      onMouseLeave={() => setPieHoverIdx(null)}
                    >
                      {pieData.map((d, i) => (
                        <Cell 
                          key={i} 
                          fill={d.isOther ? OTHER_COLOR : COLORS[i % COLORS.length]}
                          opacity={pieHoverIdx === null || pieHoverIdx === i ? 1 : 0.35}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label - swaps to hovered slice info */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
                  {pieHoverIdx !== null && pieData[pieHoverIdx] ? (
                    <>
                      <div className="text-[16px] font-mono font-semibold text-foreground tabular-nums leading-none">
                        {pieData[pieHoverIdx].value.toLocaleString()}
                      </div>
                      <div className="text-[9px] font-mono text-muted-foreground mt-0.5 tabular-nums">
                        {((pieData[pieHoverIdx].value / pieData.reduce((s, d) => s + d.value, 0)) * 100).toFixed(1)}%
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[20px] font-mono font-semibold text-foreground tabular-nums leading-none">
                        {pieData.reduce((s, d) => s + d.value, 0).toLocaleString()}
                      </div>
                      <div className="text-[8px] uppercase tracking-wider text-muted-foreground mt-1">
                        {totalAttackTypes} types
                      </div>
                    </>
                  )}
                </div>
              </div>
              {/* Hovered name strip - replaces floating tooltip to avoid overlap */}
              <div className="w-full h-4 mt-1 flex items-center justify-center text-[10px] truncate">
                {pieHoverIdx !== null && pieData[pieHoverIdx] ? (
                  <span className="text-foreground font-medium truncate" title={pieData[pieHoverIdx].name}>
                    {pieData[pieHoverIdx].name}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50 text-[9px] uppercase tracking-wider">Hover slice for details</span>
                )}
              </div>
              <div className="w-full grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
                {pieData.map((d, i) => (
                  <div 
                    key={d.name} 
                    className="flex items-center gap-1.5 text-[9px] cursor-pointer transition-opacity"
                    style={{ opacity: pieHoverIdx === null || pieHoverIdx === i ? 1 : 0.4 }}
                    onMouseEnter={() => setPieHoverIdx(i)}
                    onMouseLeave={() => setPieHoverIdx(null)}
                  >
                    <span className="w-2 h-2 shrink-0" style={{ background: d.isOther ? OTHER_COLOR : COLORS[i % COLORS.length] }} />
                    <span className={`truncate flex-1 ${d.isOther ? 'italic' : ''} ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{d.name}</span>
                    <span className={`font-mono font-medium ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Event Table */}
        <div className="col-span-9 flex flex-col h-[720px]">
          {renderEventTable(displayEvents)}
        </div>

        {/* Top Sources + System Resources */}
        <div className="col-span-3 space-y-3 flex flex-col">
          <div className={`p-3 border rounded-md ${isDarkMode ? 'bg-card border-border' : 'bg-white border-[#e5e7eb]'}`}>
            <div className={`text-[10px] uppercase tracking-wider mb-3 ${isDarkMode ? 'text-muted-foreground' : 'text-[#9ca3af]'}`}>Top Sources</div>
            {barData.length === 0 ? (
              <div className={`h-40 flex items-center justify-center text-xs ${isDarkMode ? 'text-[#3f3f46]' : 'text-[#9ca3af]'}`}>No data</div>
            ) : (
              <div className="space-y-2">
                {barData.slice(0, 8).map((d, i) => (
                  <div key={d.ip} className="flex items-center gap-2">
                    <span className={`text-[9px] font-mono w-24 truncate ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>{d.ip}</span>
                    <div className={`flex-1 h-2.5 overflow-hidden rounded-sm ${isDarkMode ? 'bg-muted' : 'bg-[#f3f4f6]'}`}>
                      <div 
                        className="h-full bg-[#f97316]"
                        style={{ width: `${(d.count / barData[0].count) * 100}%` }}
                      />
                    </div>
                    <span className={`text-[9px] font-mono w-6 text-right ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <SystemResourcesPanel apiUrl={apiUrl} />
          <EventsRatePanel events={sortedEvents} windowMinutes={30} />
          <VerdictDistributionPanel events={sortedEvents} />
        </div>
      </div>

      {renderInspector()}
    </>
  );

  const renderEventsTab = () => {
    const engineCounts = sortedEvents.reduce((acc, e) => {
      acc[e.source_engine] = (acc[e.source_engine] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const topEngines = Object.entries(engineCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    const recentAlerts = sortedEvents.filter(e => e.verdict === 'ALERT').slice(0, 5);
    
    return (
      <>
        <div className="mb-4">
          <h2 className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>Security Event Log</h2>
          <p className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>Complete event stream with real-time filtering • {sortedEvents.length} events in selected range</p>
        </div>
        
        {/* Unified Filters */}
        {renderFilters()}
        
        <div className="grid grid-cols-12 gap-4">
          {/* Main Event Table */}
          <div className="col-span-9">
            {/* Event Statistics */}
            <div className="grid grid-cols-6 gap-px mb-4" style={{ backgroundColor: isDarkMode ? '#1a1a1a' : '#e5e7eb' }}>
              {[
                { label: 'Total', value: sortedEvents.length, color: '#3b82f6' },
                { label: 'Alert', value: sortedEvents.filter(e => e.verdict === 'ALERT').length, color: '#ef4444' },
                { label: 'Suspicious', value: sortedEvents.filter(e => e.verdict === 'SUSPICIOUS').length, color: '#f59e0b' },
                { label: 'False Pos', value: sortedEvents.filter(e => e.verdict === 'FALSE_POSITIVE').length, color: '#22c55e' },
                { label: 'Benign', value: sortedEvents.filter(e => e.verdict === 'BENIGN').length, color: '#71717a' },
                { label: 'High Conf', value: sortedEvents.filter(e => e.confidence > 0.8).length, color: '#8b5cf6' },
              ].map((s, i) => (
                <div key={i} className={`p-2 text-center ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
                  <div className="text-lg font-semibold font-mono" style={{ color: s.color }}>{s.value}</div>
                  <div className={`text-[9px] uppercase ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{s.label}</div>
                </div>
              ))}
            </div>
            
            {renderEventTable(displayEvents)}
          </div>
          
          {/* Sidebar */}
          <div className="col-span-3 space-y-3">
            {/* Detection Engines */}
            <div className={`border p-3 ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
              <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Detection Engines</div>
              <div className="space-y-2">
                {topEngines.map(([engine, count]) => (
                  <div key={engine} className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>{engine}</span>
                    <span className={`text-[11px] font-mono ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Recent Alerts */}
            <div className={`border p-3 ${isDarkMode ? 'bg-[#0a0a0a] border-[#ef4444]/20' : 'bg-white border-[#ef4444]/20'}`}>
              <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Recent Alerts</div>
              <div className="space-y-2">
                {recentAlerts.length === 0 ? (
                  <div className={`text-[10px] ${isDarkMode ? 'text-[#3f3f46]' : 'text-[#9ca3af]'}`}>No alerts</div>
                ) : recentAlerts.map((alert) => (
                  <div key={alert.id} className={`text-[10px] border-b pb-2 last:border-0 ${isDarkMode ? 'border-[#1f1f1f]' : 'border-[#f3f4f6]'}`}>
                    <div className="text-[#ef4444] font-medium truncate">{alert.attack_type}</div>
                    <div className={`font-mono ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{alert.src_ip}</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Time Distribution */}
            <div className={`border p-3 ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
              <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Event Timeline</div>
              <div className="h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData.slice(-12)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Area type="monotone" dataKey="Traffic" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
        
        {renderInspector()}
      </>
    );
  };

  const renderThreatsTab = () => {
    const criticalEvents = sortedEvents.filter(e => e.verdict === 'ALERT' || e.verdict === 'SUSPICIOUS');
    const uniqueAttackTypes = [...new Set(criticalEvents.map(e => e.attack_type))];
    const attackCounts = uniqueAttackTypes.map(type => ({
      type,
      count: criticalEvents.filter(e => e.attack_type === type).length,
      alertCount: criticalEvents.filter(e => e.attack_type === type && e.verdict === 'ALERT').length,
      severity: criticalEvents.filter(e => e.attack_type === type && e.verdict === 'ALERT').length > 0 ? 'critical' : 'warning'
    })).sort((a, b) => b.count - a.count);

    const uniqueSourceIPs = [...new Set(criticalEvents.map(e => e.src_ip))];
    const topThreatSources = uniqueSourceIPs.map(ip => ({
      ip,
      count: criticalEvents.filter(e => e.src_ip === ip).length,
      attacks: [...new Set(criticalEvents.filter(e => e.src_ip === ip).map(e => e.attack_type))]
    })).sort((a, b) => b.count - a.count).slice(0, 10);

    const highConfidenceThreats = criticalEvents.filter(e => e.confidence > 0.8);

    return (
      <>
        <div className="mb-4">
          <h2 className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>Threat Intelligence</h2>
          <p className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>Active threats requiring attention • {criticalEvents.length} critical events from {uniqueSourceIPs.length} sources</p>
        </div>
        
        {/* Threat Overview Cards */}
        <div className="grid grid-cols-4 gap-px mb-4" style={{ backgroundColor: isDarkMode ? '#1a1a1a' : '#e5e7eb' }}>
          {[
            { label: 'Critical Alerts', value: alertEvents.length, accent: '#ef4444', sub: 'Immediate action required' },
            { label: 'Suspicious', value: criticalEvents.length - alertEvents.length, accent: '#f59e0b', sub: 'Under investigation' },
            { label: 'Attack Types', value: uniqueAttackTypes.length, accent: '#8b5cf6', sub: 'Unique signatures' },
            { label: 'High Confidence', value: highConfidenceThreats.length, accent: '#3b82f6', sub: '>80% certainty' },
          ].map((card, i) => (
            <div key={i} className={`p-3 ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`} style={{ borderTop: `2px solid ${card.accent}` }}>
              <div className={`text-[10px] uppercase tracking-wider font-medium ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{card.label}</div>
              <div className={`text-2xl font-semibold font-mono my-1 ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>{card.value}</div>
              <div className={`text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{card.sub}</div>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-12 gap-4">
          {/* Left Panel - Threat Analysis */}
          <div className="col-span-4 space-y-3">
            {/* Attack Type Breakdown */}
            <div className={`border p-4 ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
              <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Attack Signatures</div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {attackCounts.map((attack, i) => (
                  <div key={attack.type} className="flex items-center gap-2">
                    <span className={`w-2 h-2 flex-shrink-0 ${attack.severity === 'critical' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                    <span className={`text-[10px] flex-1 truncate ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{attack.type}</span>
                    <span className={`text-[10px] font-mono ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>{attack.count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Top Threat Sources */}
            <div className={`border p-4 ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
              <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Top Threat Sources</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {topThreatSources.slice(0, 6).map((source, i) => (
                  <div key={source.ip} className={`border-b pb-2 last:border-0 ${isDarkMode ? 'border-[#1f1f1f]' : 'border-[#f3f4f6]'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-[#3b82f6]">{source.ip}</span>
                      <span className="text-[10px] font-mono text-[#ef4444]">{source.count}</span>
                    </div>
                    <div className={`text-[9px] truncate ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{source.attacks.slice(0, 2).join(', ')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Right Panel - Threat Events */}
          <div className="col-span-8">
            <div className={`rounded ${isDarkMode ? 'bg-[#0f0f0f] border border-[#dc2626]/30' : 'bg-white border border-[#dc2626]/30'}`}>
              <div className={`p-3 border-b flex items-center justify-between ${isDarkMode ? 'border-[#1f1f1f]' : 'border-[#fee2e2]'}`}>
                <div className={`text-xs uppercase tracking-wider font-semibold ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Active Threats</div>
                <span className="text-[9px] text-[#dc2626]">{criticalEvents.length} threats detected</span>
              </div>
              {renderEventTable(criticalEvents.slice(0, 50))}
            </div>
          </div>
        </div>
        {renderInspector()}
      </>
    );
  };

  const renderReportsTab = () => {
    const avgConfidence = events.length > 0 ? (events.reduce((a, e) => a + e.confidence, 0) / events.length) : 0;
    const protocolCounts = events.reduce((acc, e) => {
      acc[e.protocol] = (acc[e.protocol] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const topProtocols = Object.entries(protocolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    const hourlyData = trafficData.reduce((acc, d) => {
      const hour = d.timestamp.getHours();
      if (!acc[hour]) acc[hour] = { traffic: 0, alerts: 0 };
      acc[hour].traffic += d.total;
      acc[hour].alerts += d.alerts;
      return acc;
    }, {} as Record<number, { traffic: number; alerts: number }>);
    
    const peakHour = Object.entries(hourlyData).sort((a, b) => b[1].traffic - a[1].traffic)[0];
    
    const verdictBreakdown = [
      { name: 'Alert', value: sortedEvents.filter(e => e.verdict === 'ALERT').length, color: '#dc2626' },
      { name: 'Suspicious', value: sortedEvents.filter(e => e.verdict === 'SUSPICIOUS').length, color: '#d97706' },
      { name: 'False Positive', value: sortedEvents.filter(e => e.verdict === 'FALSE_POSITIVE').length, color: '#16a34a' },
      { name: 'Benign', value: sortedEvents.filter(e => e.verdict === 'BENIGN').length, color: '#71717a' },
    ];
    
    return (
      <>
        <div className="mb-4">
          <h2 className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-[#fafafa]' : 'text-[#111827]'}`}>Security Reports</h2>
          <p className={`text-[10px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>Analytics dashboard for {timeRangeLabel} • Generated at {now}</p>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Total Events', value: metrics.totalEvents, sub: 'In time range' },
            { label: 'Detection Rate', value: `${metrics.alertRate.toFixed(1)}%`, sub: 'Alerts / Total' },
            { label: 'Avg Confidence', value: avgConfidence.toFixed(2), sub: 'Mean score' },
            { label: 'Unique Sources', value: metrics.uniqueSources, sub: 'Distinct IPs' },
            { label: 'Peak Hour', value: peakHour ? `${peakHour[0]}:00` : '-', sub: peakHour ? `${peakHour[1].traffic} events` : '' },
          ].map((card, i) => (
            <div key={i} className={`border rounded p-3 ${isDarkMode ? 'bg-[#0f0f0f] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
              <div className={`text-xs uppercase tracking-wider font-semibold ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#6b7280]'}`}>{card.label}</div>
              <div className={`text-xl font-bold font-mono my-1 ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>{card.value}</div>
              <div className={`text-[9px] ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>{card.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4 mb-4">
          {/* Traffic Trend */}
          <div className={`col-span-8 border rounded p-4 ${isDarkMode ? 'bg-[#0f0f0f] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`text-xs uppercase tracking-wider font-semibold ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Traffic Trend</div>
              <div className={`flex items-center gap-4 text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#9ca3af]'}`}>
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#3b82f6]"></span> Traffic</span>
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#dc2626]"></span> Alerts</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="trafficGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 2" stroke={isDarkMode ? '#1f1f1f' : '#f3f4f6'} vertical={false} />
                <XAxis dataKey="time" tick={{ fill: isDarkMode ? '#71717a' : '#9ca3af', fontSize: 9 }} axisLine={{ stroke: isDarkMode ? '#27272a' : '#e5e7eb' }} tickLine={false} />
                <YAxis tick={{ fill: isDarkMode ? '#71717a' : '#9ca3af', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#18181b' : '#fff', border: `1px solid ${isDarkMode ? '#3f3f46' : '#e5e7eb'}`, borderRadius: 6, fontSize: 10 }} />
                <Area type="monotone" dataKey="Traffic" stroke="#3b82f6" strokeWidth={2} fill="url(#trafficGrad2)" />
                <Line type="monotone" dataKey="Alerts" stroke="#dc2626" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          {/* Verdict Breakdown */}
          <div className={`col-span-4 border rounded p-4 ${isDarkMode ? 'bg-[#0f0f0f] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
            <div className={`text-xs uppercase tracking-wider font-semibold mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Verdict Distribution</div>
            <div className="space-y-3">
              {verdictBreakdown.map((v) => (
                <div key={v.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>{v.name}</span>
                    <span className="text-[11px] font-mono" style={{ color: v.color }}>{v.value}</span>
                  </div>
                  <div className={`w-full h-1.5 rounded ${isDarkMode ? 'bg-[#1f1f1f]' : 'bg-[#e5e7eb]'}`}>
                    <div className="h-full rounded" style={{ width: `${Math.min((v.value / Math.max(sortedEvents.length, 1)) * 100, 100)}%`, backgroundColor: v.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Top Attack Sources */}
          <div className={`border rounded p-4 ${isDarkMode ? 'bg-[#0f0f0f] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
            <div className={`text-xs uppercase tracking-wider font-semibold mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Top Attack Sources</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: isDarkMode ? '#71717a' : '#9ca3af', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="ip" tick={{ fill: isDarkMode ? '#a1a1aa' : '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
                <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#18181b' : '#fff', border: `1px solid ${isDarkMode ? '#3f3f46' : '#e5e7eb'}`, borderRadius: 6, fontSize: 10 }} />
                <Bar dataKey="count" fill="#ea580c" radius={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Protocol Distribution */}
          <div className={`border rounded p-4 ${isDarkMode ? 'bg-[#0f0f0f] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
            <div className={`text-xs uppercase tracking-wider font-semibold mb-3 ${isDarkMode ? 'text-[#a1a1aa]' : 'text-[#374151]'}`}>Protocol Distribution</div>
            <div className="flex gap-3 flex-wrap">
              {topProtocols.map(([proto, count]) => (
                <div key={proto} className={`border rounded px-4 py-3 text-center min-w-[80px] ${isDarkMode ? 'bg-[#0a0a0a] border-[#27272a]' : 'bg-[#f9fafb] border-[#e5e7eb]'}`}>
                  <div className={`text-xl font-bold font-mono ${isDarkMode ? 'text-[#e4e4e7]' : 'text-[#111827]'}`}>{count}</div>
                  <div className={`text-[10px] uppercase ${isDarkMode ? 'text-[#71717a]' : 'text-[#6b7280]'}`}>{proto}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={`min-h-screen font-['Inter',system-ui,sans-serif] transition-colors ${isDarkMode ? 'bg-[#0a0a0a] text-[#e4e4e7]' : 'bg-[#f8f9fa] text-[#111827]'}`}>
      {/* Top Bar */}
      <header className={`h-10 flex items-center justify-between px-4 border-b ${isDarkMode ? 'bg-[#0f0f0f] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`text-[11px] font-semibold tracking-[0.2em] uppercase transition-colors ${isDarkMode ? 'text-[#a1a1aa] hover:text-[#e4e4e7]' : 'text-[#6b7280] hover:text-[#111827]'}`}
          >
            Security Operations Center
          </button>
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-[11px] font-medium tracking-wide rounded transition-colors ${
                  activeTab === tab.id 
                    ? isDarkMode 
                      ? 'text-[#e4e4e7] bg-[#1a1a1a] border-b-2 border-[#3b82f6]' 
                      : 'text-[#111827] bg-[#f3f4f6] border-b-2 border-[#3b82f6]'
                    : isDarkMode 
                      ? 'text-[#71717a] hover:text-[#a1a1aa] hover:bg-[#18181b]'
                      : 'text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {/* Assistant — flat ghost button */}
          <button
            onClick={() => setShowAIChat(!showAIChat)}
            className="h-7 px-3 text-[10px] font-medium tracking-wide uppercase bg-transparent text-foreground/80 border border-border rounded-sm hover:bg-muted hover:text-foreground transition-colors font-mono"
          >
            Assistant
          </button>

          {/* Clock — mono, flat */}
          <div className="h-7 px-3 flex items-center text-[10px] font-mono text-muted-foreground bg-transparent border border-border rounded-sm tabular-nums">
            {now}
          </div>

          {/* Stream is always-on; no badge needed in header */}

          {/* Settings — icon only, flat */}
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="h-7 w-7 flex items-center justify-center rounded-sm bg-transparent text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="p-4">
        {/* Controls - themed */}
        <div className="flex items-center gap-3 mb-4">
          {/* WebSocket Status Indicator */}
          {wsUrl && (
            <div className={`flex items-center gap-2 px-3 py-1.5 border ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
              {wsIsConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#22c55e]" />
                  <span className="text-[10px] text-[#22c55e] font-medium">NIDS Connected</span>
                  {wsEventCount > 0 && (
                    <span className="text-[9px] text-[#71717a]">({wsEventCount} events)</span>
                  )}
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span className="text-[10px] text-[#f59e0b] font-medium">NIDS Offline</span>
                </>
              )}
            </div>
          )}

          <div className={`flex items-center gap-2 px-3 py-1.5 border ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-[#e5e7eb]'}`}>
            <span className={`text-[10px] uppercase tracking-wider ${isDarkMode ? 'text-[#52525b]' : 'text-[#9ca3af]'}`}>Auto Block</span>
            <button 
              onClick={() => setAutoBlock(!autoBlock)}
              className={`w-8 h-4 rounded-full transition-colors relative ${autoBlock ? 'bg-[#ef4444]' : isDarkMode ? 'bg-[#27272a]' : 'bg-[#d1d5db]'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${autoBlock ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>

          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className={`h-7 px-2 text-[11px] border focus:outline-none focus:border-[#3b82f6] ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f] text-[#a1a1aa]' : 'bg-white border-[#e5e7eb] text-[#374151]'}`}
          >
            {timeRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          <select 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value as 'all' | 'alerts')}
            className={`h-7 px-2 text-[11px] border focus:outline-none focus:border-[#3b82f6] ${isDarkMode ? 'bg-[#0a0a0a] border-[#1f1f1f] text-[#a1a1aa]' : 'bg-white border-[#e5e7eb] text-[#374151]'}`}
          >
            <option value="all">All Events</option>
            <option value="alerts">Alerts Only</option>
          </select>

          <div className="flex-1" />
          <span className={`text-[10px] ${isDarkMode ? 'text-[#3f3f46]' : 'text-[#9ca3af]'}`}>Range: {timeRangeLabel}</span>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'events' && renderEventsTab()}
        {activeTab === 'threats' && renderThreatsTab()}
        {activeTab === 'reports' && renderReportsTab()}

        {/* Footer */}
        <div className={`mt-6 text-center text-[9px] ${isDarkMode ? 'text-[#27272a]' : 'text-[#d1d5db]'}`}>
          SOC Dashboard v2.0 — Nhóm C1NE.03 — An ninh mạng K28 — Đại học Duy Tân
        </div>
      </div>
      
      {/* AI Chat Panel */}
      <AIChatPanel 
        isOpen={showAIChat} 
        onClose={() => setShowAIChat(false)} 
        events={events}
        selectedEvent={selectedEvent}
      />
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        theme={theme}
        setTheme={setTheme}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default SOCDashboard;
