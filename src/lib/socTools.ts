/**
 * SOC Tool definitions + executors cho AI function calling.
 */
import { SOCEvent } from '@/types/soc';
import type { ToolDef } from './aiProviders';

export const SOC_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'block_ip',
      description: 'Block a malicious IP via pfSense firewall (AI_Blocked_IP alias). Use ONLY when you are confident the IP is malicious. User confirmation will be requested before execution.',
      parameters: {
        type: 'object',
        properties: {
          ip: { type: 'string', description: 'IPv4 address to block (e.g. 192.168.1.10)' },
          reason: { type: 'string', description: 'Short reason for blocking, used as audit log' },
        },
        required: ['ip', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_events',
      description: 'Query SOC events with filters. Returns up to `limit` matching events.',
      parameters: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['ALERT', 'SUSPICIOUS', 'BENIGN'], description: 'Filter by verdict' },
          src_ip: { type: 'string', description: 'Filter by source IP (exact match)' },
          dst_ip: { type: 'string', description: 'Filter by destination IP (exact match)' },
          attack_type: { type: 'string', description: 'Substring match on attack signature' },
          since_minutes: { type: 'number', description: 'Only events within last N minutes', default: 60 },
          limit: { type: 'number', description: 'Max events to return (default 20, max 100)', default: 20 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_sources',
      description: 'Get top N source IPs ranked by event count, with breakdown by verdict.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of top IPs (default 10)', default: 10 },
          verdict_filter: { type: 'string', enum: ['ALERT', 'SUSPICIOUS', 'BENIGN', 'ANY'], default: 'ANY' },
          since_minutes: { type: 'number', default: 60 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_range',
      description: 'Aggregated SOC stats for a time range: total events, by verdict, by attack type, unique IPs.',
      parameters: {
        type: 'object',
        properties: {
          since_minutes: { type: 'number', description: 'Time window in minutes', default: 60 },
        },
      },
    },
  },
];

// ===== Executors =====
type ExecResult = { ok: true; data: unknown } | { ok: false; error: string };

interface ExecutorContext {
  events: SOCEvent[];
  blockIp: (ip: string, reason: string) => Promise<{ ok: boolean; error?: string }>;
}

function filterByTime(events: SOCEvent[], minutes: number): SOCEvent[] {
  const cutoff = Date.now() - minutes * 60_000;
  return events.filter((e) => e.timestamp.getTime() >= cutoff);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ExecutorContext
): Promise<ExecResult> {
  try {
    switch (name) {
      case 'block_ip': {
        const ip = String(args.ip || '');
        const reason = String(args.reason || 'AI recommendation');
        if (!ip) return { ok: false, error: 'Missing ip parameter' };
        const res = await ctx.blockIp(ip, reason);
        if (!res.ok) return { ok: false, error: res.error || 'Block failed' };
        return { ok: true, data: { blocked: ip, reason, status: 'success' } };
      }
      case 'query_events': {
        const verdict = args.verdict as string | undefined;
        const src = args.src_ip as string | undefined;
        const dst = args.dst_ip as string | undefined;
        const attack = (args.attack_type as string | undefined)?.toLowerCase();
        const since = Number(args.since_minutes ?? 60);
        const limit = Math.min(Number(args.limit ?? 20), 100);
        let list = filterByTime(ctx.events, since);
        if (verdict) list = list.filter((e) => e.verdict === verdict);
        if (src) list = list.filter((e) => e.src_ip === src);
        if (dst) list = list.filter((e) => e.dst_ip === dst);
        if (attack) list = list.filter((e) => e.attack_type?.toLowerCase().includes(attack));
        const out = list.slice(0, limit).map((e) => ({
          time: e.timestamp.toISOString(),
          verdict: e.verdict,
          src_ip: e.src_ip,
          dst_ip: e.dst_ip,
          dst_port: e.dst_port,
          protocol: e.protocol,
          signature: e.attack_type,
          confidence: Number(e.confidence?.toFixed?.(2) ?? e.confidence),
          engine: e.source_engine,
        }));
        return { ok: true, data: { matched: list.length, returned: out.length, events: out } };
      }
      case 'get_top_sources': {
        const limit = Number(args.limit ?? 10);
        const vf = (args.verdict_filter as string) || 'ANY';
        const since = Number(args.since_minutes ?? 60);
        let list = filterByTime(ctx.events, since);
        if (vf !== 'ANY') list = list.filter((e) => e.verdict === vf);
        const map: Record<string, { total: number; ALERT: number; SUSPICIOUS: number; BENIGN: number }> = {};
        for (const e of list) {
          if (!map[e.src_ip]) map[e.src_ip] = { total: 0, ALERT: 0, SUSPICIOUS: 0, BENIGN: 0 };
          map[e.src_ip].total++;
          if (e.verdict === 'ALERT') map[e.src_ip].ALERT++;
          else if (e.verdict === 'SUSPICIOUS') map[e.src_ip].SUSPICIOUS++;
          else if (e.verdict === 'BENIGN') map[e.src_ip].BENIGN++;
        }
        const top = Object.entries(map)
          .sort((a, b) => b[1].ALERT * 3 + b[1].SUSPICIOUS - (a[1].ALERT * 3 + a[1].SUSPICIOUS))
          .slice(0, limit)
          .map(([ip, s]) => ({ ip, ...s }));
        return { ok: true, data: { window_minutes: since, top } };
      }
      case 'summarize_range': {
        const since = Number(args.since_minutes ?? 60);
        const list = filterByTime(ctx.events, since);
        const byVerdict: Record<string, number> = {};
        const byAttack: Record<string, number> = {};
        const srcs = new Set<string>();
        const dsts = new Set<string>();
        for (const e of list) {
          byVerdict[e.verdict] = (byVerdict[e.verdict] || 0) + 1;
          if (e.attack_type) byAttack[e.attack_type] = (byAttack[e.attack_type] || 0) + 1;
          srcs.add(e.src_ip);
          dsts.add(e.dst_ip);
        }
        const topAttacks = Object.entries(byAttack)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([type, count]) => ({ type, count }));
        return {
          ok: true,
          data: {
            window_minutes: since,
            total_events: list.length,
            by_verdict: byVerdict,
            unique_sources: srcs.size,
            unique_destinations: dsts.size,
            top_attack_types: topAttacks,
          },
        };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const TOOLS_REQUIRING_CONFIRMATION = new Set(['block_ip']);
