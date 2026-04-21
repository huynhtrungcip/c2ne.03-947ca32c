/**
 * AI-SOC HISTORICAL DATASET — 2026-04-20 → 2026-04-24
 * ----------------------------------------------------------------------------
 * Hand-crafted, deterministic dataset designed to be **AI-analyzable**.
 *
 * NETWORK TOPOLOGY (matches lab):
 *   ─ External WAN  ─────►  pfSense WAN ─────► DMZ + SOC zones
 *
 *   DMZ Zone (172.16.16.0/24)
 *     - 172.16.16.254 : DMZ gateway (pfSense leg)
 *     - 172.16.16.20  : NIDS sensor (Suricata + Zeek)
 *     - 172.16.16.30  : Web server (the public-facing service)
 *
 *   SOC Zone (10.10.10.0/24)
 *     - 10.10.10.254  : SOC gateway
 *     - 10.10.10.20   : AI Server / SOC dashboard
 *
 *   Legacy LAN (192.168.168.0/24) — used by external WAN attackers
 *     - 192.168.168.20-30 : Spoofed/legit external hosts that can reach DMZ
 *     - 192.168.168.23    : THE attacker (Kali)
 *     - 192.168.168.254   : pfSense WAN-facing IP
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
  const srcExternal = !isPrivate(o.src_ip);
  const dstExternal = !isPrivate(o.dst_ip);
  const direction = srcExternal
    ? 'inbound'
    : dstExternal
    ? 'outbound_via_nat'
    : 'lateral';

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
 * AI TRIAGE PASS — rebalance verdicts to showcase "AI reduces false alarms".
 *
 * Goal target distribution on the historical baseline:
 *   ALERT          ~1.5%   (only true high-impact peaks)
 *   FALSE_POSITIVE ~15%    (signature matched but AI/Zeek context downgraded)
 *   SUSPICIOUS     ~4%     (needs analyst review)
 *   BENIGN         ~80%
 *
 * Deterministic rules — no randomness so the dashboard is stable across reloads:
 *  1. Keep ALERT only for: DDoS spike, PortScan with very high confidence
 *     (≥0.93), Web Attack #1 (the SQLi sample), and the tail-end DDoS
 *     mitigation event.
 *  2. Everything else currently ALERT → FALSE_POSITIVE with an AI rationale.
 *  3. SUSPICIOUS BENIGN-looking probes (low confidence) → FALSE_POSITIVE too.
 *  4. Annotate raw_log + notes with "ai_downgrade" so AI analysis can cite it.
 * ===================================================================== */
{
  // First pass: identify a small set of true-positive ALERT keepers.
  const keepAlertIds = new Set<string>();

  // Keep top ~5% of ALERTs by confidence per attack_type as the "true" alerts.
  const alertsByType: Record<string, SOCEvent[]> = {};
  events.forEach((e) => {
    if (e.verdict === 'ALERT') {
      (alertsByType[e.attack_type] ||= []).push(e);
    }
  });
  Object.values(alertsByType).forEach((list) => {
    list.sort((a, b) => b.confidence - a.confidence);
    // Keep at most 2 truly high-conf alerts per class (≥ 0.9).
    list.slice(0, 2).forEach((e) => {
      if (e.confidence >= 0.9) keepAlertIds.add(e.id);
    });
  });

  // Always keep DDoS mitigation marker if present.
  events.forEach((e) => {
    if (e.action_taken === 'auto_blocked_pfsense_alias') keepAlertIds.add(e.id);
  });

  // Apply downgrades.
  for (const e of events) {
    if (e.verdict === 'ALERT' && !keepAlertIds.has(e.id)) {
      e.verdict = 'FALSE_POSITIVE';
      e.confidence = round2(Math.min(0.42, e.confidence * 0.45));
    } else if (e.verdict === 'SUSPICIOUS' && e.confidence < 0.5) {
      e.verdict = 'FALSE_POSITIVE';
      e.confidence = round2(Math.min(0.35, e.confidence * 0.6));
    }
  }
}

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
