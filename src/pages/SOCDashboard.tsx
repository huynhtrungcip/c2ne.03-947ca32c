import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSOCData } from '@/hooks/useSOCData';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SOCEvent } from '@/types/soc';
import { Area, AreaChart, XAxis, YAxis, ResponsiveContainer, Line, LineChart as RLineChart, ComposedChart, PieChart, Pie, Cell, BarChart, Bar, Tooltip, CartesianGrid } from 'recharts';
import { Settings, Wifi, WifiOff, Brain, Loader2, Sliders, Square, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SettingsModal from '@/components/soc/SettingsModal';
import VirtualizedEventTable from '@/components/soc/VirtualizedEventTable';
import { SystemResourcesPanel } from '@/components/soc/SystemResourcesPanel';
import { EventsRatePanel } from '@/components/soc/EventsRatePanel';
import { VerdictDistributionPanel } from '@/components/soc/VerdictDistributionPanel';
import { TopBlockedIPsPanel } from '@/components/soc/TopBlockedIPsPanel';
import { MetricStatCard, MetricKind } from '@/components/soc/MetricStatCard';
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ConfirmDialog, useConfirmDialog } from '@/components/soc/ConfirmDialog';
import { AISettingsModal } from '@/components/soc/AISettingsModal';
import { AIToolCallCard } from '@/components/soc/AIToolCallCard';
import {
  streamChat,
  getActiveProvider,
  loadProviders,
  type AIProviderConfig,
  type ChatMessage as AIMessage,
} from '@/lib/aiProviders';
import { SOC_TOOLS, executeTool, TOOLS_REQUIRING_CONFIRMATION } from '@/lib/socTools';

type Theme = 'light' | 'dark';
type TabType = 'overview' | 'events' | 'threats' | 'reports';

// ===== Module-level helpers for Reports tab (avoid re-creating components on every render) =====
const DeltaBadge = ({ value }: { value: number }) => {
  const positive = value >= 0;
  const color = positive ? 'text-[hsl(var(--soc-alert))]' : 'text-[hsl(var(--soc-success))]';
  const arrow = positive ? '▲' : '▼';
  return <span className={`text-[10px] font-mono ${color}`}>{arrow} {Math.abs(value).toFixed(1)}%</span>;
};

const Sparkline = ({ data, color }: { data: { i: number; v: number }[]; color: string }) => (
  <ResponsiveContainer width="100%" height={28}>
    <RLineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </RLineChart>
  </ResponsiveContainer>
);

// Legacy MegaLLM constants — only used by the inline "analyze.flow" panel (Event Inspector)
const MEGALLM_API_KEY = 'sk-mega-7bd02bf1c5720f9bde518db892d4da8ef94671adcca28dd19299b1c2d8d4e753';
const MEGALLM_BASE_URL = 'https://ai.megallm.io/v1';
const DEFAULT_MODEL = 'deepseek-r1-distill-llama-70b';

// ===== Fallback MegaLLM (legacy) — used only when no provider configured =====
const FALLBACK_PROVIDER: AIProviderConfig = {
  id: 'fallback-megallm',
  kind: 'megallm',
  label: 'MegaLLM (default)',
  baseUrl: 'https://ai.megallm.io/v1',
  apiKey: 'sk-mega-7bd02bf1c5720f9bde518db892d4da8ef94671adcca28dd19299b1c2d8d4e753',
  model: 'deepseek-r1-distill-llama-70b',
  supportsTools: true,
};

const SOC_SYSTEM_PROMPT = `You are an AI SOC analyst (Tier 2) on a hybrid NIDS stack with Zeek + Suricata + AI correlation, developed by C1NE.03 — K28 Cybersecurity, Duy Tan University.

You receive:
1) A natural language question from the analyst.
2) A LIGHTWEIGHT SOC snapshot (only counts + top sources — NO raw events).
3) Tool results when you call functions.

=== TOOL ROUTING (CRITICAL) ===
The snapshot is intentionally minimal to save tokens. You MUST call tools to fetch real data:

- Question about a SPECIFIC IP (e.g. "what did 1.2.3.4 do?", "analyze IP X") →
  → ALWAYS call \`analyze_ip(ip, since_minutes)\` FIRST. NEVER guess from the snapshot.

- Question about top attackers / ranking →
  → call \`get_top_sources(limit, verdict_filter, since_minutes)\`.

- Question needing aggregated stats (overview, summary) →
  → call \`summarize_range(since_minutes)\`.

- Question filtering events (by verdict, port, attack type, src_ip, dst_ip) →
  → call \`query_events(filters)\`.

- Decision to block a malicious IP →
  → call \`block_ip(ip, reason)\`. User WILL be asked to confirm.

You MAY chain tools (e.g. summarize_range → analyze_ip on top attacker → block_ip).

=== ANALYSIS RULES ===
- Correlate patterns: DDoS, PortScan, BruteForce, WebAttack, C2, Exfiltration, Recon.
- Map to MITRE ATT&CK techniques when relevant.
- NEVER invent log entries. If data missing → call a tool.
- Final answer: concise Vietnamese, technical terms in English, markdown tables/bullets.
- For each finding propose: BLOCK / INVESTIGATE / IGNORE with reasoning.`;

interface ChatTurn {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_call_id?: string;
  tool_calls?: AIMessage['tool_calls'];
  // UI-only:
  toolDisplay?: Array<{
    id: string;
    name: string;
    args: string;
    status: 'pending' | 'running' | 'success' | 'error' | 'denied';
    result?: unknown;
    error?: string;
  }>;
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  events?: SOCEvent[];
  selectedEvent?: SOCEvent | null;
  apiUrl?: string;
}

const AIChatPanel = ({ isOpen, onClose, events = [], selectedEvent = null, apiUrl = '' }: AIChatPanelProps) => {
  const [message, setMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AIProviderConfig | null>(() => getActiveProvider() || FALLBACK_PROVIDER);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingTool, setPendingTool] = useState<{ name: string; args: string; resolve: (ok: boolean) => void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      role: 'assistant',
      content: `Hello, I am the **SOC AI Assistant** of the AI-SOC Dashboard, developed by the **C1NE.03 team — Cybersecurity K28, Duy Tan University**.

- I focus on **security event analysis** — logs, alerts and traffic in the SOC.
- Can **call real tools**: \`query_events\`, \`get_top_sources\`, \`summarize_range\`, \`block_ip\` (requires confirmation).
- Ask in **English** for best results.`,
    },
  ]);

  // Reload provider when settings close
  const refreshProvider = useCallback(() => {
    setActiveProvider(getActiveProvider() || (loadProviders()[0] ?? FALLBACK_PROVIDER));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, isStreaming]);

  // Build LIGHTWEIGHT snapshot — counts + top sources only.
  // Raw events are fetched on-demand via tools (analyze_ip, query_events, ...).
  const buildSnapshot = useCallback(() => {
    const evs = eventsRef.current;
    if (evs.length === 0) return JSON.stringify({ status: 'No SOC events loaded.' });

    const now = Date.now();
    const cutoff = now - 60 * 60_000;
    const last1h = evs.filter((e) => e.timestamp.getTime() >= cutoff);

    const counts = { ALERT: 0, SUSPICIOUS: 0, BENIGN: 0, FALSE_POSITIVE: 0 } as Record<string, number>;
    const ipMap: Record<string, { c: number; a: number; s: number }> = {};
    for (const e of last1h) {
      counts[e.verdict] = (counts[e.verdict] || 0) + 1;
      const r = (ipMap[e.src_ip] ||= { c: 0, a: 0, s: 0 });
      r.c++;
      if (e.verdict === 'ALERT') r.a++;
      if (e.verdict === 'SUSPICIOUS') r.s++;
    }
    const topSources = Object.entries(ipMap)
      .sort((a, b) => b[1].a * 3 + b[1].s - (a[1].a * 3 + a[1].s))
      .slice(0, 8)
      .map(([ip, s]) => ({ ip, total: s.c, alert: s.a, susp: s.s }));

    return JSON.stringify({
      window_minutes: 60,
      total_events_loaded: evs.length,
      events_in_window: last1h.length,
      verdict_counts: counts,
      top_sources_hint: topSources,
      selected_event: selectedEvent
        ? {
            time: selectedEvent.timestamp.toISOString(),
            verdict: selectedEvent.verdict,
            src: selectedEvent.src_ip,
            dst: selectedEvent.dst_ip,
            sig: selectedEvent.attack_type,
          }
        : null,
      hint: 'This snapshot has NO raw events. Call analyze_ip / query_events / summarize_range to get details.',
    });
  }, [selectedEvent]);

  // Block IP executor (used by tool) — synced with pfSense alias AI_Blocked_IP
  const performBlockIP = useCallback(
    async (ip: string, reason: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        if (apiUrl) {
          const aiEngineUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
          const resp = await fetch(`${aiEngineUrl}/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, reason }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!resp.ok) return { ok: false, error: `pfSense API HTTP ${resp.status}` };
          const data = await resp.json().catch(() => ({}));
          if (data.success === false) return { ok: false, error: data.message || 'pfSense returned failure' };
        }
        const cur = JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]');
        if (!cur.includes(ip)) {
          cur.push(ip);
          localStorage.setItem('soc-blocked-ips', JSON.stringify(cur));
          window.dispatchEvent(new Event('soc-blocked-ips-changed'));
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [apiUrl]
  );

  // Confirm dialog for sensitive tools (returns user decision)
  const requestConfirmation = (name: string, argsJson: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingTool({ name, args: argsJson, resolve });
    });
  };

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const runConversation = useCallback(
    async (userText: string) => {
      const provider = activeProvider || FALLBACK_PROVIDER;
      const useTools = !!provider.supportsTools;

      // Append user turn
      const newUserTurn: ChatTurn = { role: 'user', content: userText };
      setTurns((prev) => [...prev, newUserTurn]);

      // Build initial messages for API
      const baseMessages: AIMessage[] = [
        { role: 'system', content: `${SOC_SYSTEM_PROMPT}\n\n=== SOC SNAPSHOT (JSON) ===\n${buildSnapshot()}` },
        ...turns
          .filter((t) => t.role !== 'system')
          .map<AIMessage>((t) => ({
            role: t.role,
            content: t.content,
            tool_call_id: t.tool_call_id,
            tool_calls: t.tool_calls,
          })),
        { role: 'user', content: userText },
      ];

      setIsStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Loop: stream → if tool_calls → execute → push tool results → stream again
      let messages = baseMessages;
      let safety = 5;
      try {
        while (safety-- > 0) {
          // Insert empty assistant turn to be filled progressively
          let assistantIdx = -1;
          setTurns((prev) => {
            assistantIdx = prev.length;
            return [...prev, { role: 'assistant', content: '' }];
          });

          const result = await streamChat({
            provider,
            messages,
            tools: useTools ? SOC_TOOLS : undefined,
            signal: ctrl.signal,
            onDelta: (chunk) => {
              setTurns((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + chunk };
                }
                return next;
              });
            },
          });

          // No tool calls → done
          if (!result.toolCalls || result.toolCalls.length === 0) {
            break;
          }

          // Attach tool_calls to the assistant turn
          const assistantMsg: AIMessage = {
            role: 'assistant',
            content: result.content,
            tool_calls: result.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                tool_calls: assistantMsg.tool_calls,
                toolDisplay: result.toolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  args: tc.arguments,
                  status: 'running',
                })),
              };
            }
            return next;
          });

          // Execute each tool sequentially
          const toolMessages: AIMessage[] = [];
          for (const tc of result.toolCalls) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.arguments || '{}');
            } catch {
              /* keep empty */
            }

            // Confirmation gate
            if (TOOLS_REQUIRING_CONFIRMATION.has(tc.name)) {
              const ok = await requestConfirmation(tc.name, tc.arguments);
              if (!ok) {
                setTurns((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.toolDisplay) {
                    last.toolDisplay = last.toolDisplay.map((d) =>
                      d.id === tc.id ? { ...d, status: 'denied', error: 'User denied execution' } : d
                    );
                  }
                  return next;
                });
                toolMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: JSON.stringify({ ok: false, error: 'User denied execution' }),
                });
                continue;
              }
            }

            const exec = await executeTool(tc.name, parsedArgs, {
              events: eventsRef.current,
              blockIp: performBlockIP,
            });

            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.toolDisplay) {
                last.toolDisplay = last.toolDisplay.map((d) => {
                  if (d.id !== tc.id) return d;
                  if (!exec.ok) return { ...d, status: 'error' as const, error: exec.error };
                  return { ...d, status: 'success' as const, result: exec.data };
                });
              }
              return next;
            });

            toolMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(!exec.ok ? { error: exec.error } : exec.data),
            });
          }

          // Append for next round
          messages = [...messages, assistantMsg, ...toolMessages];
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + '\n\n_⏹ Stopped by user._' };
            }
            return next;
          });
        } else {
          setTurns((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `**[Error]** ${e instanceof Error ? e.message : String(e)}\n\nCheck:\n1. Provider is active (${provider.label} · ${provider.model})\n2. API key is valid\n3. CORS / network\n4. Click ⚙️ to change provider.`,
            },
          ]);
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [activeProvider, buildSnapshot, turns, performBlockIP]
  );

  if (!isOpen) return null;

  const handleSend = () => {
    const t = message.trim();
    if (!t || isStreaming) return;
    setMessage('');
    void runConversation(t);
  };

  const quickPrompts = [
    { label: '🔥 Top threats 1h', text: 'Get top 10 attacking IPs in the last 1h, summarize and suggest actions for each.' },
    { label: '📊 Summary 1h', text: 'Summarize the SOC status over the last 1h: alerts, suspicious events, top attack types, unique IPs.' },
    { label: '🔬 Profile top IP', text: 'Get the top 1 attacker IP, then use analyze_ip to build a detailed profile: timeline, targeted ports, attack types, destinations. Assess risk and recommend actions.' },
    { label: '🚫 Block đề xuất', text: 'Analyze and recommend IPs to block immediately. For the clearest case, call block_ip (confirmation required).' },
  ];

  return (
    <>
      <div className="fixed right-4 bottom-4 w-[460px] bg-card border border-border rounded-xl shadow-2xl shadow-black/50 z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300 backdrop-blur-xl">
        {/* Header */}
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 via-card to-card">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 border border-primary/30 shrink-0">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-card animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-foreground uppercase tracking-wider leading-tight">SOC AI Assistant</div>
              <div className="text-[9px] text-muted-foreground font-mono truncate">
                {activeProvider ? `${activeProvider.label} · ${activeProvider.model}` : 'No provider'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(true)}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
              title="AI Provider Settings"
            >
              <Sliders className="h-3 w-3" />
            </button>
            <button
              onClick={onClose}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <span className="text-base leading-none">×</span>
            </button>
          </div>
        </div>

        {/* No-provider warning */}
        {!getActiveProvider() && (
          <div className="px-3 py-1.5 bg-warning/10 border-b border-warning/30 text-[10px] text-warning-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
            <span>Using default MegaLLM. Click <Sliders className="inline h-2.5 w-2.5" /> to configure your own Grok / Gemini / Ollama.</span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="h-[400px] overflow-y-auto px-3 py-3 space-y-3 bg-background/40 scroll-smooth">
          {turns.map((msg, i) => {
            if (msg.role === 'tool') return null; // Hide raw tool results — already shown in toolDisplay
            const isUser = msg.role === 'user';
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                {!isUser && (
                  <div className="h-6 w-6 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                    <Brain className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div className={`max-w-[82%] px-3 py-2 rounded-lg text-[11px] leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap font-medium'
                    : 'bg-muted/60 border border-border/60 text-foreground/90 rounded-bl-sm'
                }`}>
                  {isUser ? (
                    msg.content
                  ) : (
                    <>
                      {msg.toolDisplay?.map((td) => (
                        <AIToolCallCard key={td.id} {...td} />
                      ))}
                      {msg.content && (
                        <div className="prose prose-invert prose-xs max-w-none [&_table]:w-full [&_table]:text-[10px] [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-muted-foreground [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:text-foreground [&_strong]:font-semibold [&_h1]:text-sm [&_h1]:font-bold [&_h2]:text-xs [&_h2]:font-bold [&_h3]:text-[11px] [&_h3]:font-semibold [&_code]:bg-background [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-primary [&_code]:text-[10px] [&_code]:border [&_code]:border-border/60 [&_pre]:bg-background [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          {isStreaming && i === turns.length - 1 && (
                            <span className="inline-block w-1.5 h-3 bg-primary/70 ml-0.5 align-middle animate-pulse" />
                          )}
                        </div>
                      )}
                      {!msg.content && isStreaming && i === turns.length - 1 && !msg.toolDisplay?.length && (
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick prompts */}
        {turns.length <= 1 && !isStreaming && (
          <div className="px-3 pt-2 pb-1 border-t border-border/60 bg-card/50">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-0.5">⚡ Quick prompts</div>
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(p.text)}
                  className="px-2 py-1 text-[10px] bg-muted/40 hover:bg-primary/15 border border-border/60 hover:border-primary/40 rounded-md text-muted-foreground hover:text-foreground transition-all duration-150 hover:scale-[1.02] active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-border bg-card">
          <div className="flex gap-2 items-center bg-background border border-border rounded-lg px-2 py-1 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={isStreaming ? 'AI đang trả lời...' : 'Hỏi về logs, alerts, correlation...'}
              disabled={isStreaming}
              className="flex-1 h-7 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            />
            {isStreaming ? (
              <button
                onClick={stopStream}
                className="px-3 h-7 text-[10px] font-semibold bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-all flex items-center gap-1"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!message.trim()}
                className="px-3 h-7 text-[10px] font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 flex items-center gap-1"
              >
                <span>Gửi</span>
                <span className="text-[8px] opacity-60">↵</span>
              </button>
            )}
          </div>
          <div className="text-[9px] text-muted-foreground/60 mt-1.5 px-1 font-mono flex items-center justify-between">
            <span>{events.length > 0 ? `📡 Context: ${Math.min(events.length, 50)} events` : '⚠️ No events context'}</span>
            <span>{activeProvider?.supportsTools ? '🔧 Tools enabled' : '🔧 Tools off'}</span>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AISettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onChange={refreshProvider}
      />

      {/* Tool confirmation dialog */}
      {pendingTool && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-lg shadow-2xl max-w-md w-full p-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-9 w-9 rounded-md bg-destructive/15 border border-destructive/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground">AI yêu cầu thực thi tool</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  AI muốn gọi <code className="bg-muted px-1 rounded text-foreground">{pendingTool.name}</code>. Hành động này có tác động thật lên hệ thống.
                </p>
              </div>
            </div>
            <pre className="bg-background border border-border rounded p-2 text-[10px] font-mono text-foreground/80 max-h-40 overflow-auto mb-3">
              {(() => { try { return JSON.stringify(JSON.parse(pendingTool.args), null, 2); } catch { return pendingTool.args; } })()}
            </pre>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { pendingTool.resolve(false); setPendingTool(null); }}
                className="px-3 h-8 text-[11px] font-medium border border-border text-foreground rounded-md hover:bg-muted"
              >
                Từ chối
              </button>
              <button
                onClick={() => { pendingTool.resolve(true); setPendingTool(null); }}
                className="px-3 h-8 text-[11px] font-semibold bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
              >
                Cho phép thực thi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const SOCDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  // Realtime streaming is always-on (SIEM-style). No pause toggle.
  const isLive = true;
  const [autoBlock, setAutoBlock] = useState(false);
  const [timeRange, setTimeRange] = useState('all');
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all');
  const [selectedEvent, setSelectedEvent] = useState<SOCEvent | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  // Auto-hide header: scroll down to hide, scroll up or move mouse near top to show
  useEffect(() => {
    const SCROLL_DELTA = 6;
    const TOP_ZONE = 60;
    const handleScroll = () => {
      const y = window.scrollY;
      const diff = y - lastScrollYRef.current;
      if (y < 10) setHeaderVisible(true);
      else if (Math.abs(diff) > SCROLL_DELTA) setHeaderVisible(diff < 0);
      lastScrollYRef.current = y;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < TOP_ZONE) setHeaderVisible(true);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  const [blockedIPsCount, setBlockedIPsCount] = useState<number>(() => {
    try { return (JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]') as string[]).length; } catch { return 0; }
  });
  useEffect(() => {
    const update = () => {
      try { setBlockedIPsCount((JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]') as string[]).length); } catch { setBlockedIPsCount(0); }
    };
    window.addEventListener('storage', update);
    const interval = setInterval(update, 2000);
    return () => { window.removeEventListener('storage', update); clearInterval(interval); };
  }, []);
  const [showAnalysisOptions, setShowAnalysisOptions] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisModel, setAnalysisModel] = useState<string>(DEFAULT_MODEL);
  const [blockingIP, setBlockingIP] = useState(false);
  const [pieHoverIdx, setPieHoverIdx] = useState<number | null>(null);
  const [blockResult, setBlockResult] = useState<{ success: boolean; message: string } | null>(null);
  const { dialogState, showConfirm, closeConfirm } = useConfirmDialog();
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

  // NIDS live source is always enabled — there is no longer a user-facing toggle.
  const { events, metrics, topSources, attackTypeData, trafficData, timeRanges, wsConnected, setWsConnected, addEvent } = useSOCData(
    timeRange,
    viewMode,
    isLive,
    { verdictFocus, ipFilter, sigFilter, minConfidence },
    { useWebSocket: useWsRealtime && isLive && !!wsUrl }
  );

  // WebSocket connection for real-time events.
  const handleWebSocketEvent = useCallback((event: SOCEvent) => {
    if (isLive) addEvent(event);
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
    <div className="border border-border bg-card p-3 mb-4">
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
            className="w-20 h-1 bg-border rounded appearance-none cursor-pointer accent-muted-foreground"
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

      // Use the SAME provider/model the user picked for the AI Assistant.
      // Fall back to legacy MegaLLM only if nothing is configured.
      const provider = getActiveProvider() ?? FALLBACK_PROVIDER;
      setAnalysisModel(provider.model);

      try {
        // ===== Build the payload =====
        // analyzeAll → build a STRUCTURED IP profile (same shape as analyze_ip tool)
        // single    → send the single event with a few correlated flows from the same src_ip
        let payloadLabel: string;
        let payloadJson: string;

        if (analyzeAll) {
          const ip = selectedEvent.src_ip;
          const list = events.filter((e) => e.src_ip === ip || e.dst_ip === ip);
          const asSrc = list.filter((e) => e.src_ip === ip).length;
          const asDst = list.filter((e) => e.dst_ip === ip).length;
          const byVerdict: Record<string, number> = {};
          const byProto: Record<string, number> = {};
          const portMap: Record<number, number> = {};
          const dstMap: Record<string, number> = {};
          const attackMap: Record<string, number> = {};
          const engineMap: Record<string, number> = {};
          let firstTs = Infinity;
          let lastTs = 0;
          for (const e of list) {
            byVerdict[e.verdict] = (byVerdict[e.verdict] || 0) + 1;
            if (e.protocol) byProto[e.protocol] = (byProto[e.protocol] || 0) + 1;
            if (e.dst_port) portMap[e.dst_port] = (portMap[e.dst_port] || 0) + 1;
            if (e.src_ip === ip && e.dst_ip) dstMap[e.dst_ip] = (dstMap[e.dst_ip] || 0) + 1;
            if (e.attack_type) attackMap[e.attack_type] = (attackMap[e.attack_type] || 0) + 1;
            if (e.source_engine) engineMap[e.source_engine] = (engineMap[e.source_engine] || 0) + 1;
            const ts = e.timestamp.getTime();
            if (ts < firstTs) firstTs = ts;
            if (ts > lastTs) lastTs = ts;
          }
          const topPorts = Object.entries(portMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, c]) => ({ port: Number(p), count: c }));
          const topDsts = Object.entries(dstMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, c]) => ({ dst: d, count: c }));
          const topAttacks = Object.entries(attackMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => ({ type, count }));
          const sampleAlerts = list
            .filter((e) => e.verdict === 'ALERT')
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 8)
            .map((e) => ({
              time: e.timestamp.toISOString(),
              src: e.src_ip,
              dst: e.dst_ip,
              port: e.dst_port,
              proto: e.protocol,
              sig: e.attack_type,
              conf: Number(e.confidence?.toFixed?.(2) ?? e.confidence),
              engine: e.source_engine,
            }));
          const profile = {
            ip,
            window: 'all loaded events',
            first_seen: list.length ? new Date(firstTs).toISOString() : null,
            last_seen: list.length ? new Date(lastTs).toISOString() : null,
            total_events: list.length,
            role: { as_source: asSrc, as_destination: asDst },
            by_verdict: byVerdict,
            by_protocol: byProto,
            by_engine: engineMap,
            top_targeted_ports: topPorts,
            top_destinations: topDsts,
            top_attack_types: topAttacks,
            sample_alerts: sampleAlerts,
          };
          payloadLabel = `IP behavioral profile for ${ip}`;
          payloadJson = JSON.stringify(profile, null, 2);
        } else {
          const correlated = events
            .filter((e) => e.src_ip === selectedEvent.src_ip && e.id !== selectedEvent.id)
            .slice(0, 10)
            .map((e) => ({
              time: e.timestamp.toISOString(),
              dst: e.dst_ip,
              port: e.dst_port,
              proto: e.protocol,
              sig: e.attack_type,
              verdict: e.verdict,
              conf: e.confidence,
            }));
          payloadLabel = 'Single flow + correlated context';
          payloadJson = JSON.stringify({ event: selectedEvent, correlated_from_same_src: correlated }, null, 2);
        }

        const systemPrompt = analyzeAll
          ? `You are a SENIOR SOC Tier-2 analyst with offensive security background (red-team / hacker mindset). You receive a STRUCTURED behavioral profile of one IP (counts, top ports, top destinations, attack types, sample alerts) — NOT raw logs.

Reason like an attacker reconstructing their own kill-chain, then explain it as a defender.

Output STRICT GitHub-flavored markdown in this EXACT structure:

## Verdict
**[CRITICAL | HIGH | MEDIUM | LOW]** — 1 sentence: actor intent + confidence.

## Attacker Profile
- **Role observed:** source / destination / both (with counts)
- **Active window:** first_seen → last_seen
- **Likely actor type:** automated scanner | botnet node | targeted human operator | benign noise — justify briefly

## Kill Chain Reconstruction
Map observed activity to MITRE ATT&CK phases. Only include phases backed by data.

| Phase | Technique (ID) | Evidence from profile |
|-------|----------------|------------------------|
| Recon | T1595 ... | top_targeted_ports shows ... |
| Initial Access / Exec | Txxxx | ... |
| Impact | Txxxx | ... |

## Indicators of Compromise (IoC)
- **Targeted ports:** list top 3
- **Targeted hosts:** list top 3 destinations
- **Top signatures:** list top 3 attack_types with counts
- **Engine consensus:** which engines (suricata/zeek) flagged it

## Hacker-Grade Hypothesis
2–4 short bullets describing what the attacker is MOST LIKELY trying to achieve next, based on the pattern (e.g. "ports 22+3389 hammered → credential brute force pivoting", "low-rate ICMP + SYN to /24 → stealth recon before targeted exploit").

## Recommended Actions

| Priority | Action | Reason |
|----------|--------|--------|
| P0 | Block on pfSense alias AI_Blocked_IP | ... |
| P1 | Hunt for ... in Zeek conn.log | ... |
| P2 | Tune Suricata rule sid=... | ... |

STRICT RULES:
- Tables ≤4 columns, ≤5 rows, NO multi-line cells, NO blank rows.
- Vietnamese prose, English technical terms (ATT&CK IDs, port numbers, signatures).
- NEVER invent ports/IPs/signatures not present in the JSON. If a phase has no evidence, OMIT the row.
- Be decisive. No hedging like "có thể có thể".`
          : `You are a SENIOR SOC Tier-2 analyst with red-team background. Analyze ONE flow plus its correlated context from the same source IP.

Output STRICT GitHub-flavored markdown:

## Verdict
**[CRITICAL | HIGH | MEDIUM | LOW]** — 1 sentence why.

## Attack Classification
- **Type:** ...
- **MITRE ATT&CK:** Txxxx — name
- **Confidence basis:** signature + correlation + engine

## Key Indicators
- 3 short bullets, each tied to a field in the JSON.

## Recommended Actions

| # | Action | Reason |
|---|--------|--------|
| 1 | ... | ... |
| 2 | ... | ... |

Rules:
- Tables ≤4 columns, ≤4 rows, no multi-line cells.
- Vietnamese prose, English technical terms.
- Never invent fields. If correlated_from_same_src is empty, say so explicitly.`;

        const prompt = `${payloadLabel}:\n\n\`\`\`json\n${payloadJson}\n\`\`\``;

        // Stream via the same multi-provider client used by the Assistant.
        let acc = '';
        await streamChat({
          provider,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          onDelta: (chunk) => {
            acc += chunk;
            setAnalysisResult(acc);
          },
        });

        if (!acc.trim()) {
          setAnalysisResult('Không thể phân tích (model trả về rỗng).');
        }
      } catch (error) {
        console.error('Analysis error:', error);
        setAnalysisResult(`**Lỗi phân tích:** ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setAnalysisLoading(false);
      }
    };
    
    const performBlockIP = async () => {
      if (!selectedEvent?.src_ip) return;
      setBlockingIP(true);
      setBlockResult(null);
      
      try {
        // Try to call AI-Engine API if available (đồng bộ pfSense alias AI_Blocked_IP)
        if (apiUrl) {
          const aiEngineUrl = apiUrl.replace(':3001', ':8000').replace(':3002', ':8000');
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
        
        // Save to local storage and notify
        const currentBlocked = JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]');
        if (!currentBlocked.includes(selectedEvent.src_ip)) {
          currentBlocked.push(selectedEvent.src_ip);
          localStorage.setItem('soc-blocked-ips', JSON.stringify(currentBlocked));
          window.dispatchEvent(new Event('soc-blocked-ips-changed'));
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

    const handleBlockIP = () => {
      if (!selectedEvent?.src_ip) return;
      showConfirm(
        'block_ip',
        performBlockIP,
        selectedEvent.src_ip,
        `Verdict: ${selectedEvent.verdict} • ${selectedEvent.attack_type || 'Unknown'} • ${selectedEvent.dst_ip ? `→ ${selectedEvent.dst_ip}` : ''}`
      );
    };
    
    return (
      <div className="mt-4 bg-card border rounded-md shadow-lg" style={{ borderColor: verdictBorderColor }}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30 rounded-t-md">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-[0.12em]">Event Inspector</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
              selectedEvent.verdict === 'ALERT' ? 'bg-[hsl(var(--soc-alert)/0.15)] text-[hsl(var(--soc-alert))] border border-[hsl(var(--soc-alert)/0.3)]' :
              selectedEvent.verdict === 'SUSPICIOUS' ? 'bg-[hsl(var(--soc-warning)/0.15)] text-[hsl(var(--soc-warning))] border border-[hsl(var(--soc-warning)/0.3)]' :
              'bg-[hsl(var(--soc-success)/0.15)] text-[hsl(var(--soc-success))] border border-[hsl(var(--soc-success)/0.3)]'
            }`}>
              {selectedEvent.verdict}
            </span>
          </div>
          <button 
            onClick={() => setSelectedEvent(null)}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div className="p-5 grid grid-cols-4 gap-x-6 gap-y-4">
          {[
            { label: 'Timestamp', value: selectedEvent.timestamp.toLocaleString(), className: 'text-foreground' },
            { label: 'Signature', value: selectedEvent.attack_type, className: 'font-semibold text-[hsl(var(--soc-warning))]' },
            { label: 'Engine', value: selectedEvent.source_engine, className: 'text-foreground' },
            { label: 'Confidence', value: `${(selectedEvent.confidence * 100).toFixed(0)}%`, className: 'text-foreground' },
            { label: 'Source IP', value: selectedEvent.src_ip, className: 'text-[hsl(var(--chart-1))] font-mono' },
            { label: 'Destination', value: `${selectedEvent.dst_ip}:${selectedEvent.dst_port || '-'}`, className: 'font-mono text-foreground' },
            { label: 'Protocol', value: selectedEvent.protocol, className: 'text-foreground' },
            { label: 'Community ID', value: selectedEvent.community_id, className: 'font-mono text-[10px] text-foreground' },
          ].map((field, i) => (
            <div key={i}>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{field.label}</div>
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
                <pre className="text-[11px] font-mono leading-relaxed text-foreground/90 bg-muted/30 p-3 rounded-md border border-border overflow-auto max-h-72 [scrollbar-width:thin]">
                  {pretty}
                </pre>
              </>
            );
          })()}
        </div>
        
        {/* Block Result Feedback — SIEM log-line style */}
        {blockResult && (
          <div className={`mx-5 mb-4 border-l-2 ${
            blockResult.success
              ? 'border-[hsl(var(--soc-success))] bg-[hsl(var(--soc-success)/0.06)]'
              : 'border-[hsl(var(--soc-alert))] bg-[hsl(var(--soc-alert)/0.06)]'
          } rounded-sm`}>
            <div className="flex items-center justify-between px-3 py-2 gap-3">
              <div className="flex items-baseline gap-3 min-w-0 flex-1">
                <span className={`text-[10px] font-mono font-semibold uppercase tracking-[0.14em] shrink-0 ${
                  blockResult.success ? 'text-[hsl(var(--soc-success))]' : 'text-[hsl(var(--soc-alert))]'
                }`}>
                  {blockResult.success ? 'OK' : 'ERR'}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  firewall.block
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">/</span>
                <span className="text-[11px] font-mono text-foreground/90 truncate">
                  {blockResult.message}
                </span>
              </div>
              <button
                onClick={() => setBlockResult(null)}
                className="text-muted-foreground hover:text-foreground text-[14px] leading-none shrink-0"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}
        
        <div className="px-5 pb-5 flex gap-2">
          {/* Ask ASSISTANT - neutral secondary button */}
          <div className="flex-1">
            <Popover open={showAnalysisOptions} onOpenChange={setShowAnalysisOptions}>
              <PopoverTrigger asChild>
                <button 
                  disabled={analysisLoading}
                  className="w-full h-9 px-3 text-[11px] font-mono font-medium uppercase tracking-wider text-foreground bg-muted/40 border border-border rounded-sm hover:bg-muted hover:border-foreground/40 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className="text-muted-foreground">›_</span>
                  {analysisLoading ? 'analyzing…' : 'analyze flow'}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                sideOffset={6}
                className="w-[var(--radix-popover-trigger-width)] p-0 bg-popover border border-border rounded-sm shadow-lg"
              >
                <button
                  onClick={() => handleAnalyzeFlow(false)}
                  className="w-full px-3 py-2 text-left border-l-2 border-transparent hover:border-foreground hover:bg-muted/50 transition-colors border-b border-border/50"
                >
                  <div className="text-[11px] font-mono font-medium text-foreground">analyze.flow</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Phân tích sự kiện đang chọn</div>
                </button>
                <button
                  onClick={() => handleAnalyzeFlow(true)}
                  className="w-full px-3 py-2 text-left border-l-2 border-transparent hover:border-foreground hover:bg-muted/50 transition-colors"
                >
                  <div className="text-[11px] font-mono font-medium text-foreground">
                    analyze.source <span className="text-muted-foreground">[{selectedEvent.src_ip}]</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Phân tích toàn bộ flows từ IP này</div>
                </button>
              </PopoverContent>
            </Popover>
          </div>
          
          {/* Block IP - destructive, neutral with red accent on hover */}
          <button 
            onClick={handleBlockIP}
            disabled={blockingIP || isAlreadyBlocked}
            className={`flex-1 h-9 px-3 text-[11px] font-mono font-medium uppercase tracking-wider rounded-sm transition-colors flex items-center justify-center gap-2 ${
              isAlreadyBlocked
                ? 'bg-muted/40 text-muted-foreground border border-border cursor-not-allowed'
                : 'bg-muted/40 text-foreground border border-border hover:bg-[hsl(var(--soc-alert)/0.08)] hover:border-[hsl(var(--soc-alert)/0.5)] hover:text-[hsl(var(--soc-alert))]'
            } disabled:opacity-50`}
          >
            {!isAlreadyBlocked && <span className="text-[hsl(var(--soc-alert))]">●</span>}
            {blockingIP 
              ? 'blocking…' 
              : isAlreadyBlocked 
                ? 'ip blocked' 
                : <>block <span className="opacity-70">{selectedEvent.src_ip}</span></>}
          </button>
        </div>

        {/* AI Analysis Result — SIEM-styled output panel */}
        {(analysisLoading || analysisResult) && (
          <div className="mx-5 mb-5">
            <div className="border border-border rounded-sm bg-card overflow-hidden">
              {/* Header bar matches Event Inspector / banner style */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className={`text-[10px] font-mono font-semibold uppercase tracking-[0.14em] shrink-0 ${
                    analysisLoading ? 'text-[hsl(var(--soc-warning))]' : 'text-[hsl(var(--soc-success))]'
                  }`}>
                    {analysisLoading ? 'RUN' : 'OK'}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    analyze.flow
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">/</span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {analysisLoading ? `model=${analysisModel} status=streaming` : `model=${analysisModel} status=complete`}
                  </span>
                </div>
                {analysisResult && (
                  <button
                    onClick={() => setAnalysisResult(null)}
                    className="text-muted-foreground hover:text-foreground text-[14px] leading-none shrink-0"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Body */}
              {analysisLoading ? (
                <div className="px-4 py-6 flex items-center gap-3">
                  <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                  <span className="text-[11px] font-mono text-muted-foreground">
                    awaiting response from {analysisModel}…
                  </span>
                </div>
              ) : analysisResult && (
                <div className="px-5 py-4 max-h-[360px] overflow-y-auto bg-card">
                  <div className="prose prose-invert prose-sm max-w-none
                    [&_*]:!text-foreground
                    [&_p]:text-[12.5px] [&_p]:leading-[1.7] [&_p]:my-2.5 [&_p]:text-foreground/90
                    [&_ul]:my-2.5 [&_ol]:my-2.5 [&_li]:my-1 [&_li]:text-[12.5px] [&_li]:leading-[1.7] [&_li]:text-foreground/90
                    [&_strong]:text-foreground [&_strong]:font-semibold
                    [&_em]:text-foreground/80
                    [&_h1]:text-[13px] [&_h1]:font-semibold [&_h1]:uppercase [&_h1]:tracking-[0.1em] [&_h1]:text-foreground [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:pb-1.5 [&_h1]:border-b [&_h1]:border-border
                    [&_h2]:text-[12.5px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-2
                    [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1.5
                    [&_h4]:text-[11.5px] [&_h4]:font-semibold [&_h4]:text-muted-foreground [&_h4]:uppercase [&_h4]:tracking-wider [&_h4]:mt-3 [&_h4]:mb-1
                    [&_code]:font-mono [&_code]:text-[11px] [&_code]:bg-muted [&_code]:text-foreground [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-sm [&_code]:border [&_code]:border-border
                    [&_pre]:bg-muted/40 [&_pre]:border [&_pre]:border-border [&_pre]:rounded-sm [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto
                    [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 [&_pre_code]:text-[11px] [&_pre_code]:leading-[1.6]
                    [&_blockquote]:border-l-2 [&_blockquote]:border-[hsl(var(--soc-warning))] [&_blockquote]:pl-3 [&_blockquote]:py-0.5 [&_blockquote]:my-3 [&_blockquote]:text-foreground/80 [&_blockquote]:not-italic [&_blockquote]:bg-muted/20
                    [&_a]:text-foreground [&_a]:underline [&_a]:decoration-muted-foreground hover:[&_a]:decoration-foreground
                    [&_hr]:border-border [&_hr]:my-4
                    [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_table]:text-[11.5px] [&_table]:font-mono
                    [&_thead]:bg-muted/40
                    [&_th]:border [&_th]:border-border [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_th]:uppercase [&_th]:text-[10px] [&_th]:tracking-wider
                    [&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:text-foreground/90 [&_td]:align-top
                    [&_tbody_tr:nth-child(even)]:bg-muted/15
                  ">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <ConfirmDialog
          isOpen={dialogState.isOpen}
          onClose={closeConfirm}
          onConfirm={dialogState.onConfirm}
          actionType={dialogState.actionType}
          targetValue={dialogState.targetValue}
          details={dialogState.details}
          isDarkMode={theme === 'dark'}
        />
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
            buckets={40}
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
    
    const recentAlerts = sortedEvents.filter(e => e.verdict === 'ALERT').slice(0, 50);
    
    return (
      <>
        <div className="mb-4">
          <h2 className={`text-sm font-semibold mb-1 ${'text-foreground'}`}>Security Event Log</h2>
          <p className={`text-[10px] ${'text-muted-foreground/60'}`}>Complete event stream with real-time filtering • {sortedEvents.length} events in selected range</p>
        </div>
        
        {/* Unified Filters */}
        {renderFilters()}
        
        <div className="grid grid-cols-12 gap-4 items-stretch">
          {/* Main Event Table */}
          <div className="col-span-9 flex flex-col">
            {/* Event Statistics */}
            <div className="grid grid-cols-7 gap-px mb-4 rounded-md overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
              {[
                { label: 'Total', value: sortedEvents.length, color: 'text-foreground' },
                { label: 'Alert', value: sortedEvents.filter(e => e.verdict === 'ALERT').length, color: 'text-[hsl(var(--soc-alert))]' },
                { label: 'Suspicious', value: sortedEvents.filter(e => e.verdict === 'SUSPICIOUS').length, color: 'text-[hsl(var(--soc-warning))]' },
                { label: 'False Pos', value: sortedEvents.filter(e => e.verdict === 'FALSE_POSITIVE').length, color: 'text-muted-foreground' },
                { label: 'Benign', value: sortedEvents.filter(e => e.verdict === 'BENIGN').length, color: 'text-[hsl(var(--soc-success))]' },
                { label: 'High Conf', value: sortedEvents.filter(e => e.confidence > 0.8).length, color: 'text-foreground' },
                { label: 'Blocked IPs', value: blockedIPsCount, color: 'text-[hsl(var(--soc-alert))]' },
              ].map((s, i) => (
                <div key={i} className="p-2 text-center bg-card">
                  <div className={`text-lg font-semibold font-mono ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{s.label}</div>
                </div>
              ))}
            </div>
            
            <div className="h-[560px] flex flex-col">
              {renderEventTable(displayEvents)}
            </div>
          </div>
          
          {/* Sidebar - constrained to main column height */}
          <div className="col-span-3 relative">
            <div className="absolute inset-0 flex flex-col gap-3 min-h-0 pr-1 overflow-hidden">
            {/* Recent Alerts */}
            <div className="border rounded-md p-3 bg-card border-[hsl(var(--soc-alert)/0.3)] flex flex-col flex-1 min-h-0">
              <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${'text-muted-foreground'}`}>Recent Alerts</div>
              <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                {recentAlerts.length === 0 ? (
                  <div className={`text-[10px] ${'text-muted-foreground/50'}`}>No alerts</div>
                ) : recentAlerts.map((alert) => (
                  <div key={alert.id} className={`text-[10px] border-b pb-2 last:border-0 ${'border-border'}`}>
                    <div className="text-[#ef4444] font-medium truncate">{alert.attack_type}</div>
                    <div className={`font-mono ${'text-muted-foreground/60'}`}>{alert.src_ip}</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Time Distribution */}
            <div className="border rounded-md p-3 bg-card border-border">
              <div className="text-[10px] uppercase tracking-wider font-medium mb-3 text-muted-foreground">Event Timeline</div>
              <div className="h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData.slice(-12)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Area type="monotone" dataKey="Traffic" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Blocked IPs (synced with pfSense) */}
            <TopBlockedIPsPanel apiUrl={apiUrl} refreshKey={blockedIPsCount} />

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
          <h2 className={`text-sm font-semibold mb-1 ${'text-foreground'}`}>Threat Intelligence</h2>
          <p className={`text-[10px] ${'text-muted-foreground/60'}`}>Active threats requiring attention • {criticalEvents.length} critical events from {uniqueSourceIPs.length} sources</p>
        </div>
        
        {/* Threat Overview Cards */}
        <div className="grid grid-cols-4 gap-px mb-4 rounded-md overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
          {[
            { label: 'Critical Alerts', value: alertEvents.length, accent: '#ef4444', sub: 'Immediate action required' },
            { label: 'Suspicious', value: criticalEvents.length - alertEvents.length, accent: '#f59e0b', sub: 'Under investigation' },
            { label: 'Attack Types', value: uniqueAttackTypes.length, accent: '#8b5cf6', sub: 'Unique signatures' },
            { label: 'High Confidence', value: highConfidenceThreats.length, accent: '#3b82f6', sub: '>80% certainty' },
          ].map((card, i) => (
            <div key={i} className={`p-3 ${'bg-card'}`} style={{ borderTop: `2px solid ${card.accent}` }}>
              <div className={`text-[10px] uppercase tracking-wider font-medium ${'text-muted-foreground'}`}>{card.label}</div>
              <div className={`text-2xl font-semibold font-mono my-1 ${'text-foreground'}`}>{card.value}</div>
              <div className={`text-[9px] ${'text-muted-foreground/60'}`}>{card.sub}</div>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-12 gap-4 items-stretch">
          {/* Left Panel - Threat Analysis */}
          <div className="col-span-4 relative">
            <div className="absolute inset-0 flex flex-col gap-3 min-h-0 overflow-hidden">
              {/* Attack Type Breakdown */}
              <div className={`border rounded-md p-4 flex flex-col flex-1 min-h-0 ${'bg-card border-border'}`}>
                <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${'text-muted-foreground'}`}>Attack Signatures</div>
                <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                  {attackCounts.map((attack, i) => (
                    <div key={attack.type} className="flex items-center gap-2">
                      <span className={`w-2 h-2 flex-shrink-0 ${attack.severity === 'critical' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                      <span className={`text-[10px] flex-1 truncate ${'text-muted-foreground'}`}>{attack.type}</span>
                      <span className={`text-[10px] font-mono ${'text-muted-foreground/70'}`}>{attack.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Top Threat Sources */}
              <div className={`border rounded-md p-4 flex flex-col flex-1 min-h-0 ${'bg-card border-border'}`}>
                <div className={`text-[10px] uppercase tracking-wider font-medium mb-3 ${'text-muted-foreground'}`}>Top Threat Sources</div>
                <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                  {topThreatSources.slice(0, 10).map((source, i) => (
                    <div key={source.ip} className={`border-b pb-2 last:border-0 ${'border-border'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-[#3b82f6]">{source.ip}</span>
                        <span className="text-[10px] font-mono text-[#ef4444]">{source.count}</span>
                      </div>
                      <div className={`text-[9px] truncate ${'text-muted-foreground/60'}`}>{source.attacks.slice(0, 2).join(', ')}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Panel - Threat Events */}
          <div className="col-span-8">
            <div className={`rounded-md ${'bg-card border border-[hsl(var(--soc-alert)/0.3)]'}`}>
              <div className={`p-3 border-b flex items-center justify-between ${'border-border'}`}>
                <div className={`text-xs uppercase tracking-wider font-semibold ${'text-muted-foreground'}`}>Active Threats</div>
                <span className="text-[9px] text-[#dc2626]">{criticalEvents.length} threats detected</span>
              </div>
              <div className="h-[560px] flex flex-col">
                {renderEventTable(criticalEvents.slice(0, 50))}
              </div>
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

    // ===== Executive summary: compare current vs previous equal window =====
    const nowMs = Date.now();
    const rangeMin = (timeRanges.find(r => r.value === timeRange)?.minutes) || 60;
    const windowMs = rangeMin === Infinity ? 24 * 60 * 60 * 1000 : rangeMin * 60000;
    const prevStart = nowMs - 2 * windowMs;
    const prevEnd = nowMs - windowMs;
    const prevEvents = events.filter(e => {
      const t = e.timestamp.getTime();
      return t >= prevStart && t < prevEnd;
    });
    const prevAlerts = prevEvents.filter(e => e.verdict === 'ALERT').length;
    const curAlerts = sortedEvents.filter(e => e.verdict === 'ALERT').length;
    const pct = (cur: number, prev: number) => {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return ((cur - prev) / prev) * 100;
    };
    const alertDelta = pct(curAlerts, prevAlerts);
    const totalDelta = pct(sortedEvents.length, prevEvents.length);
    const sourceDelta = pct(metrics.uniqueSources, new Set(prevEvents.map(e => e.src_ip)).size);

    // Sparkline series for KPI cards
    const sparkSlice = chartData.slice(-20);
    const trafficSpark = sparkSlice.map((d, i) => ({ i, v: d.Traffic }));
    const alertSpark = sparkSlice.map((d, i) => ({ i, v: d.Alerts }));

    // ===== Threat heatmap: day-of-week (rows) x hour-of-day (cols) =====
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    sortedEvents.filter(e => e.verdict === 'ALERT' || e.verdict === 'SUSPICIOUS').forEach(e => {
      heatmap[e.timestamp.getDay()][e.timestamp.getHours()]++;
    });
    const heatMax = Math.max(1, ...heatmap.flat());
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // ===== Top attacked destinations + ports =====
    const dstIpCounts: Record<string, number> = {};
    const dstPortCounts: Record<string, number> = {};
    sortedEvents.forEach(e => {
      dstIpCounts[e.dst_ip] = (dstIpCounts[e.dst_ip] || 0) + 1;
      if (e.dst_port) dstPortCounts[String(e.dst_port)] = (dstPortCounts[String(e.dst_port)] || 0) + 1;
    });
    const topDstIps = Object.entries(dstIpCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topDstPorts = Object.entries(dstPortCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // ===== Export handlers =====
    const exportCSV = () => {
      const header = ['timestamp', 'verdict', 'src_ip', 'dst_ip', 'dst_port', 'protocol', 'attack_type', 'confidence', 'engine'];
      const rows = sortedEvents.map(e => [
        e.timestamp.toISOString(), e.verdict, e.src_ip, e.dst_ip, e.dst_port ?? '', e.protocol,
        `"${(e.attack_type || '').replace(/"/g, '""')}"`, e.confidence.toFixed(2), (e as unknown as { engine?: string }).engine ?? ''
      ].join(','));
      const csv = [header.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soc-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
    const exportPDF = () => window.print();

    return (
      <>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold mb-1 text-foreground">Security Reports</h2>
            <p className="text-[10px] text-muted-foreground/60">Analytics dashboard for {timeRangeLabel} • Generated at {now}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={exportCSV} className="text-[10px] uppercase tracking-wider px-3 py-1.5 border border-border rounded-md bg-card hover:bg-muted text-muted-foreground transition-colors">
              Export CSV
            </button>
            <button onClick={exportPDF} className="text-[10px] uppercase tracking-wider px-3 py-1.5 border border-border rounded-md bg-card hover:bg-muted text-muted-foreground transition-colors">
              Export PDF
            </button>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="mb-4 border rounded-md p-3 bg-card border-border">
          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">Executive Summary</div>
          <div className="grid grid-cols-3 gap-4 text-[11px] text-muted-foreground">
            <div>
              <span className="text-foreground font-mono">{sortedEvents.length}</span> events processed,{' '}
              <DeltaBadge value={totalDelta} /> vs previous {timeRangeLabel.toLowerCase()}.
            </div>
            <div>
              <span className="text-[hsl(var(--soc-alert))] font-mono">{curAlerts}</span> alerts triggered,{' '}
              <DeltaBadge value={alertDelta} /> change.
            </div>
            <div>
              <span className="text-foreground font-mono">{metrics.uniqueSources}</span> unique sources,{' '}
              <DeltaBadge value={sourceDelta} /> shift.
            </div>
          </div>
        </div>

        {/* Summary Cards with sparklines */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Total Events', value: metrics.totalEvents, sub: 'In time range', spark: trafficSpark, color: '#3b82f6' },
            { label: 'Detection Rate', value: `${metrics.alertRate.toFixed(1)}%`, sub: 'Alerts / Total', spark: alertSpark, color: '#dc2626' },
            { label: 'Avg Confidence', value: avgConfidence.toFixed(2), sub: 'Mean score', spark: trafficSpark, color: '#8b5cf6' },
            { label: 'Unique Sources', value: metrics.uniqueSources, sub: 'Distinct IPs', spark: trafficSpark, color: '#10b981' },
            { label: 'Peak Hour', value: peakHour ? `${peakHour[0]}:00` : '-', sub: peakHour ? `${peakHour[1].traffic} events` : '', spark: trafficSpark, color: '#f59e0b' },
          ].map((card, i) => (
            <div key={i} className="border rounded-md p-3 bg-card border-border">
              <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{card.label}</div>
              <div className="text-xl font-bold font-mono my-1 text-foreground">{card.value}</div>
              <div className="text-[9px] text-muted-foreground/60 mb-1">{card.sub}</div>
              <Sparkline data={card.spark} color={card.color} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4 mb-4">
          {/* Traffic Trend */}
          <div className="col-span-8 border rounded-md p-4 bg-card border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Traffic Trend</div>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground/70">
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
          <div className="col-span-4 border rounded-md p-4 bg-card border-border">
            <div className="text-xs uppercase tracking-wider font-semibold mb-3 text-muted-foreground">Verdict Distribution</div>
            <div className="space-y-3">
              {verdictBreakdown.map((v) => (
                <div key={v.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">{v.name}</span>
                    <span className="text-[11px] font-mono" style={{ color: v.color }}>{v.value}</span>
                  </div>
                  <div className="w-full h-1.5 rounded bg-muted">
                    <div className="h-full rounded" style={{ width: `${Math.min((v.value / Math.max(sortedEvents.length, 1)) * 100, 100)}%`, backgroundColor: v.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Threat Heatmap */}
        <div className="mb-4 border rounded-md p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Threat Heatmap (Day × Hour)</div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground/70">
              <span>Low</span>
              <div className="flex gap-px">
                {[0.15, 0.35, 0.55, 0.75, 0.9].map(o => (
                  <div key={o} className="w-3 h-3" style={{ backgroundColor: `hsl(var(--soc-alert) / ${o})` }} />
                ))}
              </div>
              <span>High</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="flex">
                <div className="w-10" />
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="flex-1 min-w-[18px] text-center text-[8px] text-muted-foreground/60 font-mono">
                    {h % 3 === 0 ? h : ''}
                  </div>
                ))}
              </div>
              {heatmap.map((row, d) => (
                <div key={d} className="flex items-center mt-px">
                  <div className="w-10 text-[9px] text-muted-foreground font-mono">{dayLabels[d]}</div>
                  {row.map((cell, h) => {
                    const intensity = cell / heatMax;
                    return (
                      <div
                        key={h}
                        title={`${dayLabels[d]} ${h}:00 — ${cell} threats`}
                        className="flex-1 min-w-[18px] h-5 mx-px rounded-sm border border-border/30"
                        style={{
                          backgroundColor: cell === 0
                            ? 'hsl(var(--muted) / 0.3)'
                            : `hsl(var(--soc-alert) / ${0.15 + intensity * 0.75})`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Top Attack Sources */}
          <div className="border rounded-md p-4 bg-card border-border">
            <div className="text-xs uppercase tracking-wider font-semibold mb-3 text-muted-foreground">Top Attack Sources</div>
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
          <div className="border rounded-md p-4 bg-card border-border">
            <div className="text-xs uppercase tracking-wider font-semibold mb-3 text-muted-foreground">Protocol Distribution</div>
            <div className="flex gap-3 flex-wrap">
              {topProtocols.map(([proto, count]) => (
                <div key={proto} className="border rounded-md px-4 py-3 text-center min-w-[80px] bg-muted/30 border-border">
                  <div className="text-xl font-bold font-mono text-foreground">{count}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{proto}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top attacked destinations + ports */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-md p-4 bg-card border-border">
            <div className="text-xs uppercase tracking-wider font-semibold mb-3 text-muted-foreground">Top Attacked Destinations</div>
            <div className="space-y-1.5">
              {topDstIps.length === 0 && <div className="text-[10px] text-muted-foreground/50">No data</div>}
              {topDstIps.map(([ip, c]) => (
                <div key={ip} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-foreground flex-1 truncate">{ip}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded">
                    <div className="h-full rounded bg-[hsl(var(--soc-alert))]" style={{ width: `${(c / topDstIps[0][1]) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{c}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border rounded-md p-4 bg-card border-border">
            <div className="text-xs uppercase tracking-wider font-semibold mb-3 text-muted-foreground">Top Targeted Ports</div>
            <div className="grid grid-cols-4 gap-2">
              {topDstPorts.length === 0 && <div className="col-span-4 text-[10px] text-muted-foreground/50">No data</div>}
              {topDstPorts.map(([port, c]) => (
                <div key={port} className="border rounded-md p-2 text-center bg-muted/30 border-border">
                  <div className="text-base font-bold font-mono text-foreground">{port}</div>
                  <div className="text-[9px] uppercase text-muted-foreground">{c} hits</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen font-['Inter',system-ui,sans-serif] transition-colors bg-background text-foreground">
      {/* Top Bar */}
      <header
        className={`h-10 flex items-center justify-between px-4 border-b bg-card/90 backdrop-blur-md border-border sticky top-0 z-40 transition-transform ease-out ${
          headerVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ transitionDuration: '250ms' }}
      >
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


          <div className="flex items-center gap-2 px-3 py-1.5 border border-border bg-card">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Auto Block</span>
            <button 
              onClick={() => setAutoBlock(!autoBlock)}
              className={`w-8 h-4 rounded-full transition-colors relative ${autoBlock ? 'bg-[hsl(var(--soc-alert))]' : 'bg-border'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${autoBlock ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>

          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="h-7 px-2 text-[11px] border border-border bg-card text-muted-foreground focus:outline-none focus:border-ring"
          >
            {timeRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          <select 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value as 'all' | 'alerts')}
            className="h-7 px-2 text-[11px] border border-border bg-card text-muted-foreground focus:outline-none focus:border-ring"
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
          SOC Dashboard — C1NE.03 Team — Cybersecurity K28 — Duy Tan University
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
