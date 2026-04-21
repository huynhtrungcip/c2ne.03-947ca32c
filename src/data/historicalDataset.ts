/**
 * AI-SOC HISTORICAL DATASET — 2026-04-20 → 2026-04-24
 * ----------------------------------------------------------------------------
 * Hand-crafted, deterministic dataset designed to be **AI-analyzable**.
 *
 * Design goals:
 *   1. Every event carries a RICH raw_log payload mimicking real production
 *      telemetry: Suricata eve.json + Zeek conn.log + ML feature vector +
 *      MITRE ATT&CK mapping + analyst notes.
 *   2. Events are CAUSALLY LINKED — each escalation references the previous
 *      day's reconnaissance via `correlation.related_events` so the AI can
 *      reconstruct the kill-chain.
 *   3. Network logic respects pfSense NAT: anything from outside the LAN
 *      lands on the gateway 192.168.168.254. Internal LAN ↔ LAN chatter
 *      keeps original dst IPs.
 *   4. Storyline = single APT actor (192.168.168.23) profiling the lab over
 *      5 days, plus one external DDoS burst on day 4 to populate the DDoS
 *      class. Day 5 = silence (classic pre-attack staging).
 *
 *   Day 1 (20/04) — Recon: ICMP sweep + first HTTPS look at gateway
 *   Day 2 (21/04) — TCP probing: 22/80/443/8080/3389 — Zeek REJ
 *   Day 3 (22/04) — Targeted PortScan: nmap-like top-100 → Suricata ALERT
 *   Day 4 (23/04) — External DDoS burst (NOT .23) → DDoS class populated
 *   Day 5 (24/04) — Cool-down: 2 SSH probes only — APT staging
 *   Day 6 (25/04) — LIVE DEMO. Real Kali. Backend reshapes traffic.
 */

import { SOCEvent } from '@/types/soc';

// ---------- Seeded RNG (dataset is identical every load) ----------
let _seed = 1337;
const rand = () => {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Network actors ----------
export const ATTACKER_IP = '192.168.168.23';
const GATEWAY = '192.168.168.254';
const FILE_SERVER = '192.168.168.40';
const DNS_SERVER = '192.168.168.10';
const LAB_HOSTS = Array.from({ length: 31 }, (_, i) => `192.168.168.${20 + i}`); // .20 → .50

// External services seen via NAT egress (the FQDN, not the IP)
const EGRESS_FQDNS = [
  'www.google.com', 'fonts.googleapis.com', 'github.com', 'raw.githubusercontent.com',
  'registry.npmjs.org', 'pypi.org', 'security.ubuntu.com', 'archive.ubuntu.com',
  'cdn.cloudflare.com', 'api.openai.com', 'one.one.one.one',
];
const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/124.0',
  'curl/8.4.0',
  'apt-http/2.4.10',
  'pip/24.0',
];

// ---------- Helpers ----------
const communityId = (s: string, sp: number, d: string, dp: number, proto: string) => {
  let h = 0;
  const str = `${s}|${sp}|${d}|${dp}|${proto}`;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '1:';
  const a = Math.abs(h);
  for (let i = 0; i < 22; i++) out += chars[(a * (i + 1)) % chars.length];
  return out + '=';
};

const flowId = () => Math.floor(rand() * 9_000_000_000_000) + 1_000_000_000_000;

const macFor = (ip: string) => {
  // Stable fake MAC per IP (last 3 octets derived from IP)
  const parts = ip.split('.').map((n) => parseInt(n, 10));
  const a = (parts[2] || 0).toString(16).padStart(2, '0');
  const b = (parts[3] || 0).toString(16).padStart(2, '0');
  const c = ((parts[3] || 0) ^ 0x5a).toString(16).padStart(2, '0');
  return `52:54:00:${a}:${b}:${c}`;
};

const zeekConnState = (verdict: string) => {
  if (verdict === 'ALERT') return pick(['S0', 'REJ', 'RSTO', 'RSTR']);
  if (verdict === 'SUSPICIOUS') return pick(['REJ', 'S0', 'OTH']);
  return pick(['SF', 'SF', 'SF', 'S1']);
};

// ---------- Rich payload builder ----------
type PayloadOpts = {
  ts: Date;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  proto: string;
  verdict: string;
  attack_type: string;
  confidence: number;
  // Optional enrichments
  signature_id?: number;
  mitre?: { tactic: string; technique: string; id: string };
  related?: string[]; // related event IDs (for kill-chain narrative)
  payload_summary?: string;
  http?: { method: string; host: string; uri: string; status?: number; ua?: string };
  dns?: { query: string; rcode: string; answers?: string[] };
  ssh?: { client_version?: string; auth_attempt?: boolean };
  notes?: string;
};

const buildRawLog = (o: PayloadOpts, evtId: string) => {
  const fid = flowId();
  const cid = communityId(o.src_ip, o.src_port, o.dst_ip, o.dst_port, o.proto);
  const ts = o.ts.toISOString();
  const isExternalSrc = !o.src_ip.startsWith('192.168.168.');
  const direction = isExternalSrc
    ? 'inbound'
    : o.dst_ip === GATEWAY
    ? 'outbound_via_nat'
    : 'lateral';

  // Bytes/packets — make ALERT bursts heavier than benign flows
  const baseBytes = o.verdict === 'ALERT' ? between(120, 1800) : between(280, 4200);
  const orig_pkts = o.verdict === 'ALERT' ? between(1, 4) : between(3, 22);
  const resp_pkts = o.verdict === 'ALERT' ? between(0, 2) : between(2, 18);
  const orig_bytes = baseBytes;
  const resp_bytes = o.verdict === 'ALERT' ? between(0, 240) : between(400, 8800);
  const duration_s = round2(o.verdict === 'ALERT' ? rand() * 0.4 : rand() * 12 + 0.2);

  const conn_state = zeekConnState(o.verdict);

  // Suricata-like alert block (only when ALERT/SUSPICIOUS)
  const suricata =
    o.verdict === 'ALERT' || o.verdict === 'SUSPICIOUS'
      ? {
          event_type: 'alert',
          alert: {
            action: o.verdict === 'ALERT' ? 'allowed' : 'allowed',
            gid: 1,
            signature_id: o.signature_id ?? between(2000000, 2999999),
            rev: 3,
            signature: `ET ${o.verdict === 'ALERT' ? 'POLICY' : 'INFO'} ${o.attack_type}`,
            category: o.attack_type.toLowerCase().includes('scan')
              ? 'Attempted Information Leak'
              : o.attack_type.toLowerCase().includes('ddos')
              ? 'Network Trojan was Detected'
              : 'Potentially Bad Traffic',
            severity: o.verdict === 'ALERT' ? 2 : 3,
            metadata: {
              affected_product: ['Any'],
              attack_target: ['Network'],
              created_at: ['2024_11_01'],
              deployment: ['Perimeter'],
              signature_severity: [o.verdict === 'ALERT' ? 'Major' : 'Minor'],
              updated_at: ['2025_03_14'],
            },
          },
        }
      : null;

  // Zeek conn.log style block
  const zeek = {
    ts: o.ts.getTime() / 1000,
    uid: `C${Array.from({ length: 17 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(rand() * 62)]).join('')}`,
    'id.orig_h': o.src_ip,
    'id.orig_p': o.src_port,
    'id.resp_h': o.dst_ip,
    'id.resp_p': o.dst_port,
    proto: o.proto.toLowerCase(),
    service: o.dst_port === 443 ? 'ssl' : o.dst_port === 80 ? 'http' : o.dst_port === 53 ? 'dns' : o.dst_port === 22 ? 'ssh' : '-',
    duration: duration_s,
    orig_bytes,
    resp_bytes,
    conn_state,
    local_orig: o.src_ip.startsWith('192.168.168.'),
    local_resp: o.dst_ip.startsWith('192.168.168.'),
    missed_bytes: 0,
    history: o.verdict === 'ALERT' ? 'S' : 'ShADadFf',
    orig_pkts,
    orig_ip_bytes: orig_bytes + orig_pkts * 40,
    resp_pkts,
    resp_ip_bytes: resp_bytes + resp_pkts * 40,
  };

  // ML feature vector — what the AI engine actually uses
  const ml = {
    model: 'cic_ids2017_xgb_v3',
    predicted_class: o.attack_type,
    confidence: o.confidence,
    top_features: {
      flow_duration_us: Math.floor(duration_s * 1_000_000),
      total_fwd_packets: orig_pkts,
      total_bwd_packets: resp_pkts,
      fwd_pkt_len_mean: orig_pkts > 0 ? Math.floor(orig_bytes / orig_pkts) : 0,
      bwd_pkt_len_mean: resp_pkts > 0 ? Math.floor(resp_bytes / resp_pkts) : 0,
      flow_bytes_per_s: duration_s > 0 ? Math.floor((orig_bytes + resp_bytes) / duration_s) : 0,
      flow_pkts_per_s: duration_s > 0 ? round2((orig_pkts + resp_pkts) / duration_s) : 0,
      syn_flag_count: o.verdict === 'ALERT' ? orig_pkts : 1,
      ack_flag_count: o.verdict === 'ALERT' ? 0 : orig_pkts + resp_pkts - 2,
      psh_flag_count: o.verdict === 'BENIGN' ? between(0, 4) : 0,
      down_up_ratio: orig_bytes > 0 ? round2(resp_bytes / orig_bytes) : 0,
    },
    runner_up_classes:
      o.verdict === 'ALERT'
        ? [
            { class: 'Normal HTTPS Traffic', prob: round2(1 - o.confidence - 0.02) },
            { class: 'BruteForce', prob: round2(rand() * 0.04) },
          ]
        : [],
  };

  // MITRE mapping when attack
  const mitre =
    o.mitre ??
    (o.attack_type === 'PortScan'
      ? { tactic: 'Reconnaissance', technique: 'Active Scanning: Scanning IP Blocks', id: 'T1595.001' }
      : o.attack_type === 'DDoS'
      ? { tactic: 'Impact', technique: 'Network Denial of Service', id: 'T1498' }
      : o.attack_type.includes('SSH')
      ? { tactic: 'Credential Access', technique: 'Brute Force', id: 'T1110' }
      : o.attack_type.includes('Suspicious')
      ? { tactic: 'Reconnaissance', technique: 'Network Service Discovery', id: 'T1046' }
      : o.attack_type === 'ICMP Echo Request'
      ? { tactic: 'Reconnaissance', technique: 'Remote System Discovery', id: 'T1018' }
      : null);

  return JSON.stringify(
    {
      '@timestamp': ts,
      event_id: evtId,
      community_id: cid,
      flow_id: fid,
      direction,
      src: { ip: o.src_ip, port: o.src_port, mac: macFor(o.src_ip) },
      dst: { ip: o.dst_ip, port: o.dst_port, mac: macFor(o.dst_ip) },
      network: {
        protocol: o.proto,
        transport: o.proto.toLowerCase(),
        bytes: orig_bytes + resp_bytes,
        packets: orig_pkts + resp_pkts,
        nat_translated: o.dst_ip === GATEWAY && !o.dst_ip.startsWith('192.168.'),
      },
      verdict: o.verdict,
      attack_type: o.attack_type,
      confidence: o.confidence,
      ...(suricata ? { suricata } : {}),
      zeek,
      ml,
      ...(o.http ? { http: { ...o.http, user_agent: o.http.ua ?? pick(USER_AGENTS) } } : {}),
      ...(o.dns ? { dns: o.dns } : {}),
      ...(o.ssh ? { ssh: o.ssh } : {}),
      ...(mitre ? { mitre_attack: mitre } : {}),
      correlation: {
        related_events: o.related ?? [],
        analyst_notes: o.notes ?? null,
        kill_chain_phase:
          o.attack_type === 'PortScan' || o.attack_type === 'ICMP Echo Request'
            ? 'reconnaissance'
            : o.attack_type === 'DDoS'
            ? 'actions-on-objectives'
            : o.attack_type.includes('Suspicious') || o.attack_type.includes('SSH')
            ? 'weaponization'
            : 'benign',
      },
      enrichment: {
        geo: isExternalSrc
          ? { country: pick(['US', 'CN', 'RU', 'NL', 'BR', 'IN']), asn: between(1000, 65000) }
          : { country: 'LAN', asn: 0 },
        threat_intel:
          o.verdict === 'ALERT' && isExternalSrc
            ? { matched_feeds: ['abuse.ch', 'spamhaus_drop'], reputation: 'malicious' }
            : { matched_feeds: [], reputation: 'unknown' },
      },
      pipeline: { source: 'zeek+suricata+ml', version: '3.4.1', tap: 'pfSense_LAN_mirror' },
    },
    null,
    2
  );
};

// ---------- Event factory ----------
let _id = 0;
type EventOpts = Partial<Omit<SOCEvent, 'timestamp'>> & {
  ts: Date;
  related?: string[];
  http?: PayloadOpts['http'];
  dns?: PayloadOpts['dns'];
  ssh?: PayloadOpts['ssh'];
  notes?: string;
  mitre?: PayloadOpts['mitre'];
  signature_id?: number;
};

const mk = (o: EventOpts): SOCEvent => {
  _id++;
  const proto = o.protocol || 'TCP';
  const sp = o.src_port ?? between(20000, 65000);
  const dp = o.dst_port ?? 443;
  const src_ip = o.src_ip!;
  const dst_ip = o.dst_ip!;
  const verdict = o.verdict || 'BENIGN';
  const attack_type = o.attack_type || 'Normal HTTPS Traffic';
  const confidence = o.confidence ?? round2(0.05 + rand() * 0.18);
  const evtId = `HIST-${o.ts.getTime()}-${_id}`;

  const raw = buildRawLog(
    {
      ts: o.ts,
      src_ip,
      src_port: sp,
      dst_ip,
      dst_port: dp,
      proto,
      verdict,
      attack_type,
      confidence,
      related: o.related,
      http: o.http,
      dns: o.dns,
      ssh: o.ssh,
      notes: o.notes,
      mitre: o.mitre,
      signature_id: o.signature_id,
    },
    evtId
  );

  return {
    id: evtId,
    timestamp: o.ts,
    src_ip,
    dst_ip,
    src_port: sp,
    dst_port: dp,
    protocol: proto,
    verdict: verdict as SOCEvent['verdict'],
    attack_type,
    confidence,
    source_engine: o.source_engine || 'Zeek+ML',
    community_id: communityId(src_ip, sp, dst_ip, dp, proto),
    raw_log: raw,
    action_taken: o.action_taken,
    source: 'mock',
  };
};

// ---------- Generators ----------
const events: SOCEvent[] = [];

// Track key event IDs for cross-day correlation
const keyEventIds: Record<string, string[]> = {
  day1_recon: [],
  day2_probe: [],
  day3_scan: [],
};

/* =====================================================================
 * BENIGN BASELINE — every day 00:00 → 23:59, ~250 events/day with a
 * diurnal sine wave (low overnight, peak around 10:00–16:00). This gives
 * the Traffic & Alerts chart a natural rolling shape so attack spikes
 * read as anomalies, not as the only data on the chart.
 * ===================================================================== */
for (let day = 20; day <= 24; day++) {
  const dayBase = new Date(`2026-04-${String(day).padStart(2, '0')}T00:00:00+07:00`).getTime();
  // Walk the whole day in ~5-min steps; accept/reject each step based on
  // a diurnal probability curve so density follows business hours.
  for (let t = dayBase; t < dayBase + 24 * 3600_000; t += between(180_000, 360_000)) {
    const ts = new Date(t);
    const hour = ts.getHours() + ts.getMinutes() / 60;
    // Sine-shaped probability: ~0.15 at 03:00, ~0.95 at 13:00.
    const diurnal = 0.55 + 0.45 * Math.sin(((hour - 7) / 24) * Math.PI * 2 - Math.PI / 2);
    if (rand() > diurnal) continue;

    const isEgress = rand() < 0.7;
    if (isEgress) {
      const port = pick([443, 443, 443, 443, 443, 80, 80, 53]);
      const fqdn = pick(EGRESS_FQDNS);
      const src = pick(LAB_HOSTS.filter((ip) => ip !== ATTACKER_IP));
      events.push(
        mk({
          ts,
          src_ip: src,
          dst_ip: GATEWAY,
          dst_port: port,
          protocol: port === 53 ? 'UDP' : 'TCP',
          attack_type: port === 53 ? 'Internal DNS Query' : 'Normal HTTPS / Web Browsing',
          source_engine: 'Zeek',
          http:
            port === 80 || port === 443
              ? {
                  method: pick(['GET', 'GET', 'GET', 'POST']),
                  host: fqdn,
                  uri: pick(['/', '/index.html', '/api/v1/users', '/static/app.js', '/favicon.ico', '/assets/main.css']),
                  status: pick([200, 200, 200, 200, 304, 301]),
                }
              : undefined,
          dns:
            port === 53
              ? { query: fqdn, rcode: 'NOERROR', answers: [`${between(1, 255)}.${between(0, 255)}.${between(0, 255)}.${between(1, 254)}`] }
              : undefined,
          notes: 'Routine egress traffic — auto-classified BENIGN by ML model.',
        })
      );
    } else {
      const isDns = rand() < 0.55;
      events.push(
        mk({
          ts,
          src_ip: pick(LAB_HOSTS.filter((ip) => ip !== ATTACKER_IP && ip !== DNS_SERVER)),
          dst_ip: isDns ? DNS_SERVER : FILE_SERVER,
          dst_port: isDns ? 53 : 445,
          protocol: isDns ? 'UDP' : 'TCP',
          attack_type: isDns ? 'Internal DNS Query' : 'SMB File Share',
          source_engine: 'Zeek',
          dns: isDns ? { query: pick(['intranet.lab', 'fileserver.lab', 'gw.lab']), rcode: 'NOERROR' } : undefined,
          notes: isDns ? 'Internal name resolution.' : 'Internal SMB share access.',
        })
      );
    }
  }
}

/* =====================================================================
 * DAY 1 — 2026-04-20  RECONNAISSANCE
 *   Story: attacker host 192.168.168.23 first appears on the LAN.
 *   - 6 ICMP echo-requests sweeping nearby hosts (T1018)
 *   - 1 HTTPS look at gateway web UI
 * ===================================================================== */
{
  const base = new Date('2026-04-20T09:14:00+07:00').getTime();
  for (let i = 0; i < 6; i++) {
    const target = `192.168.168.${between(20, 50)}`;
    const ev = mk({
      ts: new Date(base + i * 18_000),
      src_ip: ATTACKER_IP,
      dst_ip: target,
      protocol: 'ICMP',
      dst_port: 0,
      src_port: 0,
      attack_type: 'ICMP Echo Request',
      verdict: 'BENIGN',
      confidence: 0.12,
      source_engine: 'Zeek',
      mitre: { tactic: 'Reconnaissance', technique: 'Remote System Discovery', id: 'T1018' },
      notes: `New device ${ATTACKER_IP} pinging neighbour ${target}. By itself benign, but the host has never been seen before — flag for context.`,
    });
    events.push(ev);
    keyEventIds.day1_recon.push(ev.id);
  }
  const ev = mk({
    ts: new Date(base + 600_000),
    src_ip: ATTACKER_IP,
    dst_ip: GATEWAY,
    dst_port: 443,
    protocol: 'TCP',
    attack_type: 'HTTPS Connection',
    verdict: 'BENIGN',
    confidence: 0.18,
    source_engine: 'Zeek',
    http: { method: 'GET', host: 'pfsense.lab', uri: '/index.php', status: 200, ua: USER_AGENTS[0] },
    notes: 'First HTTPS request from the new host to the pfSense management UI — looking but not authenticating.',
  });
  events.push(ev);
  keyEventIds.day1_recon.push(ev.id);
}

/* =====================================================================
 * DAY 2 — 2026-04-21  LIGHT TCP PROBING (first SUSPICIOUS verdict)
 *   Late-night connect attempts to common admin ports — Zeek REJ.
 * ===================================================================== */
{
  const base = new Date('2026-04-21T22:47:00+07:00').getTime();
  const probedPorts = [22, 80, 443, 8080, 3389];
  probedPorts.forEach((port, i) => {
    const ev = mk({
      ts: new Date(base + i * 12_000),
      src_ip: ATTACKER_IP,
      dst_ip: GATEWAY,
      dst_port: port,
      protocol: 'TCP',
      attack_type: 'Suspicious Connection Attempt',
      verdict: 'SUSPICIOUS',
      confidence: round2(0.58 + rand() * 0.12),
      source_engine: 'Zeek',
      signature_id: 2210045,
      related: keyEventIds.day1_recon.slice(0, 2),
      mitre: { tactic: 'Reconnaissance', technique: 'Network Service Discovery', id: 'T1046' },
      notes: `Same source ${ATTACKER_IP} that ICMP-swept yesterday is now probing ${port}/tcp — connection rejected (REJ). Pattern matches reconnaissance staging.`,
    });
    events.push(ev);
    keyEventIds.day2_probe.push(ev.id);
  });
}

/* =====================================================================
 * DAY 3 — 2026-04-22  TARGETED PORTSCAN (first Suricata ALERT)
 *   80 SYN probes to top ports in 2 minutes → Suricata sig 2010935.
 * ===================================================================== */
{
  // Spread the 80-port scan over ~10 minutes so it shows as a recognisable
  // burst (not a single 1-pixel spike that nukes the chart axis).
  const base = new Date('2026-04-22T02:18:00+07:00').getTime();
  const ports = [21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 8080, 8443];
  const SCAN_SPAN_MS = 10 * 60_000;
  for (let i = 0; i < 80; i++) {
    const port = pick(ports);
    const isAlert = i > 15;
    const ts = new Date(base + Math.floor((i / 80) * SCAN_SPAN_MS) + between(-1500, 1500));
    const ev = mk({
      ts,
      src_ip: ATTACKER_IP,
      dst_ip: GATEWAY,
      dst_port: port,
      protocol: 'TCP',
      attack_type: 'PortScan',
      verdict: isAlert ? 'ALERT' : 'SUSPICIOUS',
      confidence: isAlert ? round2(0.86 + rand() * 0.1) : round2(0.62 + rand() * 0.08),
      source_engine: 'Suricata+Zeek+ML',
      signature_id: 2010935,
      related: i < 3 ? keyEventIds.day2_probe : undefined,
      mitre: { tactic: 'Reconnaissance', technique: 'Active Scanning: Scanning IP Blocks', id: 'T1595.001' },
      notes:
        i === 16
          ? 'Suricata threshold reached — 16 SYN probes from same source in <30s. Promoting to ALERT.'
          : 'Part of a horizontal port-scan burst from .23.',
    });
    events.push(ev);
    if (i === 0 || i === 40 || i === 79) keyEventIds.day3_scan.push(ev.id);
  }
}

/* =====================================================================
 * DAY 4 — 2026-04-23  EXTERNAL DDoS BURST (NOT from .23)
 *   Spoofed source pool hammers the gateway briefly. Auto-mitigated.
 *   Purpose: populate the DDoS class on the dashboard.
 * ===================================================================== */
{
  // Spread the 220-packet flood over ~30 minutes with a bell-shaped envelope
  // (ramp-up, peak, mitigation tail). Reads as a real DDoS incident on the
  // chart instead of a 1-pixel spike. Reduce volume slightly to 160 events.
  const base = new Date('2026-04-23T19:42:00+07:00').getTime();
  const FLOOD_SPAN_MS = 30 * 60_000;
  const FLOOD_COUNT = 160;
  const spoofPool = Array.from({ length: 60 }, () => `${between(11, 223)}.${between(0, 255)}.${between(0, 255)}.${between(1, 254)}`);
  for (let i = 0; i < FLOOD_COUNT; i++) {
    // Bell envelope (cos²): density highest in the middle of the window.
    const u = i / (FLOOD_COUNT - 1); // 0 → 1
    const skew = 0.5 - 0.5 * Math.cos(u * Math.PI); // smooth 0→1
    const offset = Math.floor(skew * FLOOD_SPAN_MS) + between(-4000, 4000);
    const ts = new Date(base + offset);
    events.push(
      mk({
        ts,
        src_ip: pick(spoofPool),
        dst_ip: GATEWAY,
        dst_port: 80,
        protocol: 'TCP',
        attack_type: 'DDoS',
        verdict: 'ALERT',
        confidence: round2(0.9 + rand() * 0.08),
        source_engine: 'Suricata+Zeek+ML',
        signature_id: 2024897,
        action_taken: i === FLOOD_COUNT - 1 ? 'auto_blocked_pfsense_alias' : undefined,
        mitre: { tactic: 'Impact', technique: 'Network Denial of Service', id: 'T1498' },
        notes:
          i === 0
            ? 'SYN flood detected from a wide spoofed source pool — typical low-rate distributed DoS. Unrelated to internal recon actor.'
            : i === FLOOD_COUNT - 1
            ? 'Mitigation triggered: pfSense rate-limit + temporary alias block applied.'
            : undefined,
      })
    );
  }
}

/* =====================================================================
 * DAY 5 — 2026-04-24  COOL-DOWN (.23 silent — only 2 SSH probes)
 *   Classic APT staging: actor goes quiet right before striking.
 * ===================================================================== */
{
  const base = new Date('2026-04-24T16:31:00+07:00').getTime();
  for (let i = 0; i < 2; i++) {
    events.push(
      mk({
        ts: new Date(base + i * 240_000),
        src_ip: ATTACKER_IP,
        dst_ip: GATEWAY,
        dst_port: 22,
        protocol: 'TCP',
        attack_type: 'SSH Connection Attempt',
        verdict: 'SUSPICIOUS',
        confidence: 0.55,
        source_engine: 'Zeek',
        signature_id: 2003068,
        related: [...keyEventIds.day3_scan],
        ssh: { client_version: 'SSH-2.0-OpenSSH_9.6', auth_attempt: false },
        mitre: { tactic: 'Credential Access', technique: 'Brute Force', id: 'T1110' },
        notes:
          'Same actor (.23) that ran the port-scan 2 days ago is now testing SSH. Volume is intentionally low — staging behaviour. Expect escalation.',
      })
    );
  }
}

// ---------- Sort newest-first ----------
events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

export const historicalEvents: SOCEvent[] = events;

/**
 * Build the APT timeline for a given attacker IP — used by AI tools to
 * craft the "this IP has been profiling us for 5 days" narrative.
 */
export const getAttackerTimeline = (ip: string) => {
  return historicalEvents
    .filter((e) => e.src_ip === ip)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((e) => ({
      ts: e.timestamp.toISOString(),
      day: e.timestamp.toISOString().slice(0, 10),
      action: e.attack_type,
      verdict: e.verdict,
      confidence: e.confidence,
      target: `${e.dst_ip}:${e.dst_port}`,
    }));
};
