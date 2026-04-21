/**
 * AI-SOC HISTORICAL DATASET — 2026-04-20 → 2026-04-24 (5 days before live demo)
 * ----------------------------------------------------------------------------
 * Deterministic, hand-crafted dataset that tells a story:
 *
 *   THE APT STORY
 *   --------------
 *   A single attacker — IP 192.168.168.23 — slowly profiles the lab network
 *   over 5 days. Every other host in 192.168.168.20-50 produces only
 *   benign LAN traffic (browsing, DNS, NTP, package updates).
 *
 *   Day 1 (20/04) — Passive presence: arrives on the network, ICMP sweeps a
 *                   handful of hosts, looks innocent.
 *   Day 2 (21/04) — Light TCP probing: connects to 22/80/443 on the gateway,
 *                   first SUSPICIOUS verdict from Zeek (REJ/RSTO).
 *   Day 3 (22/04) — Targeted PortScan: nmap-style top-100 against the gateway.
 *                   First Suricata ALERT.
 *   Day 4 (23/04) — DDoS incident from external spoofed pool (~80 IPs) hitting
 *                   the gateway briefly. Unrelated to .23 — useful as the
 *                   ONLY DDoS sample so the panel "Attack Types" looks rich.
 *   Day 5 (24/04) — .23 goes quiet again (cool-down) — only 2 SSH probes that
 *                   look like a typo. AI on day 25 will say: "this IP went
 *                   silent right before the attack — classic APT staging."
 *
 *   Day 6 (25/04) — LIVE DEMO. Real Kali traffic from .23. Backend reshapes
 *                   it into the 11 ML classes. AI references the 5-day history.
 *
 * Storage: ~600 events total (light, snappy frontend).
 *          Backend SQLite mirror lives in demo/seed-history/seed-historical-data.js.
 */

import { SOCEvent } from '@/types/soc';

// ---------- Pseudo-random helpers (seeded so dataset is identical every load) ----------
let _seed = 42;
const rand = () => {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a));

// ---------- Network actors ----------
export const ATTACKER_IP = '192.168.168.23'; // same IP that will run live attack on day 25
const GATEWAY = '192.168.168.254';
const WEB_SERVER = '192.168.168.30';
const FILE_SERVER = '192.168.168.40';
const DNS_SERVER = '192.168.168.10';

// Lab hosts that produce benign noise
const LAB_HOSTS = Array.from({ length: 31 }, (_, i) => `192.168.168.${20 + i}`); // .20 → .50
// External IPs hidden by NAT — kept for reference only, not used in events.
// const BENIGN_EXTERNAL = ['8.8.8.8', '1.1.1.1'];

// ---------- Community-id stub (deterministic) ----------
const communityId = (s: string, sp: number, d: string, dp: number, proto: string) => {
  let h = 0;
  const str = `${s}|${sp}|${d}|${dp}|${proto}`;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i) | 0;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '1:';
  const a = Math.abs(h);
  for (let i = 0; i < 22; i++) out += chars[(a * (i + 1)) % chars.length];
  return out + '=';
};

// ---------- Event factory ----------
let _id = 0;
type EventOpts = Partial<Omit<SOCEvent, 'timestamp'>> & { ts: Date };

const mk = (o: EventOpts): SOCEvent => {
  _id++;
  const proto = o.protocol || 'TCP';
  const sp = o.src_port ?? between(20000, 65000);
  const dp = o.dst_port ?? 443;
  const src_ip = o.src_ip!;
  const dst_ip = o.dst_ip!;
  return {
    id: `HIST-${o.ts.getTime()}-${_id}`,
    timestamp: o.ts,
    src_ip,
    dst_ip,
    src_port: sp,
    dst_port: dp,
    protocol: proto,
    verdict: o.verdict || 'BENIGN',
    attack_type: o.attack_type || 'Normal HTTPS Traffic',
    confidence: o.confidence ?? Math.round((0.05 + rand() * 0.2) * 100) / 100,
    source_engine: o.source_engine || 'Zeek+ML',
    community_id: communityId(src_ip, sp, dst_ip, dp, proto),
    raw_log: o.raw_log || JSON.stringify({
      historical: true,
      day: o.ts.toISOString().slice(0, 10),
      attack: o.attack_type || 'benign',
    }, null, 2),
    action_taken: o.action_taken,
    source: 'mock',
  };
};

// ---------- Generators ----------
const events: SOCEvent[] = [];

/* =====================================================================
 * BENIGN baseline — guaranteed coverage across ALL 5 days, from early
 * morning to late night. Every day gets ~90 events spread over 06:00→23:30.
 *
 * NETWORK TOPOLOGY NOTE:
 *   pfSense does NAT for the LAN. Anything coming from "outside" (WAN, Kali
 *   simulated hosts, internet) is seen on the LAN side as hitting the
 *   gateway 192.168.168.254 — pfSense then forwards internally. So for the
 *   dashboard:
 *     • WAN/external/attacker → dst_ip MUST be 192.168.168.254
 *     • Internal LAN host → External web → src is internal, dst is .254
 *       (the gateway egress); the public IP is hidden by NAT.
 *     • LAN ↔ LAN benign chatter (DNS, file share) keeps real internal dst.
 * ===================================================================== */
for (let day = 20; day <= 24; day++) {
  const dayBase = new Date(`2026-04-${String(day).padStart(2, '0')}T06:00:00+07:00`).getTime();
  const dayClose = new Date(`2026-04-${String(day).padStart(2, '0')}T23:30:00+07:00`).getTime();
  for (let t = dayBase; t <= dayClose; t += between(600_000, 900_000)) {
    const ts = new Date(t);
    // 70% LAN → Internet (egress through gateway, dst = .254 due to NAT)
    // 30% LAN ↔ LAN (DNS lookup, file share)
    const isEgress = rand() < 0.7;
    if (isEgress) {
      events.push(mk({
        ts,
        src_ip: pick(LAB_HOSTS.filter(ip => ip !== ATTACKER_IP)),
        dst_ip: GATEWAY, // pfSense NAT egress
        dst_port: pick([443, 443, 443, 80, 53]),
        protocol: pick(['TCP', 'TCP', 'UDP']),
        attack_type: 'Normal HTTPS / Web Browsing',
        source_engine: 'Zeek',
      }));
    } else {
      // Internal DNS or file share
      const isDns = rand() < 0.5;
      events.push(mk({
        ts,
        src_ip: pick(LAB_HOSTS.filter(ip => ip !== ATTACKER_IP && ip !== DNS_SERVER)),
        dst_ip: isDns ? DNS_SERVER : FILE_SERVER,
        dst_port: isDns ? 53 : 445,
        protocol: isDns ? 'UDP' : 'TCP',
        attack_type: isDns ? 'Internal DNS Query' : 'SMB File Share',
        source_engine: 'Zeek',
      }));
    }
  }
}

/* =====================================================================
 * DAY 1 — 2026-04-20  Passive presence (.23 just appears on the LAN)
 * ===================================================================== */
{
  const base = new Date('2026-04-20T09:14:00+07:00').getTime();
  // ARP-like ICMP echo to a few neighbours — looks like a new device joining
  for (let i = 0; i < 6; i++) {
    events.push(mk({
      ts: new Date(base + i * 18_000),
      src_ip: ATTACKER_IP,
      dst_ip: `192.168.168.${between(20, 50)}`,
      protocol: 'ICMP',
      dst_port: 0,
      attack_type: 'ICMP Echo Request',
      verdict: 'BENIGN',
      confidence: 0.1,
      source_engine: 'Zeek',
    }));
  }
  // One look at the gateway web UI
  events.push(mk({
    ts: new Date(base + 600_000),
    src_ip: ATTACKER_IP, dst_ip: GATEWAY, dst_port: 443,
    attack_type: 'HTTPS Connection',
    verdict: 'BENIGN', confidence: 0.15,
    source_engine: 'Zeek',
  }));
}

/* =====================================================================
 * DAY 2 — 2026-04-21  Light TCP probing — first SUSPICIOUS
 * ===================================================================== */
{
  const base = new Date('2026-04-21T22:47:00+07:00').getTime(); // late at night
  const probedPorts = [22, 80, 443, 8080, 3389];
  probedPorts.forEach((port, i) => {
    events.push(mk({
      ts: new Date(base + i * 12_000),
      src_ip: ATTACKER_IP, dst_ip: GATEWAY, dst_port: port,
      attack_type: 'Suspicious Connection Attempt',
      verdict: 'SUSPICIOUS', confidence: 0.62,
      source_engine: 'Zeek',
      raw_log: JSON.stringify({ conn_state: 'REJ', service: '-', historical: true }, null, 2),
    }));
  });
}

/* =====================================================================
 * DAY 3 — 2026-04-22  Targeted PortScan — first Suricata ALERT
 * ===================================================================== */
{
  const base = new Date('2026-04-22T02:18:00+07:00').getTime();
  // 80 SYN probes to top ports → triggers PortScan signature
  for (let i = 0; i < 80; i++) {
    const port = pick([21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 8080, 8443]);
    events.push(mk({
      ts: new Date(base + i * 1_400),
      src_ip: ATTACKER_IP, dst_ip: GATEWAY, dst_port: port,
      attack_type: 'PortScan',
      verdict: i > 15 ? 'ALERT' : 'SUSPICIOUS',
      confidence: i > 15 ? 0.88 + rand() * 0.08 : 0.65,
      source_engine: 'Suricata+Zeek+ML',
    }));
  }
}

/* =====================================================================
 * DAY 4 — 2026-04-23  External DDoS burst (NOT from .23) — gives the
 *         dashboard a single DDoS data point so the ML class is represented.
 *         Story: someone tried to DDoS our gateway; mitigated quickly.
 * ===================================================================== */
{
  const base = new Date('2026-04-23T19:42:00+07:00').getTime();
  const spoofPool = Array.from({ length: 60 }, () =>
    `${between(11, 223)}.${between(0, 255)}.${between(0, 255)}.${between(1, 254)}`
  );
  for (let i = 0; i < 220; i++) {
    events.push(mk({
      ts: new Date(base + i * 700),
      src_ip: pick(spoofPool),
      dst_ip: GATEWAY, dst_port: 80, protocol: 'TCP',
      attack_type: 'DDoS',
      verdict: 'ALERT', confidence: 0.9 + rand() * 0.08,
      source_engine: 'Suricata+Zeek+ML',
      action_taken: i === 219 ? 'auto_blocked_pfsense' : undefined,
    }));
  }
}

/* =====================================================================
 * DAY 5 — 2026-04-24  Cool-down (.23 silent except for 2 lazy SSH probes).
 *         AI on day 25 should say: "the attacker went quiet right before
 *         striking — classic APT staging behaviour."
 * ===================================================================== */
{
  const base = new Date('2026-04-24T16:31:00+07:00').getTime();
  for (let i = 0; i < 2; i++) {
    events.push(mk({
      ts: new Date(base + i * 240_000),
      src_ip: ATTACKER_IP, dst_ip: GATEWAY, dst_port: 22,
      attack_type: 'SSH Connection Attempt',
      verdict: 'SUSPICIOUS', confidence: 0.55,
      source_engine: 'Zeek',
    }));
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
    .filter(e => e.src_ip === ip)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map(e => ({
      ts: e.timestamp.toISOString(),
      day: e.timestamp.toISOString().slice(0, 10),
      action: e.attack_type,
      verdict: e.verdict,
      confidence: e.confidence,
      target: `${e.dst_ip}:${e.dst_port}`,
    }));
};
