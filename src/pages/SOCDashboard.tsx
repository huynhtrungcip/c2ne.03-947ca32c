import { useState, useEffect } from 'react';
import { useSOCData } from '@/hooks/useSOCData';
import { SOCEvent } from '@/types/soc';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart, PieChart, Pie, Cell, BarChart, Bar, Tooltip } from 'recharts';

const SOCDashboard = () => {
  const [isLive, setIsLive] = useState(true);
  const [autoBlock, setAutoBlock] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all');
  const [selectedEvent, setSelectedEvent] = useState<SOCEvent | null>(null);
  
  // Filters
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

  // Chart data
  const chartData = trafficData.map(d => ({
    time: d.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    total: d.total,
    alerts: d.alerts
  }));

  const pieData = attackTypeData.map(d => ({ name: d.type, value: d.count }));
  const COLORS = ['#3b82f6', '#06b6d4', '#a855f7', '#f97316', '#22c55e', '#eab308'];

  const barData = topSources.map(d => ({ ip: d.ip, count: d.count }));

  const sortedEvents = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 200);

  return (
    <div className="min-h-screen bg-black p-4 lg:p-6" style={{ fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif" }}>
      <div className="max-w-[1920px] mx-auto">
        
        {/* Header */}
        <div className="soc-header">
          <div className="soc-header-row">
            <div className="soc-title">Security Operations Center</div>
            <span className={isLive ? 'live-badge-on' : 'live-badge-off'}>
              {isLive ? 'SYSTEM ONLINE' : 'LIVE VIEW PAUSED'}
            </span>
          </div>
          <div className="soc-header-row mt-1.5">
            <div className="soc-subtitle">
              C1NE.03 Hybrid NIDS Engine — Zeek / Suricata / AI Correlation Pipeline
            </div>
            <div className="soc-meta">
              Local Time: {now} | Range: {timeRangeLabel}
            </div>
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex flex-wrap items-center gap-4 mb-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="control-label">LIVE</span>
            <input 
              type="checkbox" 
              checked={isLive} 
              onChange={(e) => setIsLive(e.target.checked)}
              className="w-9 h-5 bg-zinc-800 rounded-full appearance-none cursor-pointer relative
                checked:bg-green-600 transition-colors
                before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full
                before:top-0.5 before:left-0.5 before:transition-transform
                checked:before:translate-x-4"
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <span className="control-label">AUTO BLOCK</span>
            <input 
              type="checkbox" 
              checked={autoBlock} 
              onChange={(e) => setAutoBlock(e.target.checked)}
              className="w-9 h-5 bg-zinc-800 rounded-full appearance-none cursor-pointer relative
                checked:bg-red-600 transition-colors
                before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full
                before:top-0.5 before:left-0.5 before:transition-transform
                checked:before:translate-x-4"
            />
          </label>

          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="filter-input"
          >
            {timeRanges.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <select 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value as 'all' | 'alerts')}
            className="filter-input"
          >
            <option value="all">Show All Events</option>
            <option value="alerts">Show ALERTS Only</option>
          </select>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <div className="metric-container">
            <div className="metric-label">Events Buffered</div>
            <div className="metric-value">{metrics.totalEvents.toLocaleString()}</div>
          </div>
          <div className="metric-container alert">
            <div className="metric-label">Critical Alerts</div>
            <div className="metric-value">{metrics.criticalAlerts}</div>
            <div className="metric-delta">{metrics.alertRate.toFixed(1)}%</div>
          </div>
          <div className="metric-container warning">
            <div className="metric-label">Suspicious Flows</div>
            <div className="metric-value">{metrics.suspicious}</div>
          </div>
          <div className="metric-container success">
            <div className="metric-label">False Positives</div>
            <div className="metric-value">{metrics.falsePositives}</div>
          </div>
          <div className="metric-container">
            <div className="metric-label">Unique Sources</div>
            <div className="metric-value">{metrics.uniqueSources.toLocaleString()}</div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Traffic Chart */}
          <div className="lg:col-span-2">
            <div className="soc-section-title">Traffic & Attacks</div>
            {chartData.length === 0 ? (
              <div className="text-zinc-500 text-sm py-8 text-center">No data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#d4d4d8', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} tickLine={false} />
                  <YAxis tick={{ fill: '#d4d4d8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: 4, color: '#e5e7eb', fontSize: 11 }} />
                  <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={1} fill="url(#trafficFill)" name="Traffic" />
                  <Line type="monotone" dataKey="alerts" stroke="#ef4444" strokeWidth={2} dot={false} name="Alerts" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Attack Types Pie */}
          <div>
            <div className="soc-section-title">Attack Types</div>
            {pieData.length === 0 ? (
              <div className="text-green-500 text-sm py-8 text-center">
                System is Safe. No active attacks.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={2} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: 4, color: '#e5e7eb', fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {pieData.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center text-xs mt-2">
                {pieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-zinc-300">{d.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Table + Top Sources */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          {/* Event Stream */}
          <div className="xl:col-span-3">
            <div className="soc-section-title">Security Event Stream</div>
            {isLive && (
              <p className="text-xs text-zinc-500 mb-2">
                LIVE đang bật - bảng sẽ auto refresh. Để inspect & block IP, hãy tắt LIVE.
              </p>
            )}

            {/* Filters */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <select 
                value={verdictFocus} 
                onChange={(e) => setVerdictFocus(e.target.value)}
                className="filter-input text-xs"
              >
                <option value="All">Verdict Filter: All</option>
                <option value="ALERT">ALERT</option>
                <option value="SUSPICIOUS">SUSPICIOUS</option>
                <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                <option value="BENIGN">BENIGN</option>
              </select>
              <input 
                type="text"
                placeholder="Filter by IP (SRC / DEST)"
                value={ipFilter}
                onChange={(e) => setIpFilter(e.target.value)}
                className="filter-input text-xs"
              />
              <input 
                type="text"
                placeholder="Filter by Signature"
                value={sigFilter}
                onChange={(e) => setSigFilter(e.target.value)}
                className="filter-input text-xs"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 whitespace-nowrap">Min Conf:</span>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-zinc-800 rounded appearance-none cursor-pointer"
                />
                <span className="text-xs text-zinc-400 font-mono w-8">{minConfidence.toFixed(2)}</span>
              </div>
            </div>

            {/* Table */}
            <div className="data-table overflow-auto max-h-[400px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-[#09090b] z-10">
                  <tr>
                    {!isLive && <th className="w-12">Inspect</th>}
                    <th>Time</th>
                    <th>Verdict</th>
                    <th>Source</th>
                    <th>Dest</th>
                    <th>Port</th>
                    <th>Signature</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEvents.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-4 text-zinc-500">No events match current filters.</td></tr>
                  ) : (
                    sortedEvents.map(event => (
                      <tr 
                        key={event.id} 
                        className={`cursor-pointer ${selectedEvent?.id === event.id ? 'selected' : ''}`}
                        onClick={() => !isLive && setSelectedEvent(event)}
                      >
                        {!isLive && (
                          <td className="text-center">
                            <input 
                              type="checkbox" 
                              checked={selectedEvent?.id === event.id}
                              onChange={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                              className="w-4 h-4 accent-blue-500"
                            />
                          </td>
                        )}
                        <td className="text-zinc-400">{event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                        <td className={`verdict-${event.verdict.toLowerCase().replace('_', '-')}`}>{event.verdict}</td>
                        <td className="text-blue-400">{event.src_ip}</td>
                        <td>{event.dst_ip}</td>
                        <td>{event.dst_port || '-'}</td>
                        <td>{event.attack_type}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="confidence-bar">
                              <div className="confidence-fill" style={{ width: `${event.confidence * 100}%` }} />
                            </div>
                            <span className="text-xs text-zinc-400">{event.confidence.toFixed(2)}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Sources */}
          <div>
            <div className="soc-section-title">Top Threat Sources</div>
            {barData.length === 0 ? (
              <div className="text-zinc-500 text-sm py-8 text-center">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={barData} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: '#d4d4d8', fontSize: 10 }} axisLine={{ stroke: '#18181b' }} tickLine={false} />
                  <YAxis type="category" dataKey="ip" tick={{ fill: '#e5e7eb', fontSize: 11, fontFamily: 'Roboto Mono, monospace' }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: 4, color: '#e5e7eb', fontSize: 11 }} />
                  <Bar dataKey="count" fill="#f97316" radius={[0, 2, 2, 0]} label={{ position: 'right', fill: '#a1a1aa', fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Inspector Panel */}
        {!isLive && selectedEvent && (
          <div className="inspector-panel mt-5">
            <div className="inspector-grid">
              <div>
                <div className="inspector-label">Timestamp</div>
                <div className="inspector-value inspector-value-strong">{selectedEvent.timestamp.toLocaleString()}</div>
              </div>
              <div>
                <div className="inspector-label">Verdict</div>
                <div className={`inspector-value inspector-value-strong text-xl inspector-verdict-${selectedEvent.verdict.toLowerCase()}`}>
                  {selectedEvent.verdict}
                </div>
              </div>
              <div>
                <div className="inspector-label">Signature</div>
                <div className="inspector-value inspector-value-strong">{selectedEvent.attack_type}</div>
              </div>
              <div>
                <div className="inspector-label">Engine</div>
                <div className="inspector-value">{selectedEvent.source_engine}</div>
              </div>
              <div>
                <div className="inspector-label">Source</div>
                <div className="inspector-value" style={{ color: '#3b82f6' }}>{selectedEvent.src_ip}</div>
              </div>
              <div>
                <div className="inspector-label">Destination</div>
                <div className="inspector-value">{selectedEvent.dst_ip}:{selectedEvent.dst_port || '-'}</div>
              </div>
              <div>
                <div className="inspector-label">Protocol</div>
                <div className="inspector-value">{selectedEvent.protocol}</div>
              </div>
              <div>
                <div className="inspector-label">Community ID</div>
                <div className="inspector-value text-xs">{selectedEvent.community_id}</div>
              </div>
              <div>
                <div className="inspector-label">Confidence</div>
                <div className="inspector-value">{selectedEvent.confidence.toFixed(2)}</div>
              </div>
              <div>
                <div className="inspector-label">Auto-Block State</div>
                <div className="inspector-value">{selectedEvent.action_taken || '-'}</div>
              </div>
            </div>
            
            <div className="mt-4">
              <div className="inspector-label">Raw Payload</div>
              <pre className="bg-black p-3 rounded text-xs font-mono text-zinc-400 overflow-x-auto mt-1 border border-zinc-800">
                {selectedEvent.raw_log || '{}'}
              </pre>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">🧠 AI Playbook for this flow</div>
                <button className="w-full bg-[#020617] border border-zinc-800 text-zinc-200 hover:border-blue-500 text-xs uppercase tracking-wider py-2 px-4 rounded transition-colors">
                  Ask MegaLLM about this flow only
                </button>
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">🚫 Active Defense: Block Source IP on pfSense (Manual)</div>
                <button className="w-full bg-red-600/20 border border-red-600 text-red-400 hover:bg-red-600/30 text-xs uppercase tracking-wider py-2 px-4 rounded transition-colors">
                  Block IP {selectedEvent.src_ip} on pfSense
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="soc-footer mt-6 pt-4 border-t border-zinc-800">
          V22 FINAL BUILD — SOC DASHBOARD POWERED BY PYTHON + STREAMLIT + MegaLLM
        </div>
      </div>
    </div>
  );
};

export default SOCDashboard;
