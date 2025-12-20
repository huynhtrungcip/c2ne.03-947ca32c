import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSOCData } from '@/hooks/useSOCData';
import { SOCEvent } from '@/types/soc';
import { Area, AreaChart, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart, PieChart, Pie, Cell, BarChart, Bar, Tooltip } from 'recharts';

type TabType = 'overview' | 'events' | 'threats' | 'reports';

// AI Chatbot Panel Component
const AIChatPanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'SOC AI Assistant sẵn sàng. Hãy đặt câu hỏi về alerts, IP nguồn, pattern tấn công hoặc đề xuất hành động.' }
  ]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Đang phân tích dữ liệu SOC... Tính năng AI sẽ được kết nối với MegaLLM backend.' 
      }]);
    }, 500);
    setMessage('');
  };

  return (
    <div className="fixed right-4 bottom-4 w-96 bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg shadow-2xl z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
        <span className="text-[11px] font-semibold text-[#e4e4e7] uppercase tracking-wider">AI Assistant</span>
        <button onClick={onClose} className="text-[#71717a] hover:text-[#e4e4e7] text-sm">✕</button>
      </div>
      <div className="h-72 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-lg text-[11px] ${
              msg.role === 'user' 
                ? 'bg-[#1e3a5f] text-[#93c5fd]' 
                : 'bg-[#18181b] text-[#a1a1aa]'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-[#1f1f1f]">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Hỏi về logs, alerts, correlation..."
            className="flex-1 h-8 px-3 text-[11px] bg-[#0a0a0a] border border-[#27272a] rounded text-[#e4e4e7] placeholder-[#3f3f46] focus:outline-none focus:border-[#3b82f6]"
          />
          <button 
            onClick={handleSend}
            className="px-3 h-8 text-[10px] bg-[#1e3a5f] text-[#60a5fa] border border-[#1e40af] rounded hover:bg-[#1e40af]/50 transition-colors font-medium"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
};

const SOCDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isLive, setIsLive] = useState(true);
  const [autoBlock, setAutoBlock] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all');
  const [selectedEvent, setSelectedEvent] = useState<SOCEvent | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  
  const [verdictFocus, setVerdictFocus] = useState('All');
  const [ipFilter, setIpFilter] = useState('');
  const [sigFilter, setSigFilter] = useState('');
  const [minConfidence, setMinConfidence] = useState(0);

  const { events, metrics, topSources, attackTypeData, trafficData, timeRanges } = useSOCData(
    timeRange,
    viewMode,
    isLive,
    { verdictFocus, ipFilter, sigFilter, minConfidence }
  );

  useEffect(() => {
    if (isLive) setSelectedEvent(null);
  }, [isLive]);

  // Reset selected event when switching tabs or mode changes
  useEffect(() => {
    setSelectedEvent(null);
  }, [activeTab, isLive, timeRange, viewMode]);

  const handleEventClick = (event: SOCEvent) => {
    if (isLive) return;
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

  const pieData = attackTypeData.map(d => ({ name: d.type, value: d.count }));
  const COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#ea580c', '#16a34a', '#ca8a04'];

  const barData = topSources.map(d => ({ ip: d.ip, count: d.count }));
  const sortedEvents = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 200);
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

  // Unified filter component - only show in Events tab
  const renderFilters = () => (
    <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3 mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[10px] text-[#52525b] uppercase tracking-wider font-semibold">Filters</div>
        <select 
          value={verdictFocus} 
          onChange={(e) => setVerdictFocus(e.target.value)}
          className="h-7 px-2 text-[11px] bg-[#0a0a0a] border border-[#27272a] rounded text-[#a1a1aa]"
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
          className="h-7 px-3 text-[11px] bg-[#0a0a0a] border border-[#27272a] rounded text-[#a1a1aa] placeholder-[#3f3f46] w-36"
        />
        <input 
          type="text"
          placeholder="Filter by Signature..."
          value={sigFilter}
          onChange={(e) => setSigFilter(e.target.value)}
          className="h-7 px-3 text-[11px] bg-[#0a0a0a] border border-[#27272a] rounded text-[#a1a1aa] placeholder-[#3f3f46] w-44"
        />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#52525b]">Min Confidence</span>
          <input 
            type="range" min="0" max="1" step="0.05"
            value={minConfidence}
            onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
            className="w-20 h-1.5 bg-[#27272a] rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#3b82f6] [&::-webkit-slider-thumb]:rounded-full"
          />
          <span className="text-[11px] text-[#71717a] font-mono w-8">{(minConfidence * 100).toFixed(0)}%</span>
        </div>
        {(verdictFocus !== 'All' || ipFilter || sigFilter || minConfidence > 0) && (
          <button 
            onClick={() => { setVerdictFocus('All'); setIpFilter(''); setSigFilter(''); setMinConfidence(0); }}
            className="text-[10px] text-[#71717a] hover:text-[#a1a1aa] underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );

  const renderEventTable = (eventList: SOCEvent[]) => (
    <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded">
      <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
        <div className="text-[10px] text-[#52525b] uppercase tracking-wider">Event Stream ({eventList.length} events)</div>
        {isLive && <span className="text-[9px] text-[#d97706]">Pause LIVE mode to inspect events</span>}
        {!isLive && <span className="text-[9px] text-[#16a34a]">Click any row to inspect</span>}
      </div>

      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[#0a0a0a]">
            <tr className="text-[#52525b] uppercase tracking-wider border-b border-[#1f1f1f]">
              <th className="text-left py-2 px-3 font-medium">Time</th>
              <th className="text-left py-2 px-3 font-medium">Verdict</th>
              <th className="text-left py-2 px-3 font-medium">Source</th>
              <th className="text-left py-2 px-3 font-medium">Destination</th>
              <th className="text-left py-2 px-3 font-medium">Port</th>
              <th className="text-left py-2 px-3 font-medium">Signature</th>
              <th className="text-right py-2 px-3 font-medium">Conf</th>
            </tr>
          </thead>
          <tbody>
            {eventList.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-[#3f3f46]">No events</td></tr>
            ) : eventList.map(event => (
              <tr 
                key={event.id} 
                onClick={() => handleEventClick(event)}
                className={`border-b border-[#18181b] transition-colors ${
                  isLive ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-[#18181b]'
                } ${selectedEvent?.id === event.id ? 'bg-[#1e3a5f]/40 border-l-2 border-l-[#3b82f6]' : ''}`}
              >
                <td className="py-1.5 px-3 font-mono text-[#71717a]">
                  {event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td className={`py-1.5 px-3 font-semibold ${getVerdictClass(event.verdict)}`}>
                  {event.verdict}
                </td>
                <td className="py-1.5 px-3 font-mono text-[#60a5fa]">{event.src_ip}</td>
                <td className="py-1.5 px-3 font-mono text-[#a1a1aa]">{event.dst_ip}</td>
                <td className="py-1.5 px-3 font-mono text-[#71717a]">{event.dst_port || '-'}</td>
                <td className="py-1.5 px-3 text-[#a1a1aa]">{event.attack_type}</td>
                <td className="py-1.5 px-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <div className="w-10 h-1 bg-[#27272a] rounded overflow-hidden">
                      <div 
                        className="h-full rounded" 
                        style={{ 
                          width: `${event.confidence * 100}%`,
                          background: event.confidence > 0.7 ? '#16a34a' : event.confidence > 0.4 ? '#d97706' : '#dc2626'
                        }} 
                      />
                    </div>
                    <span className="font-mono text-[#52525b]">{event.confidence.toFixed(2)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderInspector = () => {
    if (isLive || !selectedEvent) return null;
    
    const verdictBorderColor = selectedEvent.verdict === 'ALERT' ? '#dc2626' : 
                               selectedEvent.verdict === 'SUSPICIOUS' ? '#d97706' : '#16a34a';
    
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
          <div className="text-[10px] text-[#71717a] uppercase tracking-wider mb-2">Raw Payload</div>
          <pre className="text-[10px] font-mono text-[#a1a1aa] bg-[#000] p-3 rounded-lg border border-[#27272a] overflow-auto max-h-32">
            {selectedEvent.raw_log}
          </pre>
        </div>
        
        <div className="px-5 pb-5 flex gap-3">
          <button 
            onClick={() => setShowAIChat(true)}
            className="flex-1 px-4 py-2.5 text-[11px] font-semibold bg-[#1e3a5f] text-[#60a5fa] border border-[#1e40af] rounded-lg hover:bg-[#1e40af]/50 transition-colors"
          >
            Ask MegaLLM About This Flow
          </button>
          <button className="flex-1 px-4 py-2.5 text-[11px] font-semibold bg-[#450a0a] text-[#f87171] border border-[#7f1d1d] rounded-lg hover:bg-[#7f1d1d]/50 transition-colors">
            Block IP {selectedEvent.src_ip} on pfSense
          </button>
        </div>
      </div>
    );
  };

  const renderOverviewTab = () => (
    <>
      {/* Metrics Row */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'EVENTS', value: metrics.totalEvents, color: '#3b82f6' },
          { label: 'CRITICAL', value: metrics.criticalAlerts, delta: `+${metrics.alertRate.toFixed(1)}%`, color: '#dc2626' },
          { label: 'SUSPICIOUS', value: metrics.suspicious, color: '#d97706' },
          { label: 'FALSE POS', value: metrics.falsePositives, color: '#16a34a' },
          { label: 'SOURCES', value: metrics.uniqueSources, color: '#8b5cf6' },
        ].map((m, i) => (
          <div key={i} className="bg-[#0f0f0f] border border-[#1f1f1f] p-4 rounded" style={{ borderLeftColor: m.color, borderLeftWidth: 3 }}>
            <div className="text-sm text-[#a1a1aa] uppercase tracking-wider font-semibold mb-1">{m.label}</div>
            <div className="text-2xl font-bold font-mono text-[#e4e4e7]">{m.value.toLocaleString()}</div>
            {m.delta && <div className="text-xs text-[#71717a] mt-1">{m.delta}</div>}
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Traffic Chart */}
        <div className="col-span-8 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold">Traffic & Alerts</div>
            <div className="flex items-center gap-6 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-[#3b82f6] rounded"></span>
                <span className="text-[#71717a]">Network Traffic</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-[#dc2626] rounded"></span>
                <span className="text-[#71717a]">Security Alerts</span>
              </div>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-[#3f3f46] text-xs">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={{ stroke: '#27272a' }} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: '#e4e4e7', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="Traffic" stroke="#3b82f6" strokeWidth={2} fill="url(#trafficGrad)" name="Network Traffic" />
                <Line type="monotone" dataKey="Alerts" stroke="#dc2626" strokeWidth={2} dot={false} name="Security Alerts" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Attack Types - Larger Pie Chart */}
        <div className="col-span-4 bg-[#0f0f0f] border border-[#1f1f1f] rounded p-4">
          <div className="text-[11px] text-[#52525b] uppercase tracking-wider mb-2 font-semibold">Attack Distribution</div>
          {pieData.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center">
              <span className="text-3xl mb-2">✓</span>
              <span className="text-[#16a34a] text-sm font-medium">System Safe</span>
              <span className="text-[10px] text-[#3f3f46]">No active threats</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie 
                    data={pieData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={50} 
                    outerRadius={80} 
                    paddingAngle={2} 
                    dataKey="value" 
                    stroke="#0a0a0a"
                    strokeWidth={2}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
                    labelStyle={{ color: '#e4e4e7' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                {pieData.slice(0, 6).map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-[10px]">
                    <span className="w-2.5 h-2.5 rounded" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-[#a1a1aa] truncate flex-1">{d.name}</span>
                    <span className="text-[#71717a] font-mono font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Event Table */}
        <div className="col-span-9">
          {renderEventTable(sortedEvents)}
        </div>

        {/* Top Sources */}
        <div className="col-span-3 bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3">
          <div className="text-[10px] text-[#52525b] uppercase tracking-wider mb-3">Top Sources</div>
          {barData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-[#3f3f46] text-xs">No data</div>
          ) : (
            <div className="space-y-2">
              {barData.slice(0, 8).map((d, i) => (
                <div key={d.ip} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-[#71717a] w-24 truncate">{d.ip}</span>
                  <div className="flex-1 h-3 bg-[#18181b] rounded overflow-hidden">
                    <div 
                      className="h-full bg-[#ea580c] rounded"
                      style={{ width: `${(d.count / barData[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[#52525b] w-6 text-right">{d.count}</span>
                </div>
              ))}
            </div>
          )}
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
          <h2 className="text-sm font-semibold text-[#e4e4e7] mb-1">Security Event Log</h2>
          <p className="text-[10px] text-[#52525b]">Complete event stream with real-time filtering • {sortedEvents.length} events in selected range</p>
        </div>
        
        {/* Unified Filters */}
        {renderFilters()}
        
        <div className="grid grid-cols-12 gap-4">
          {/* Main Event Table */}
          <div className="col-span-9">
            {/* Event Statistics */}
            <div className="grid grid-cols-6 gap-2 mb-4">
              {[
                { label: 'Total', value: sortedEvents.length, color: '#3b82f6' },
                { label: 'Alert', value: sortedEvents.filter(e => e.verdict === 'ALERT').length, color: '#dc2626' },
                { label: 'Suspicious', value: sortedEvents.filter(e => e.verdict === 'SUSPICIOUS').length, color: '#d97706' },
                { label: 'False Pos', value: sortedEvents.filter(e => e.verdict === 'FALSE_POSITIVE').length, color: '#16a34a' },
                { label: 'Benign', value: sortedEvents.filter(e => e.verdict === 'BENIGN').length, color: '#71717a' },
                { label: 'High Conf', value: sortedEvents.filter(e => e.confidence > 0.8).length, color: '#8b5cf6' },
              ].map((s, i) => (
                <div key={i} className="bg-[#0f0f0f] border border-[#1f1f1f] p-2 rounded text-center">
                  <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[9px] text-[#52525b] uppercase">{s.label}</div>
                </div>
              ))}
            </div>
            
            {renderEventTable(sortedEvents)}
          </div>
          
          {/* Sidebar */}
          <div className="col-span-3 space-y-3">
            {/* Detection Engines */}
            <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3">
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Detection Engines</div>
              <div className="space-y-2">
                {topEngines.map(([engine, count]) => (
                  <div key={engine} className="flex items-center justify-between">
                    <span className="text-[10px] text-[#71717a]">{engine}</span>
                    <span className="text-[11px] font-mono text-[#a1a1aa]">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Recent Alerts */}
            <div className="bg-[#0f0f0f] border border-[#dc2626]/20 rounded p-3">
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Recent Alerts</div>
              <div className="space-y-2">
                {recentAlerts.length === 0 ? (
                  <div className="text-[10px] text-[#3f3f46]">No alerts</div>
                ) : recentAlerts.map((alert) => (
                  <div key={alert.id} className="text-[10px] border-b border-[#1f1f1f] pb-2 last:border-0">
                    <div className="text-[#dc2626] font-medium truncate">{alert.attack_type}</div>
                    <div className="text-[#52525b] font-mono">{alert.src_ip}</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Time Distribution */}
            <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3">
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Event Timeline</div>
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
          <h2 className="text-sm font-semibold text-[#e4e4e7] mb-1">Threat Intelligence</h2>
          <p className="text-[10px] text-[#52525b]">Active threats requiring attention • {criticalEvents.length} critical events from {uniqueSourceIPs.length} sources</p>
        </div>
        
        {/* Threat Overview Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Critical Alerts', value: alertEvents.length, color: '#dc2626', sub: 'Immediate action required' },
            { label: 'Suspicious', value: criticalEvents.length - alertEvents.length, color: '#d97706', sub: 'Under investigation' },
            { label: 'Attack Types', value: uniqueAttackTypes.length, color: '#8b5cf6', sub: 'Unique signatures' },
            { label: 'High Confidence', value: highConfidenceThreats.length, color: '#3b82f6', sub: '>80% certainty' },
          ].map((card, i) => (
            <div key={i} className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3" style={{ borderLeftColor: card.color, borderLeftWidth: 3 }}>
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold">{card.label}</div>
              <div className="text-2xl font-bold font-mono text-[#e4e4e7] my-1">{card.value}</div>
              <div className="text-[9px] text-[#52525b]">{card.sub}</div>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-12 gap-4">
          {/* Left Panel - Threat Analysis */}
          <div className="col-span-4 space-y-3">
            {/* Attack Type Breakdown */}
            <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-4">
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Attack Signatures</div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {attackCounts.map((attack, i) => (
                  <div key={attack.type} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${attack.severity === 'critical' ? 'bg-[#dc2626]' : 'bg-[#d97706]'}`} />
                    <span className="text-[10px] text-[#a1a1aa] flex-1 truncate">{attack.type}</span>
                    <span className="text-[10px] font-mono text-[#71717a]">{attack.count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Top Threat Sources */}
            <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-4">
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Top Threat Sources</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {topThreatSources.slice(0, 6).map((source, i) => (
                  <div key={source.ip} className="border-b border-[#1f1f1f] pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-[#60a5fa]">{source.ip}</span>
                      <span className="text-[10px] font-mono text-[#dc2626]">{source.count}</span>
                    </div>
                    <div className="text-[9px] text-[#52525b] truncate">{source.attacks.slice(0, 2).join(', ')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Right Panel - Threat Events */}
          <div className="col-span-8">
            <div className="bg-[#0f0f0f] border border-[#dc2626]/30 rounded">
              <div className="p-3 border-b border-[#1f1f1f] flex items-center justify-between">
                <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold">Active Threats</div>
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
          <h2 className="text-sm font-semibold text-[#e4e4e7] mb-1">Security Reports</h2>
          <p className="text-[10px] text-[#52525b]">Analytics dashboard for {timeRangeLabel} • Generated at {now}</p>
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
            <div key={i} className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3">
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold">{card.label}</div>
              <div className="text-xl font-bold font-mono text-[#e4e4e7] my-1">{card.value}</div>
              <div className="text-[9px] text-[#52525b]">{card.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4 mb-4">
          {/* Traffic Trend */}
          <div className="col-span-8 bg-[#0f0f0f] border border-[#1f1f1f] rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold">Traffic Trend</div>
              <div className="flex items-center gap-4 text-[10px]">
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
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={{ stroke: '#27272a' }} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 10 }} />
                <Area type="monotone" dataKey="Traffic" stroke="#3b82f6" strokeWidth={2} fill="url(#trafficGrad2)" />
                <Line type="monotone" dataKey="Alerts" stroke="#dc2626" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          {/* Verdict Breakdown */}
          <div className="col-span-4 bg-[#0f0f0f] border border-[#1f1f1f] rounded p-4">
            <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Verdict Distribution</div>
            <div className="space-y-3">
              {verdictBreakdown.map((v) => (
                <div key={v.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-[#71717a]">{v.name}</span>
                    <span className="text-[11px] font-mono" style={{ color: v.color }}>{v.value}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#1f1f1f] rounded">
                    <div className="h-full rounded" style={{ width: `${Math.min((v.value / Math.max(sortedEvents.length, 1)) * 100, 100)}%`, backgroundColor: v.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Top Attack Sources */}
          <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-4">
            <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Top Attack Sources</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="ip" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 10 }} />
                <Bar dataKey="count" fill="#ea580c" radius={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Protocol Distribution */}
          <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded p-4">
            <div className="text-xs text-[#a1a1aa] uppercase tracking-wider font-semibold mb-3">Protocol Distribution</div>
            <div className="flex gap-3 flex-wrap">
              {topProtocols.map(([proto, count]) => (
                <div key={proto} className="bg-[#0a0a0a] border border-[#27272a] rounded px-4 py-3 text-center min-w-[80px]">
                  <div className="text-xl font-bold font-mono text-[#e4e4e7]">{count}</div>
                  <div className="text-[10px] text-[#71717a] uppercase">{proto}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e4e4e7] font-['Inter',system-ui,sans-serif]">
      {/* Top Bar */}
      <header className="h-10 bg-[#0f0f0f] border-b border-[#1f1f1f] flex items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/')}
            className="text-[11px] font-semibold tracking-[0.2em] text-[#a1a1aa] uppercase hover:text-[#e4e4e7] transition-colors"
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
                    ? 'text-[#e4e4e7] bg-[#1a1a1a] border-b-2 border-[#3b82f6]' 
                    : 'text-[#71717a] hover:text-[#a1a1aa] hover:bg-[#18181b]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAIChat(!showAIChat)}
            className="h-7 px-4 text-[10px] font-medium bg-gradient-to-b from-[#1e3a5f] to-[#162d4d] text-[#93c5fd] border border-[#2563eb]/40 rounded-md hover:from-[#2563eb] hover:to-[#1e40af] hover:text-[#bfdbfe] transition-all shadow-sm"
          >
            AI Chat
          </button>
          <div className="h-7 px-3 flex items-center text-[10px] text-[#71717a] font-mono bg-[#0a0a0a] border border-[#1f1f1f] rounded-md">
            {now}
          </div>
          <div className={`h-7 px-3 flex items-center text-[9px] font-semibold tracking-wider uppercase rounded-md transition-all ${
            isLive 
              ? 'bg-gradient-to-b from-[#166534] to-[#14532d] text-[#86efac] border border-[#22c55e]/30 shadow-sm shadow-[#22c55e]/10' 
              : 'bg-[#18181b] text-[#71717a] border border-[#27272a]'
          }`}>
            {isLive ? '● LIVE' : 'PAUSED'}
          </div>
        </div>
      </header>

      <div className="p-4">
        {/* Controls */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0f0f0f] border border-[#1f1f1f] rounded">
            <span className="text-[10px] text-[#52525b] uppercase tracking-wider">Live</span>
            <button 
              onClick={() => setIsLive(!isLive)}
              className={`w-8 h-4 rounded-full transition-colors relative ${isLive ? 'bg-[#16a34a]' : 'bg-[#27272a]'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isLive ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0f0f0f] border border-[#1f1f1f] rounded">
            <span className="text-[10px] text-[#52525b] uppercase tracking-wider">Auto Block</span>
            <button 
              onClick={() => setAutoBlock(!autoBlock)}
              className={`w-8 h-4 rounded-full transition-colors relative ${autoBlock ? 'bg-[#dc2626]' : 'bg-[#27272a]'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${autoBlock ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>

          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="h-7 px-2 text-[11px] bg-[#0f0f0f] border border-[#1f1f1f] rounded text-[#a1a1aa] focus:outline-none focus:border-[#3b82f6]"
          >
            {timeRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          <select 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value as 'all' | 'alerts')}
            className="h-7 px-2 text-[11px] bg-[#0f0f0f] border border-[#1f1f1f] rounded text-[#a1a1aa] focus:outline-none focus:border-[#3b82f6]"
          >
            <option value="all">All Events</option>
            <option value="alerts">Alerts Only</option>
          </select>

          <div className="flex-1" />
          <span className="text-[10px] text-[#3f3f46]">Range: {timeRangeLabel}</span>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'events' && renderEventsTab()}
        {activeTab === 'threats' && renderThreatsTab()}
        {activeTab === 'reports' && renderReportsTab()}

        {/* Footer */}
        <div className="mt-6 text-center text-[9px] text-[#27272a]">
          SOC Dashboard v22 — Hybrid NIDS Engine
        </div>
      </div>
      
      {/* AI Chat Panel */}
      <AIChatPanel isOpen={showAIChat} onClose={() => setShowAIChat(false)} />
    </div>
  );
};

export default SOCDashboard;
