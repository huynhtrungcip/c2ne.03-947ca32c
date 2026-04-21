/**
 * SOC Tool definitions + executors cho AI function calling.
 */
import { SOCEvent } from '@/types/soc';
import { getAttackerTimeline } from '@/data/historicalDataset';
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
  {
    type: 'function',
    function: {
      name: 'analyze_ip',
      description: 'Build a complete behavioral profile for a single IP address: timeline buckets, targeted ports, attack types, destinations, verdict breakdown, and top alert samples. ALWAYS call this when the analyst asks about a specific IP — do NOT guess from the snapshot.',
      parameters: {
        type: 'object',
        properties: {
          ip: { type: 'string', description: 'IPv4 to analyze (matched as src_ip OR dst_ip)' },
          since_minutes: { type: 'number', description: 'Time window in minutes', default: 60 },
          bucket_minutes: { type: 'number', description: 'Timeline bucket size (default 5)', default: 5 },
        },
        required: ['ip'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ip_history',
      description: 'Retrieve the FULL multi-day historical timeline (2026-04-20 → present) for a given IP from the historical baseline. Use this to detect APT-style staging where an attacker performs reconnaissance days before launching the real attack. Returns chronological actions with verdict and target.',
      parameters: {
        type: 'object',
        properties: {
          ip: { type: 'string', description: 'IPv4 address to look up across the full 5-day history' },
        },
        required: ['ip'],
      },
    },
  },
];

// ===== Executors =====
export type ExecResult = { ok: boolean; data?: unknown; error?: string };

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
      case 'analyze_ip': {
        const ip = String(args.ip || '');
        if (!ip) return { ok: false, error: 'Missing ip parameter' };
        const since = Number(args.since_minutes ?? 60);
        const bucketMin = Math.max(1, Number(args.bucket_minutes ?? 5));
        const list = filterByTime(ctx.events, since).filter((e) => e.src_ip === ip || e.dst_ip === ip);
        if (list.length === 0) {
          return { ok: true, data: { ip, window_minutes: since, total_events: 0, note: 'No events found for this IP in the time window.' } };
        }
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
        // Timeline buckets
        const bucketMs = bucketMin * 60_000;
        const start = Math.floor(firstTs / bucketMs) * bucketMs;
        const end = Math.ceil(lastTs / bucketMs) * bucketMs;
        const buckets: Array<{ t: string; total: number; alert: number }> = [];
        for (let b = start; b <= end; b += bucketMs) {
          buckets.push({ t: new Date(b).toISOString(), total: 0, alert: 0 });
        }
        for (const e of list) {
          const idx = Math.floor((e.timestamp.getTime() - start) / bucketMs);
          if (buckets[idx]) {
            buckets[idx].total++;
            if (e.verdict === 'ALERT') buckets[idx].alert++;
          }
        }
        const topPorts = Object.entries(portMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, c]) => ({ port: Number(p), count: c }));
        const topDsts = Object.entries(dstMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([d, c]) => ({ dst: d, count: c }));
        const topAttacks = Object.entries(attackMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([type, count]) => ({ type, count }));
        const sampleAlerts = list
          .filter((e) => e.verdict === 'ALERT')
          .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
          .slice(0, 10)
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
        return {
          ok: true,
          data: {
            ip,
            window_minutes: since,
            first_seen: new Date(firstTs).toISOString(),
            last_seen: new Date(lastTs).toISOString(),
            total_events: list.length,
            role: { as_source: asSrc, as_destination: asDst },
            by_verdict: byVerdict,
            by_protocol: byProto,
            by_engine: engineMap,
            top_targeted_ports: topPorts,
            top_destinations: topDsts,
            top_attack_types: topAttacks,
            timeline: buckets,
            sample_alerts: sampleAlerts,
          },
        };
      }
      case 'get_ip_history': {
        const ip = String(args.ip || '');
        if (!ip) return { ok: false, error: 'Missing ip parameter' };
        const timeline = getAttackerTimeline(ip);
        if (timeline.length === 0) {
          return { ok: true, data: { ip, total_actions: 0, note: 'No historical activity recorded for this IP in the 20–24/04/2026 baseline.' } };
        }
        const days = new Set(timeline.map((t) => t.day));
        const verdicts = timeline.reduce<Record<string, number>>((m, t) => { m[t.verdict] = (m[t.verdict] || 0) + 1; return m; }, {});
        return {
          ok: true,
          data: {
            ip,
            total_actions: timeline.length,
            active_days: Array.from(days).sort(),
            day_count: days.size,
            verdict_breakdown: verdicts,
            first_seen: timeline[0].ts,
            last_seen: timeline[timeline.length - 1].ts,
            timeline,
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
