import { useState, useEffect } from 'react';
import { useSOCData } from '@/hooks/useSOCData';
import { SOCEvent } from '@/types/soc';
import { Area, AreaChart, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart, PieChart, Pie, Cell, BarChart, Bar, Tooltip, Legend } from 'recharts';

const SOCDashboard = () => {
  const [isLive, setIsLive] = useState(true);
  const [autoBlock, setAutoBlock] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all');
  const [selectedEvent, setSelectedEvent] = useState<SOCEvent | null>(null);
  
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

  const getVerdictClass = (verdict: string) => {
    const v = verdict.toUpperCase();
    if (v === 'ALERT') return 'text-[#dc2626]';
    if (v === 'SUSPICIOUS') return 'text-[#d97706]';
    return 'text-[#16a34a]';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e4e4e7] font-['Inter',system-ui,sans-serif]">
      {/* Top Bar */}
      <header className="h-10 bg-[#0f0f0f] border-b border-[#1f1f1f] flex items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-[#a1a1aa] uppercase">
            Security Operations Center
          </span>
          <nav className="flex gap-1">
            {['Overview', 'Events', 'Threats', 'Reports'].map((tab, i) => (
              <button 
                key={tab}
                className={`px-3 py-1.5 text-[11px] font-medium tracking-wide ${
                  i === 0 ? 'text-[#e4e4e7] bg-[#1a1a1a]' : 'text-[#71717a] hover:text-[#a1a1aa]'
                } rounded transition-colors`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[#52525b] font-mono">{now}</span>
          <div className={`px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded ${
            isLive ? 'bg-[#166534]/30 text-[#4ade80] border border-[#166534]' : 'bg-[#27272a] text-[#71717a]'
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

        {/* Metrics Row */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Events', value: metrics.totalEvents, color: '#3b82f6' },
            { label: 'Critical', value: metrics.criticalAlerts, delta: `${metrics.alertRate.toFixed(1)}%`, color: '#dc2626' },
            { label: 'Suspicious', value: metrics.suspicious, color: '#d97706' },
            { label: 'False Pos', value: metrics.falsePositives, color: '#16a34a' },
            { label: 'Sources', value: metrics.uniqueSources, color: '#3b82f6' },
          ].map((m, i) => (
            <div key={i} className="bg-[#0f0f0f] border border-[#1f1f1f] p-3 rounded" style={{ borderLeftColor: m.color, borderLeftWidth: 3 }}>
              <div className="text-[10px] text-[#52525b] uppercase tracking-wider mb-1">{m.label}</div>
              <div className="text-2xl font-bold font-mono text-[#fafafa]">{m.value.toLocaleString()}</div>
              {m.delta && <div className="text-[11px] text-[#dc2626] font-medium">{m.delta}</div>}
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-4">
          {/* Traffic Chart */}
          <div className="col-span-8 bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3">
            <div className="text-[10px] text-[#52525b] uppercase tracking-wider mb-3">Traffic & Alerts</div>
            {chartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[#3f3f46] text-xs">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 4, fontSize: 10 }}
                    labelStyle={{ color: '#a1a1aa' }}
                  />
                  <Area type="monotone" dataKey="Traffic" stroke="#3b82f6" strokeWidth={1} fill="url(#trafficGrad)" />
                  <Line type="monotone" dataKey="Alerts" stroke="#dc2626" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Attack Types */}
          <div className="col-span-4 bg-[#0f0f0f] border border-[#1f1f1f] rounded p-3">
            <div className="text-[10px] text-[#52525b] uppercase tracking-wider mb-3">Attack Distribution</div>
            {pieData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[#16a34a] text-xs">No threats detected</div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={1} dataKey="value" stroke="none">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {pieData.slice(0, 5).map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-[#a1a1aa] truncate flex-1">{d.name}</span>
                      <span className="text-[#52525b] font-mono">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Event Table */}
          <div className="col-span-9 bg-[#0f0f0f] border border-[#1f1f1f] rounded">
            <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
              <div className="text-[10px] text-[#52525b] uppercase tracking-wider">Event Stream</div>
              {isLive && <span className="text-[9px] text-[#52525b]">Auto-refreshing • Click row to inspect when paused</span>}
            </div>
            
            {/* Filters */}
            <div className="flex gap-2 p-2 border-b border-[#1f1f1f] bg-[#0a0a0a]">
              <select 
                value={verdictFocus} 
                onChange={(e) => setVerdictFocus(e.target.value)}
                className="h-6 px-2 text-[10px] bg-[#0f0f0f] border border-[#1f1f1f] rounded text-[#a1a1aa]"
              >
                <option value="All">All Verdicts</option>
                <option value="ALERT">ALERT</option>
                <option value="SUSPICIOUS">SUSPICIOUS</option>
                <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                <option value="BENIGN">BENIGN</option>
              </select>
              <input 
                type="text"
                placeholder="IP Filter"
                value={ipFilter}
                onChange={(e) => setIpFilter(e.target.value)}
                className="h-6 px-2 text-[10px] bg-[#0f0f0f] border border-[#1f1f1f] rounded text-[#a1a1aa] placeholder-[#3f3f46] w-32"
              />
              <input 
                type="text"
                placeholder="Signature"
                value={sigFilter}
                onChange={(e) => setSigFilter(e.target.value)}
                className="h-6 px-2 text-[10px] bg-[#0f0f0f] border border-[#1f1f1f] rounded text-[#a1a1aa] placeholder-[#3f3f46] w-32"
              />
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[9px] text-[#3f3f46]">Conf ≥</span>
                <input 
                  type="range" min="0" max="1" step="0.05"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-[#27272a] rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-[#3b82f6] [&::-webkit-slider-thumb]:rounded-full"
                />
                <span className="text-[9px] text-[#52525b] font-mono w-6">{minConfidence.toFixed(2)}</span>
              </div>
            </div>

            <div className="overflow-auto max-h-[320px]">
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
                  {sortedEvents.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-[#3f3f46]">No events</td></tr>
                  ) : sortedEvents.map(event => (
                    <tr 
                      key={event.id} 
                      onClick={() => !isLive && setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                      className={`border-b border-[#18181b] cursor-pointer transition-colors ${
                        selectedEvent?.id === event.id ? 'bg-[#1e3a5f]/30' : 'hover:bg-[#18181b]'
                      }`}
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

        {/* Inspector Panel */}
        {!isLive && selectedEvent && (
          <div className="mt-4 bg-[#0f0f0f] border border-[#1f1f1f] rounded" style={{ borderLeftColor: '#dc2626', borderLeftWidth: 3 }}>
            <div className="p-3 border-b border-[#1f1f1f]">
              <span className="text-[10px] text-[#52525b] uppercase tracking-wider">Event Inspector</span>
            </div>
            <div className="p-4 grid grid-cols-5 gap-4">
              {[
                { label: 'Timestamp', value: selectedEvent.timestamp.toLocaleString() },
                { label: 'Verdict', value: selectedEvent.verdict, className: getVerdictClass(selectedEvent.verdict) },
                { label: 'Signature', value: selectedEvent.attack_type },
                { label: 'Engine', value: selectedEvent.source_engine },
                { label: 'Confidence', value: selectedEvent.confidence.toFixed(2) },
                { label: 'Source IP', value: selectedEvent.src_ip, className: 'text-[#60a5fa]' },
                { label: 'Destination', value: `${selectedEvent.dst_ip}:${selectedEvent.dst_port || '-'}` },
                { label: 'Protocol', value: selectedEvent.protocol },
                { label: 'Community ID', value: selectedEvent.community_id, mono: true },
                { label: 'Action', value: selectedEvent.action_taken || 'None' },
              ].map((field, i) => (
                <div key={i}>
                  <div className="text-[9px] text-[#52525b] uppercase tracking-wider mb-1">{field.label}</div>
                  <div className={`text-[11px] ${field.mono ? 'font-mono' : ''} ${field.className || 'text-[#e4e4e7]'}`}>
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <div className="text-[9px] text-[#52525b] uppercase tracking-wider mb-1">Raw Payload</div>
              <pre className="text-[9px] font-mono text-[#71717a] bg-[#0a0a0a] p-2 rounded border border-[#1f1f1f] overflow-auto max-h-20">
                {selectedEvent.raw_log}
              </pre>
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button className="px-3 py-1.5 text-[10px] bg-[#1e3a5f] text-[#60a5fa] border border-[#1e40af] rounded hover:bg-[#1e40af]/30 transition-colors">
                Generate Playbook
              </button>
              <button className="px-3 py-1.5 text-[10px] bg-[#450a0a] text-[#f87171] border border-[#7f1d1d] rounded hover:bg-[#7f1d1d]/30 transition-colors">
                Block Source IP
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-[9px] text-[#27272a]">
          SOC Dashboard v22 — Hybrid NIDS Engine
        </div>
      </div>
    </div>
  );
};

export default SOCDashboard;
