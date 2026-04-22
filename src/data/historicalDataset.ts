/**
 * AI-SOC HISTORICAL DATASET — 2026-04-20 → 2026-04-24
 * ----------------------------------------------------------------------------
 * Hand-crafted, deterministic dataset designed to be **AI-analyzable**.
 *
 * NETWORK TOPOLOGY (matches lab):
 *
 *     ATTACKER (192.168.168.23)                   DMZ (172.16.16.0/24)
 *           │                                     ┌─ NIDS  172.16.16.20
 *           │  hits 192.168.168.254:80           │  (Suricata + Zeek tap)
 *           ▼                                     │
 *     ┌──────────────┐  DNAT 80→172.16.16.30:80  │
 *     │   pfSense    │ ────────────────────────►  └─ WEB  172.16.16.30
 *     │ WAN .254     │                            (real web server)
 *     │ DMZ .254     │
 *     │ SOC .254     │ ──► SOC (10.10.10.0/24) ─► AI Server 10.10.10.20
 *     └──────────────┘
 *
 * KEY NAT FACT (this drives the schema below):
 *   The Kali attacker only "sees" 192.168.168.254:80. pfSense performs
 *   inbound DNAT (port-forward) to 172.16.16.30:80 WITHOUT SNAT, so the
 *   client source IP is preserved.
 *
 *   The NIDS sensor sits on the DMZ tap (post-DNAT), so every alert it
 *   produces shows:
 *       src_ip  = 192.168.168.23   (attacker, preserved by pfSense)
 *       dst_ip  = 172.16.16.30     (translated DMZ IP, after DNAT)
 *
 *   To stay faithful to the auditor's mental model we ALSO embed the
 *   pre-DNAT destination ("the IP the attacker actually typed") inside
 *   each raw_log under `nat.pre_dnat_dst_ip` = 192.168.168.254. The
 *   Event Inspector renders it next to the Destination field.
 *
 * Source IP rules:
 *   - For inbound traffic (request): src = external IP (e.g. .23 / spoofed)
 *   - For response traffic: src = web server 172.16.16.30 → external client
 *     (so the dashboard naturally shows BOTH directions)
 *   - For internal lateral: src/dst inside same zone
 *
 * Attack class coverage (so all 11 ML classes appear at least lightly):
 *   - BENIGN, ICMP Recon, Suspicious Connection, PortScan, DDoS,
 *     SSH-Patator, FTP-Patator, Web Attack, DoS slowloris,
 *     DoS Slowhttptest, DoS Hulk, DoS GoldenEye, Bot
 *   Heavy hitters (PortScan day-3, DDoS day-4) come from the original
 *   storyline. Other classes are seeded as small isolated incidents on
 *   different days so the donut shows variety (≤5 events each).
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

// DMZ zone
const DMZ_GW = '172.16.16.254';
const NIDS_HOST = '172.16.16.20';
const WEB_SERVER = '172.16.16.30';

// SOC zone
const SOC_GW = '10.10.10.254';
const AI_SERVER = '10.10.10.20';

// External / WAN-side
const PFSENSE_WAN = '192.168.168.254';
const EXTERNAL_HOSTS = Array.from({ length: 11 }, (_, i) => `192.168.168.${20 + i}`); // .20 → .30 (incl. attacker .23)
const EXTERNAL_BENIGN_HOSTS = EXTERNAL_HOSTS.filter((ip) => ip !== ATTACKER_IP);

// External services seen via NAT egress
const EGRESS_FQDNS = [
  'www.google.com', 'fonts.googleapis.com', 'github.com', 'raw.githubusercontent.com',
  'registry.npmjs.org', 'pypi.org', 'security.ubuntu.com', 'archive.ubuntu.com',
  'cdn.cloudflare.com', 'api.openai.com', 'one.one.one.one',
];
const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/124.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/605.1',
  'curl/8.4.0',
  'apt-http/2.4.10',
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
  const parts = ip.split('.').map((n) => parseInt(n, 10));
  const a = (parts[2] || 0).toString(16).padStart(2, '0');
  const b = (parts[3] || 0).toString(16).padStart(2, '0');
  const c = ((parts[3] || 0) ^ 0x5a).toString(16).padStart(2, '0');
  return `52:54:00:${a}:${b}:${c}`;
};

const isPrivate = (ip: string) =>
  ip.startsWith('172.16.16.') || ip.startsWith('10.10.10.') || ip.startsWith('192.168.168.');

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
  signature_id?: number;
  mitre?: { tactic: string; technique: string; id: string };
  related?: string[];
  http?: { method: string; host: string; uri: string; status?: number; ua?: string };
  dns?: { query: string; rcode: string; answers?: string[] };
  ssh?: { client_version?: string; auth_attempt?: boolean };
  notes?: string;
};

const buildRawLog = (o: PayloadOpts, evtId: string) => {
  const fid = flowId();
  const cid = communityId(o.src_ip, o.src_port, o.dst_ip, o.dst_port, o.proto);
  const ts = o.ts.toISOString();
  // "Trusted" = inside pfSense (DMZ + SOC). Anything on the WAN segment
  // (192.168.168.0/24) is treated as external for direction + NAT logic
  // because it sits OUTSIDE pfSense and must traverse the firewall to
  // reach the internal services.
  const isTrusted = (ip: string) => ip.startsWith('172.16.16.') || ip.startsWith('10.10.10.');
  const isWanSide = (ip: string) => ip.startsWith('192.168.168.') || !isPrivate(ip);
  const srcExternal = !isTrusted(o.src_ip);
  const dstExternal = !isTrusted(o.dst_ip);
  const isInboundViaNat = isWanSide(o.src_ip) && o.dst_ip.startsWith('172.16.16.');
  const direction = isInboundViaNat
    ? 'inbound_via_nat'
    : srcExternal && dstExternal
    ? 'wan_to_wan'
    : !srcExternal && dstExternal
    ? 'outbound_via_nat'
    : !srcExternal && !dstExternal
    ? 'lateral'
    : 'inbound';

  const baseBytes = o.verdict === 'ALERT' ? between(120, 1800) : between(280, 4200);
  const orig_pkts = o.verdict === 'ALERT' ? between(1, 4) : between(3, 22);
  const resp_pkts = o.verdict === 'ALERT' ? between(0, 2) : between(2, 18);
  const orig_bytes = baseBytes;
  const resp_bytes = o.verdict === 'ALERT' ? between(0, 240) : between(400, 8800);
  const duration_s = round2(o.verdict === 'ALERT' ? rand() * 0.4 : rand() * 12 + 0.2);

  const conn_state = zeekConnState(o.verdict);

  const suricata =
    o.verdict === 'ALERT' || o.verdict === 'SUSPICIOUS'
      ? {
          event_type: 'alert',
          alert: {
            action: 'allowed',
            gid: 1,
            signature_id: o.signature_id ?? between(2000000, 2999999),
            rev: 3,
            signature: `ET ${o.verdict === 'ALERT' ? 'POLICY' : 'INFO'} ${o.attack_type}`,
            category: o.attack_type.toLowerCase().includes('scan')
              ? 'Attempted Information Leak'
              : o.attack_type.toLowerCase().includes('ddos') || o.attack_type.toLowerCase().includes('dos')
              ? 'Network Trojan was Detected'
              : o.attack_type.toLowerCase().includes('web')
              ? 'Web Application Attack'
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

  const zeek = {
    ts: o.ts.getTime() / 1000,
    uid: `C${Array.from({ length: 17 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(rand() * 62)]).join('')}`,
    'id.orig_h': o.src_ip,
    'id.orig_p': o.src_port,
    'id.resp_h': o.dst_ip,
    'id.resp_p': o.dst_port,
    proto: o.proto.toLowerCase(),
    service: o.dst_port === 80 ? 'http' : o.dst_port === 53 ? 'dns' : o.dst_port === 22 ? 'ssh' : o.dst_port === 21 ? 'ftp' : '-',
    duration: duration_s,
    orig_bytes,
    resp_bytes,
    conn_state,
    local_orig: isPrivate(o.src_ip),
    local_resp: isPrivate(o.dst_ip),
    missed_bytes: 0,
    history: o.verdict === 'ALERT' ? 'S' : 'ShADadFf',
    orig_pkts,
    orig_ip_bytes: orig_bytes + orig_pkts * 40,
    resp_pkts,
    resp_ip_bytes: resp_bytes + resp_pkts * 40,
  };

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
            { class: 'BENIGN', prob: round2(1 - o.confidence - 0.02) },
            { class: 'BruteForce', prob: round2(rand() * 0.04) },
          ]
        : [],
  };

  const mitre =
    o.mitre ??
    (o.attack_type === 'PortScan'
      ? { tactic: 'Reconnaissance', technique: 'Active Scanning: Scanning IP Blocks', id: 'T1595.001' }
      : o.attack_type === 'DDoS'
      ? { tactic: 'Impact', technique: 'Network Denial of Service', id: 'T1498' }
      : o.attack_type.includes('SSH')
      ? { tactic: 'Credential Access', technique: 'Brute Force', id: 'T1110' }
      : o.attack_type.includes('FTP')
      ? { tactic: 'Credential Access', technique: 'Brute Force: Password Guessing', id: 'T1110.001' }
      : o.attack_type.includes('Web')
      ? { tactic: 'Initial Access', technique: 'Exploit Public-Facing Application', id: 'T1190' }
      : o.attack_type.includes('DoS')
      ? { tactic: 'Impact', technique: 'Endpoint Denial of Service', id: 'T1499' }
      : o.attack_type === 'Bot'
      ? { tactic: 'Command and Control', technique: 'Application Layer Protocol', id: 'T1071' }
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
      src: { ip: o.src_ip, port: o.src_port, mac: macFor(o.src_ip), zone: srcExternal ? 'external/wan' : o.src_ip.startsWith('172.16.16.') ? 'dmz' : o.src_ip.startsWith('10.10.10.') ? 'soc' : 'wan-edge' },
      dst: { ip: o.dst_ip, port: o.dst_port, mac: macFor(o.dst_ip), zone: dstExternal ? 'external/wan' : o.dst_ip.startsWith('172.16.16.') ? 'dmz' : o.dst_ip.startsWith('10.10.10.') ? 'soc' : 'wan-edge' },
      network: {
        protocol: o.proto,
        transport: o.proto.toLowerCase(),
        bytes: orig_bytes + resp_bytes,
        packets: orig_pkts + resp_pkts,
        nat_translated: srcExternal && o.dst_ip.startsWith('172.16.16.'),
      },
      // NAT context — pfSense did inbound DNAT (port forward) without SNAT.
      // The attacker only ever saw 192.168.168.254:<dport>; NIDS sees the
      // post-DNAT internal IP. We surface BOTH so analysts can correlate
      // pfSense firewall logs with NIDS alerts.
      ...(srcExternal && o.dst_ip.startsWith('172.16.16.')
        ? {
            nat: {
              dnat: true,
              snat: false,
              pre_dnat_dst_ip: PFSENSE_WAN,
              pre_dnat_dst_port: o.dst_port,
              post_dnat_dst_ip: o.dst_ip,
              post_dnat_dst_port: o.dst_port,
              pfsense_rule: `WAN→DMZ port-forward ${o.dst_port}/tcp`,
              note: `Attacker dialled ${PFSENSE_WAN}:${o.dst_port}; pfSense translated to ${o.dst_ip}:${o.dst_port}. Source IP preserved (no SNAT inbound).`,
            },
          }
        : {}),
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
            : o.attack_type === 'DDoS' || o.attack_type.includes('DoS')
            ? 'actions-on-objectives'
            : o.attack_type.includes('Patator') || o.attack_type.includes('SSH')
            ? 'weaponization'
            : o.attack_type.includes('Web')
            ? 'exploitation'
            : o.attack_type === 'Bot'
            ? 'command-and-control'
            : 'benign',
      },
      enrichment: {
        geo: srcExternal
          ? { country: pick(['US', 'CN', 'RU', 'NL', 'BR', 'IN']), asn: between(1000, 65000) }
          : { country: 'LAB', asn: 0 },
        threat_intel:
          o.verdict === 'ALERT' && srcExternal
            ? { matched_feeds: ['abuse.ch', 'spamhaus_drop'], reputation: 'malicious' }
            : { matched_feeds: [], reputation: 'unknown' },
      },
      pipeline: { source: 'zeek+suricata+ml', version: '3.4.1', tap: 'pfSense_DMZ_mirror', sensor: NIDS_HOST },
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
  const dp = o.dst_port ?? 80;
  const src_ip = o.src_ip!;
  const dst_ip = o.dst_ip!;
  const verdict = o.verdict || 'BENIGN';
  const attack_type = o.attack_type || 'Normal HTTP Traffic';
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

const keyEventIds: Record<string, string[]> = {
  day1_recon: [],
  day2_probe: [],
  day3_scan: [],
};

/* =====================================================================
 * BENIGN BASELINE — every day, ~250 events/day with diurnal sine wave.
 * Three traffic patterns are interleaved so Source IP shows variety:
 *   (A) Inbound web traffic   : external client .20-.30 → web 172.16.16.30:80
 *   (B) Outbound response     : web 172.16.16.30 → external client (responses)
 *   (C) Internal lateral      : SOC AI (10.10.10.20) ↔ DMZ NIDS (172.16.16.20)
 *   (D) Egress browsing       : DMZ web → external CDN/API
 * ===================================================================== */
for (let day = 20; day <= 24; day++) {
  const dayBase = new Date(`2026-04-${String(day).padStart(2, '0')}T00:00:00+07:00`).getTime();
  for (let t = dayBase; t < dayBase + 24 * 3600_000; t += between(180_000, 360_000)) {
    const ts = new Date(t);
    const hour = ts.getHours() + ts.getMinutes() / 60;
    const diurnal = 0.55 + 0.45 * Math.sin(((hour - 7) / 24) * Math.PI * 2 - Math.PI / 2);
    if (rand() > diurnal) continue;

    const r = rand();
    if (r < 0.45) {
      // (A) Inbound web request: external client → web server
      const client = pick(EXTERNAL_BENIGN_HOSTS);
      events.push(
        mk({
          ts,
          src_ip: client,
          dst_ip: WEB_SERVER,
          src_port: between(30000, 65000),
          dst_port: 80,
          protocol: 'TCP',
          attack_type: 'Normal HTTP / Web Browsing',
          source_engine: 'Zeek',
          http: {
            method: pick(['GET', 'GET', 'GET', 'GET', 'POST']),
            host: 'web.lab.local',
            uri: pick(['/', '/index.html', '/about', '/api/v1/products', '/static/app.js', '/favicon.ico', '/assets/main.css', '/login']),
            status: pick([200, 200, 200, 200, 304, 301]),
          },
          notes: `External client ${client} browsing public web service.`,
        })
      );
    } else if (r < 0.7) {
      // (B) Web server RESPONSE flow: src = web server, dst = external client.
      // Zeek logs both directions of a stateful flow, so this naturally appears.
      const client = pick(EXTERNAL_BENIGN_HOSTS);
      events.push(
        mk({
          ts: new Date(t + between(50, 800)),
          src_ip: WEB_SERVER,
          dst_ip: client,
          src_port: 80,
          dst_port: between(30000, 65000),
          protocol: 'TCP',
          attack_type: 'Web Server Response',
          source_engine: 'Zeek',
          notes: `Web server ${WEB_SERVER} returning content to client ${client}.`,
        })
      );
    } else if (r < 0.85) {
      // (C) Internal lateral: SOC AI ↔ NIDS sensor (log shipping, queries)
      const aiToNids = rand() < 0.5;
      events.push(
        mk({
          ts,
          src_ip: aiToNids ? AI_SERVER : NIDS_HOST,
          dst_ip: aiToNids ? NIDS_HOST : AI_SERVER,
          dst_port: aiToNids ? 9200 : 5044,
          protocol: 'TCP',
          attack_type: aiToNids ? 'Elasticsearch Query' : 'Log Shipper Beat',
          source_engine: 'Zeek',
          notes: aiToNids
            ? 'AI Server querying NIDS Elasticsearch index for recent events.'
            : 'NIDS shipping enriched logs to AI Server (Filebeat/Logstash protocol).',
        })
      );
    } else {
      // (D) Egress: web server reaching external CDN / API for content
      const fqdn = pick(EGRESS_FQDNS);
      events.push(
        mk({
          ts,
          src_ip: WEB_SERVER,
          dst_ip: DMZ_GW,
          dst_port: pick([80, 80, 80, 53]),
          protocol: 'TCP',
          attack_type: 'Outbound CDN/API Call',
          source_engine: 'Zeek',
          http: {
            method: 'GET',
            host: fqdn,
            uri: pick(['/api/health', '/v1/status', '/cdn/lib.js', '/']),
            status: 200,
          },
          notes: `Web server fetching dependency from ${fqdn} via NAT egress.`,
        })
      );
    }
  }
}

/* =====================================================================
 * DAY 1 — 2026-04-20  RECONNAISSANCE
 *   Attacker .23 first appears: ICMP sweep of DMZ + first HTTPS probe.
 * ===================================================================== */
{
  const base = new Date('2026-04-20T09:14:00+07:00').getTime();
  for (let i = 0; i < 6; i++) {
    const target = `172.16.16.${between(20, 50)}`;
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
      notes: `New external host ${ATTACKER_IP} pinging DMZ host ${target}. By itself benign, but the host has never been seen before — flag for context.`,
    });
    events.push(ev);
    keyEventIds.day1_recon.push(ev.id);
  }
  const ev = mk({
    ts: new Date(base + 600_000),
    src_ip: ATTACKER_IP,
    dst_ip: WEB_SERVER,
    dst_port: 80,
    protocol: 'TCP',
    attack_type: 'HTTP Connection',
    verdict: 'BENIGN',
    confidence: 0.18,
    source_engine: 'Zeek',
    http: { method: 'GET', host: 'web.lab.local', uri: '/', status: 200, ua: USER_AGENTS[3] },
    notes: 'First HTTPS request from the new host to the public web service — looking but not authenticating.',
  });
  events.push(ev);
  keyEventIds.day1_recon.push(ev.id);
}

/* =====================================================================
 * DAY 2 — 2026-04-21  LIGHT TCP PROBING (first SUSPICIOUS verdict)
 *   Late-night connect attempts to common admin ports — Zeek REJ.
 *   PLUS: 2 isolated FTP-Patator events (different external IP) for
 *   class coverage.
 * ===================================================================== */
{
  const base = new Date('2026-04-21T22:47:00+07:00').getTime();
  const probedPorts = [22, 80, 8080, 3389, 21];
  probedPorts.forEach((port, i) => {
    const ev = mk({
      ts: new Date(base + i * 12_000),
      src_ip: ATTACKER_IP,
      dst_ip: WEB_SERVER,
      dst_port: port,
      protocol: 'TCP',
      attack_type: 'Suspicious Connection Attempt',
      verdict: 'SUSPICIOUS',
      confidence: round2(0.58 + rand() * 0.12),
      source_engine: 'Zeek',
      signature_id: 2210045,
      related: keyEventIds.day1_recon.slice(0, 2),
      mitre: { tactic: 'Reconnaissance', technique: 'Network Service Discovery', id: 'T1046' },
      notes: `Same source ${ATTACKER_IP} that ICMP-swept yesterday is now probing ${port}/tcp on the web server — connection rejected (REJ).`,
    });
    events.push(ev);
    keyEventIds.day2_probe.push(ev.id);
  });

  // Class-coverage seed: 3 FTP-Patator events from a different opportunist
  const ftpAttacker = '192.168.168.27';
  const ftpBase = new Date('2026-04-21T03:12:00+07:00').getTime();
  for (let i = 0; i < 3; i++) {
    events.push(
      mk({
        ts: new Date(ftpBase + i * 8_000),
        src_ip: ftpAttacker,
        dst_ip: WEB_SERVER,
        dst_port: 21,
        protocol: 'TCP',
        attack_type: 'FTP-Patator',
        verdict: 'ALERT',
        confidence: round2(0.81 + rand() * 0.07),
        source_engine: 'Suricata+Zeek+ML',
        signature_id: 2002383,
        notes: 'Brute-force FTP login attempts from opportunistic scanner — unrelated to .23 actor.',
      })
    );
  }
}

/* =====================================================================
 * DAY 3 — 2026-04-22  TARGETED PORTSCAN (first Suricata ALERT)
 *   80 SYN probes to top ports → Suricata sig 2010935.
 *   PLUS: 3 isolated Web Attack events (SQLi probes) from another IP.
 * ===================================================================== */
{
  const base = new Date('2026-04-22T02:18:00+07:00').getTime();
  const ports = [21, 22, 23, 25, 53, 80, 110, 139, 143, 445, 993, 995, 1433, 3306, 3389, 5432, 8080];
  const SCAN_SPAN_MS = 10 * 60_000;
  for (let i = 0; i < 80; i++) {
    const port = pick(ports);
    const isAlert = i > 15;
    const ts = new Date(base + Math.floor((i / 80) * SCAN_SPAN_MS) + between(-1500, 1500));
    const ev = mk({
      ts,
      src_ip: ATTACKER_IP,
      dst_ip: WEB_SERVER,
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
          : 'Part of horizontal port-scan burst from .23.',
    });
    events.push(ev);
    if (i === 0 || i === 40 || i === 79) keyEventIds.day3_scan.push(ev.id);
  }

  // Class-coverage seed: 4 Web Attack events (SQLi/XSS probes from another IP)
  const webAttacker = '192.168.168.29';
  const webBase = new Date('2026-04-22T14:05:00+07:00').getTime();
  const payloads = [
    "/?id=1' OR '1'='1",
    "/search?q=<script>alert(1)</script>",
    "/page?file=../../etc/passwd",
    "/admin/login.php?user=admin'--",
  ];
  payloads.forEach((uri, i) => {
    events.push(
      mk({
        ts: new Date(webBase + i * 25_000),
        src_ip: webAttacker,
        dst_ip: WEB_SERVER,
        dst_port: 80,
        protocol: 'TCP',
        attack_type: 'Web Attack',
        verdict: 'ALERT',
        confidence: round2(0.84 + rand() * 0.08),
        source_engine: 'Suricata+Zeek+ML',
        signature_id: 2017645,
        http: { method: 'GET', host: 'web.lab.local', uri, status: 403, ua: USER_AGENTS[3] },
        notes: 'OWASP Top-10 payload signature match (SQLi / XSS / LFI). Blocked at web layer.',
      })
    );
  });
}

/* =====================================================================
 * DAY 4 — 2026-04-23  EXTERNAL DDoS BURST (NOT from .23)
 *   Spoofed source pool hammers the DMZ web server briefly.
 *   PLUS: 2 SSH-Patator events (different IP) + 2 DoS slowloris probes.
 * ===================================================================== */
{
  const base = new Date('2026-04-23T19:42:00+07:00').getTime();
  const FLOOD_SPAN_MS = 30 * 60_000;
  const FLOOD_COUNT = 160;
  const spoofPool = Array.from({ length: 60 }, () => `${between(11, 223)}.${between(0, 255)}.${between(0, 255)}.${between(1, 254)}`);
  for (let i = 0; i < FLOOD_COUNT; i++) {
    const u = i / (FLOOD_COUNT - 1);
    const skew = 0.5 - 0.5 * Math.cos(u * Math.PI);
    const offset = Math.floor(skew * FLOOD_SPAN_MS) + between(-4000, 4000);
    const ts = new Date(base + offset);
    events.push(
      mk({
        ts,
        src_ip: pick(spoofPool),
        dst_ip: WEB_SERVER,
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
            ? 'SYN flood detected from a wide spoofed source pool — typical low-rate distributed DoS against the DMZ web server.'
            : i === FLOOD_COUNT - 1
            ? 'Mitigation triggered: pfSense rate-limit + temporary alias block applied.'
            : undefined,
      })
    );
  }

  // Class-coverage: SSH-Patator from another opportunist
  const sshAttacker = '192.168.168.25';
  const sshBase = new Date('2026-04-23T11:20:00+07:00').getTime();
  for (let i = 0; i < 3; i++) {
    events.push(
      mk({
        ts: new Date(sshBase + i * 6_000),
        src_ip: sshAttacker,
        dst_ip: WEB_SERVER,
        dst_port: 22,
        protocol: 'TCP',
        attack_type: 'SSH-Patator',
        verdict: 'ALERT',
        confidence: round2(0.83 + rand() * 0.07),
        source_engine: 'Suricata+Zeek+ML',
        signature_id: 2003068,
        ssh: { client_version: 'SSH-2.0-libssh2_1.10.0', auth_attempt: true },
        notes: 'Repeated failed SSH password attempts — Patator-style brute force.',
      })
    );
  }

  // Class-coverage: DoS slowloris probes
  const slowAttacker = '192.168.168.28';
  const slowBase = new Date('2026-04-23T05:48:00+07:00').getTime();
  for (let i = 0; i < 3; i++) {
    events.push(
      mk({
        ts: new Date(slowBase + i * 90_000),
        src_ip: slowAttacker,
        dst_ip: WEB_SERVER,
        dst_port: 80,
        protocol: 'TCP',
        attack_type: 'DoS slowloris',
        verdict: 'ALERT',
        confidence: round2(0.79 + rand() * 0.08),
        source_engine: 'Suricata+Zeek+ML',
        signature_id: 2018472,
        http: { method: 'GET', host: 'web.lab.local', uri: '/', status: 408 },
        notes: 'Slow HTTP header attack — half-open connections held to exhaust web server pool.',
      })
    );
  }
}

/* =====================================================================
 * DAY 5 — 2026-04-24  COOL-DOWN (.23 silent — only 2 SSH probes)
 *   Classic APT staging.
 *   PLUS: 2 isolated DoS Hulk + 2 Bot beacon events (other IPs) for
 *   class coverage.
 * ===================================================================== */
{
  const base = new Date('2026-04-24T16:31:00+07:00').getTime();
  for (let i = 0; i < 2; i++) {
    events.push(
      mk({
        ts: new Date(base + i * 240_000),
        src_ip: ATTACKER_IP,
        dst_ip: WEB_SERVER,
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

  // Class-coverage: DoS Hulk burst (different IP)
  const hulkAttacker = '192.168.168.26';
  const hulkBase = new Date('2026-04-24T08:14:00+07:00').getTime();
  for (let i = 0; i < 4; i++) {
    events.push(
      mk({
        ts: new Date(hulkBase + i * 4_000),
        src_ip: hulkAttacker,
        dst_ip: WEB_SERVER,
        dst_port: 80,
        protocol: 'TCP',
        attack_type: 'DoS Hulk',
        verdict: 'ALERT',
        confidence: round2(0.82 + rand() * 0.08),
        source_engine: 'Suricata+Zeek+ML',
        signature_id: 2019825,
        http: { method: 'GET', host: 'web.lab.local', uri: `/?cb=${between(1000, 9999)}`, status: 200 },
        notes: 'HTTP cache-buster flood (DoS Hulk pattern).',
      })
    );
  }

  // Class-coverage: Bot C2 beacon (different IP)
  const botAttacker = '192.168.168.30';
  const botBase = new Date('2026-04-24T21:05:00+07:00').getTime();
  for (let i = 0; i < 3; i++) {
    events.push(
      mk({
        ts: new Date(botBase + i * 8_000),
        src_ip: botAttacker,
        dst_ip: WEB_SERVER,
        dst_port: 80,
        protocol: 'TCP',
        attack_type: 'Bot',
        verdict: 'SUSPICIOUS',
        confidence: round2(0.66 + rand() * 0.06),
        source_engine: 'Suricata+Zeek+ML',
        signature_id: 2027865,
        http: { method: 'GET', host: 'web.lab.local', uri: '/api/heartbeat', status: 404, ua: 'python-requests/2.28.0' },
        notes: 'Periodic beacon every ~8s with python-requests UA — typical C2 check-in pattern.',
      })
    );
  }
}

// ---------- Sort newest-first ----------
events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

/* =====================================================================
 * FALSE_POSITIVE SEED — explicit "AI downgraded" events.
 *
 * These represent the value-prop "AI giảm cảnh báo giả": Suricata raised an
 * alert based on a signature, but the AI/ML pipeline correlated Zeek flow
 * context, threat intel, and behavioural baselines and concluded the event
 * is benign noise. We seed them with low confidence and the FALSE_POSITIVE
 * verdict from the start so the raw_log Suricata block is consistent.
 *
 * Mix of common SOC false positives:
 *  - Vulnerability scanner from a known internal monitoring host
 *  - Search-engine crawler hitting weird URLs
 *  - Misconfigured client probing many ports (NOT the attacker)
 *  - Antivirus update beacon flagged as Bot
 *  - Health-check that looks like SSH brute force
 * ===================================================================== */
{
  const fpSamples: Array<{
    day: number; hour: number; minute: number;
    src: string; dst: string; port: number;
    attack_type: string; sig: number; confidence: number;
    notes: string; http?: PayloadOpts['http']; ssh?: PayloadOpts['ssh'];
  }> = [
    // Day 20 — many false positives (showcase volume)
    { day: 20, hour: 3, minute: 14, src: '40.83.92.17', dst: WEB_SERVER, port: 80, attack_type: 'Web Attack', sig: 2017645, confidence: 0.34,
      notes: 'AI downgrade — Bingbot crawler hitting /robots.txt with unusual UA. Threat intel: clean. ML class BENIGN runner-up 0.71.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/robots.txt', status: 200, ua: 'Mozilla/5.0 (compatible; bingbot/2.0)' } },
    { day: 20, hour: 9, minute: 42, src: '74.125.180.12', dst: WEB_SERVER, port: 80, attack_type: 'Bot', sig: 2027865, confidence: 0.28,
      notes: 'AI downgrade — Googlebot periodic crawl, validated reverse DNS to googlebot.com. Behavioural baseline: matches known crawler pattern.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/sitemap.xml', status: 200, ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' } },
    { day: 20, hour: 14, minute: 18, src: '52.96.10.44', dst: WEB_SERVER, port: 80, attack_type: 'PortScan', sig: 2010935, confidence: 0.31,
      notes: 'AI downgrade — Office365 connectivity check, single SYN to port 80. Confirmed Microsoft ASN 8075.' },
    { day: 20, hour: 21, minute: 7, src: '185.199.108.153', dst: WEB_SERVER, port: 80, attack_type: 'DoS slowloris', sig: 2018472, confidence: 0.36,
      notes: 'AI downgrade — Github Pages CDN keep-alive, long header but matches CDN profile. Zeek: SF state, normal completion.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/', status: 200, ua: 'Mozilla/5.0 GitHub-Camo' } },

    // Day 21
    { day: 21, hour: 6, minute: 35, src: '157.55.39.85', dst: WEB_SERVER, port: 80, attack_type: 'Web Attack', sig: 2017645, confidence: 0.29,
      notes: 'AI downgrade — Bing crawler probing 404 paths after sitemap update. Threat intel clean.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/old-page.html', status: 404, ua: 'Mozilla/5.0 (compatible; bingbot/2.0)' } },
    { day: 21, hour: 11, minute: 52, src: '13.107.42.14', dst: WEB_SERVER, port: 22, attack_type: 'SSH-Patator', sig: 2003068, confidence: 0.33,
      notes: 'AI downgrade — Microsoft Defender for Cloud Apps health probe. ML detected single connection, not brute-force pattern.',
      ssh: { client_version: 'SSH-2.0-MS-Defender-Probe', auth_attempt: false } },
    { day: 21, hour: 16, minute: 28, src: '142.250.80.46', dst: WEB_SERVER, port: 80, attack_type: 'Bot', sig: 2027865, confidence: 0.27,
      notes: 'AI downgrade — Google Safe Browsing scanner. Periodic but expected; reverse DNS validated.',
      http: { method: 'HEAD', host: 'web.lab.local', uri: '/', status: 200, ua: 'Mozilla/5.0 (compatible; Google-Safety)' } },
    { day: 21, hour: 19, minute: 40, src: '23.21.117.230', dst: WEB_SERVER, port: 80, attack_type: 'DoS Hulk', sig: 2019825, confidence: 0.38,
      notes: 'AI downgrade — AWS health check from registered Route53 monitor. Cache-control header normal.' },

    // Day 22 (PortScan day — extra FPs to balance the scan alerts)
    { day: 22, hour: 8, minute: 12, src: '199.59.243.222', dst: WEB_SERVER, port: 80, attack_type: 'Web Attack', sig: 2017645, confidence: 0.32,
      notes: 'AI downgrade — Yandex crawler hitting /admin (404). Single request, not brute force pattern.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/admin', status: 404, ua: 'Mozilla/5.0 (compatible; YandexBot/3.0)' } },
    { day: 22, hour: 17, minute: 50, src: '40.114.177.156', dst: WEB_SERVER, port: 21, attack_type: 'FTP-Patator', sig: 2002383, confidence: 0.35,
      notes: 'AI downgrade — Internal Azure backup agent attempting FTP fallback after FTPS timeout. Source confirmed in allowlist.' },
    { day: 22, hour: 22, minute: 5, src: '54.230.97.85', dst: WEB_SERVER, port: 80, attack_type: 'DoS slowloris', sig: 2018472, confidence: 0.31,
      notes: 'AI downgrade — CloudFront edge keep-alive. Long-lived connection is expected behaviour for CDN.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/api/v1/products', status: 200, ua: 'Amazon CloudFront' } },

    // Day 23 (DDoS day — show FPs from other vectors)
    { day: 23, hour: 9, minute: 22, src: '8.8.4.4', dst: WEB_SERVER, port: 53, attack_type: 'Bot', sig: 2027865, confidence: 0.25,
      notes: 'AI downgrade — DNS resolver health check. Validated source = Google Public DNS.' },
    { day: 23, hour: 14, minute: 40, src: '20.42.65.92', dst: WEB_SERVER, port: 80, attack_type: 'DoS GoldenEye', sig: 2019826, confidence: 0.34,
      notes: 'AI downgrade — Pingdom external uptime monitor with high frequency probes. Account verified.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/health', status: 200, ua: 'Pingdom.com_bot_version_1.4' } },
    { day: 23, hour: 20, minute: 14, src: '104.131.14.231', dst: WEB_SERVER, port: 80, attack_type: 'PortScan', sig: 2010935, confidence: 0.30,
      notes: 'AI downgrade — Shodan scanner (research). Public scanner, not part of an attack chain. Threat intel: research/educational.' },

    // Day 24
    { day: 24, hour: 5, minute: 17, src: '34.102.136.180', dst: WEB_SERVER, port: 80, attack_type: 'Web Attack', sig: 2017645, confidence: 0.33,
      notes: 'AI downgrade — Google Lighthouse audit triggered by webmaster. Behavioural pattern matches periodic site audit.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/', status: 200, ua: 'Mozilla/5.0 Chrome-Lighthouse' } },
    { day: 24, hour: 12, minute: 45, src: '64.62.197.79', dst: WEB_SERVER, port: 80, attack_type: 'PortScan', sig: 2010935, confidence: 0.32,
      notes: 'AI downgrade — Censys scanner (academic research). Single SYN, no follow-up. Whitelisted ASN.' },
    { day: 24, hour: 18, minute: 33, src: '40.77.167.42', dst: WEB_SERVER, port: 80, attack_type: 'DoS Hulk', sig: 2019825, confidence: 0.37,
      notes: 'AI downgrade — Bing site indexing burst after sitemap submission. Pattern matches scheduled crawl, not attack.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/', status: 200, ua: 'Mozilla/5.0 (compatible; bingbot/2.0)' } },
    { day: 24, hour: 23, minute: 8, src: '17.142.150.10', dst: WEB_SERVER, port: 80, attack_type: 'Bot', sig: 2027865, confidence: 0.26,
      notes: 'AI downgrade — Apple bot validating App Site Association file. Reverse DNS confirms apple.com.',
      http: { method: 'GET', host: 'web.lab.local', uri: '/.well-known/apple-app-site-association', status: 200, ua: 'apple-bot/1.0' } },
  ];

  fpSamples.forEach((s) => {
    const ts = new Date(`2026-04-${String(s.day).padStart(2, '0')}T${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}+07:00`);
    events.push(
      mk({
        ts,
        src_ip: s.src,
        dst_ip: s.dst,
        dst_port: s.port,
        protocol: 'TCP',
        attack_type: s.attack_type,
        verdict: 'FALSE_POSITIVE',
        confidence: s.confidence,
        source_engine: 'Suricata+Zeek+ML',
        signature_id: s.sig,
        http: s.http,
        ssh: s.ssh,
        notes: s.notes,
      })
    );
  });
}

// Re-sort after adding FP samples
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
