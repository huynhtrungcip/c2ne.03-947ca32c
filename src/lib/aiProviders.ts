/**
 * Multi-provider OpenAI-compatible AI client with streaming + tool calling.
 * Supports: MegaLLM, Grok (xAI), Gemini (OpenAI-compat), Ollama (local/VPS), Custom.
 */

export type ProviderKind = 'megallm' | 'grok' | 'gemini' | 'ollama' | 'custom';

export interface AIProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsTools?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  name?: string;
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallDelta {
  id: string;
  name: string;
  arguments: string; // JSON string accumulated
}

const STORAGE_KEY = 'soc-ai-providers';
const ACTIVE_KEY = 'soc-ai-active-provider';

// ===== Presets =====
export const PROVIDER_PRESETS: Record<ProviderKind, Partial<AIProviderConfig> & { models: string[] }> = {
  megallm: {
    label: 'MegaLLM',
    baseUrl: 'https://ai.megallm.io/v1',
    model: 'deepseek-r1-distill-llama-70b',
    supportsTools: true,
    models: [
      'openai-gpt-oss-120b',
      'openai-gpt-oss-20b',
      'deepseek-r1-distill-llama-70b',
      'llama3.3-70b-instruct',
    ],
  },
  grok: {
    label: 'Grok (xAI)',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4-latest',
    supportsTools: true,
    // Updated 2026-04 — xAI deprecated grok-2-* and grok-beta. Current line: grok-4 / grok-3 / grok-code-fast-1.
    models: ['grok-4-latest', 'grok-4', 'grok-4-fast-reasoning', 'grok-4-fast-non-reasoning', 'grok-3', 'grok-3-mini', 'grok-code-fast-1'],
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    supportsTools: true,
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  ollama: {
    label: 'Ollama (Local/VPS)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    supportsTools: true,
    models: ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'deepseek-r1'],
  },
  custom: {
    label: 'Custom',
    baseUrl: '',
    model: '',
    supportsTools: false,
    models: [],
  },
};

// ===== Storage =====
export function loadProviders(): AIProviderConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveProviders(providers: AIProviderConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  } catch (e) {
    console.error('Failed to save providers:', e);
  }
}

export function getActiveProviderId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProviderId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActiveProvider(): AIProviderConfig | null {
  const id = getActiveProviderId();
  if (!id) return null;
  return loadProviders().find((p) => p.id === id) || null;
}

// ===== Test Connection =====
export async function testProvider(p: AIProviderConfig): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (p.apiKey) headers['Authorization'] = `Bearer ${p.apiKey}`;
    const resp = await fetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: p.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        stream: false,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ===== Streaming Chat =====
export interface StreamChatOptions {
  provider: AIProviderConfig;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  onDelta?: (chunk: string) => void;
  onToolCall?: (calls: ToolCallDelta[]) => void;
  onDone?: (full: { content: string; toolCalls: ToolCallDelta[] }) => void;
  onError?: (err: Error) => void;
}

export async function streamChat(opts: StreamChatOptions): Promise<{ content: string; toolCalls: ToolCallDelta[] }> {
  const { provider, messages, tools, signal, temperature = 0.7, maxTokens = 2048, onDelta, onToolCall, onDone, onError } = opts;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

  const body: Record<string, unknown> = {
    model: provider.model,
    messages: messages.map((m) => {
      const out: Record<string, unknown> = { role: m.role, content: m.content };
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      if (m.tool_calls) out.tool_calls = m.tool_calls;
      if (m.name) out.name = m.name;
      return out;
    }),
    stream: true,
    temperature,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  let resp: Response;
  try {
    resp = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    const err = new Error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    onError?.(err);
    throw err;
  }

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`HTTP ${resp.status}: ${txt.slice(0, 300)}`);
    onError?.(err);
    throw err;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  const toolCallsMap = new Map<number, ToolCallDelta>();
  let streamDone = false;

  const processLine = (rawLine: string) => {
    let line = rawLine;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line || line.startsWith(':')) return;
    if (!line.startsWith('data: ')) return;
    const json = line.slice(6).trim();
    if (json === '[DONE]') {
      streamDone = true;
      return;
    }
    try {
      const parsed = JSON.parse(json);
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return;
      if (typeof delta.content === 'string' && delta.content) {
        fullContent += delta.content;
        onDelta?.(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          let cur = toolCallsMap.get(idx);
          if (!cur) {
            cur = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', arguments: '' };
            toolCallsMap.set(idx, cur);
          }
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        }
        onToolCall?.(Array.from(toolCallsMap.values()));
      }
    } catch {
      // partial JSON — ignore, will continue
    }
  };

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      processLine(line);
      if (streamDone) break;
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split('\n')) processLine(line);
  }

  const result = { content: fullContent, toolCalls: Array.from(toolCallsMap.values()) };
  onDone?.(result);
  return result;
}
