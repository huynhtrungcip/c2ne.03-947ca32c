#!/usr/bin/env node
/**
 * AI-SOC HISTORICAL DATA SEEDER
 * ------------------------------------------------------------------
 * Generates realistic 5-day baseline (2026-04-20 → 2026-04-24) so the
 * dashboard has a believable "story" before the live demo on 2026-04-25.
 *
 * Profile  : ~95% BENIGN background traffic + scripted incidents
 *   - 2026-04-21 14:30  : PortScan recon from a single external IP
 *   - 2026-04-22 02:15  : SSH brute-force (Patator) overnight
 *   - 2026-04-23 19:40  : Small DDoS SYN burst (~80 spoofed IPs)
 *   - 2026-04-24 11:05  : Web attack cluster (SQLi + XSS attempts)
 *
 * Usage (from project root, with backend stopped):
 *   node demo/seed-history/seed-historical-data.js
 *
 * Env:
 *   DB_PATH=./server/soc_events.db  (default: ../../server/soc_events.db)
 *   DRY_RUN=1                       (print counts, no insert)
 * ------------------------------------------------------------------
 */
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'server', 'soc_events.db');
const DRY_RUN = process.env.DRY_RUN === '1';

// Time window
const START = new Date('2026-04-20T00:00:00+07:00').getTime();
const END   = new Date('2026-04-24T23:59:59+07:00').getTime();

// Network actors
const INTERNAL_HOSTS = ['172.16.16.30', '172.16.16.20', '10.10.10.20'];
const BENIGN_EXTERNAL = [
  '8.8.8.8', '1.1.1.1', '203.113.131.5', '14.225.7.1',
  '52.84.150.39', '142.250.196.110', '157.240.16.35',
];
const RECON_IP   = '185.220.101.45';   // tor-ish
const BRUTE_IP   = '45.143.220.91';
const WEB_ATK_IP = '194.165.16.77';

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const uid  = () => crypto.randomBytes(8).toString('hex');
const isoLocal = ts => new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
const communityId = (s, sp, d, dp, proto) =>
  '1:' + crypto.createHash('sha1').update(`${s}|${sp}|${d}|${dp}|${proto}`).digest('base64').slice(0, 22) + '=';

function randomSpoofedIp() {
  return `${Math.floor(rand(11, 223))}.${Math.floor(rand(0, 255))}.${Math.floor(rand(0, 255))}.${Math.floor(rand(1, 254))}`;
}

// ---------- event factory ----------
function mkEvent(ts, src, dst, attack, verdict, opts = {}) {
  const proto = opts.protocol || 'TCP';
  const sp = opts.src_port || Math.floor(rand(20000, 65000));
  const dp = opts.dst_port || pick([22, 80, 443, 21, 3389, 53, 8080]);
  const conf = opts.confidence ?? (verdict === 'ALERT' ? rand(0.85, 0.99) : verdict === 'SUSPICIOUS' ? rand(0.55, 0.79) : rand(0.05, 0.35));
  return {
    id: uid(),
    timestamp: isoLocal(ts),
    src_ip: src,
    dst_ip: dst,
    src_port: sp,
    dst_port: dp,
    protocol: proto,
    attack_type: attack,
    verdict,
    final_verdict: verdict,
    confidence: Number(conf.toFixed(3)),
    source_engine: opts.engine || 'Suricata+Zeek+ML',
    community_id: communityId(src, sp, dst, dp, proto),
    flow_id: opts.flow_id || null,
    raw_log: JSON.stringify({ seeded: true, ts: isoLocal(ts), attack }),
    action_taken: opts.action || null,
    zeek_correlated: 1,
    ai_analyzed: 1,
    ai_analysis: opts.analysis || JSON.stringify({
      summary: `Historical ${verdict} — ${attack}`,
      seeded: true,
    }),
  };
}

// ---------- generators ----------
const events = [];

// 1) BENIGN baseline — every 2-7 minutes across 5 days
console.log('[gen] BENIGN baseline traffic...');
for (let t = START; t <= END; t += rand(120_000, 420_000)) {
  events.push(mkEvent(
    t,
    pick(BENIGN_EXTERNAL),
    pick(INTERNAL_HOSTS),
    'BENIGN Normal HTTPS',
    'BENIGN',
    { dst_port: pick([443, 80]), engine: 'Zeek+ML' }
  ));
}

// 2) PortScan recon — 2026-04-21 14:30, 8 minutes
console.log('[gen] Incident: PortScan recon 2026-04-21...');
{
  const base = new Date('2026-04-21T14:30:00+07:00').getTime();
  for (let i = 0; i < 220; i++) {
    const t = base + i * rand(1500, 2500);
    const port = 1 + Math.floor(rand(1, 1024));
    events.push(mkEvent(t, RECON_IP, '172.16.16.30', 'PortScan SYN Scan',
      i > 25 ? 'ALERT' : 'SUSPICIOUS',
      { dst_port: port, confidence: 0.78 + Math.random() * 0.15 }));
  }
}

// 3) SSH brute force — 2026-04-22 02:15, ~25 min
console.log('[gen] Incident: SSH-Patator 2026-04-22...');
{
  const base = new Date('2026-04-22T02:15:00+07:00').getTime();
  for (let i = 0; i < 180; i++) {
    const t = base + i * rand(6000, 9000);
    events.push(mkEvent(t, BRUTE_IP, '172.16.16.30', 'SSH-Patator Brute Force',
      'ALERT',
      { dst_port: 22, confidence: 0.92 + Math.random() * 0.06,
        action: i === 179 ? 'auto_blocked_pfsense' : null }));
  }
}

// 4) DDoS SYN burst — 2026-04-23 19:40, 3 minutes, ~80 spoofed sources
console.log('[gen] Incident: DDoS SYN burst 2026-04-23...');
{
  const base = new Date('2026-04-23T19:40:00+07:00').getTime();
  const spoofPool = Array.from({ length: 80 }, randomSpoofedIp);
  for (let i = 0; i < 600; i++) {
    const t = base + i * rand(150, 350);
    events.push(mkEvent(t, pick(spoofPool), '172.16.16.30', 'DDoS SYN Flood',
      'ALERT',
      { dst_port: 80, confidence: 0.88 + Math.random() * 0.1 }));
  }
}

// 5) Web attack cluster — 2026-04-24 11:05, 12 min
console.log('[gen] Incident: Web attack cluster 2026-04-24...');
{
  const base = new Date('2026-04-24T11:05:00+07:00').getTime();
  const sigs = [
    'Web Attack SQL Injection',
    'Web Attack XSS Reflected',
    'Web Attack Path Traversal',
    'Web Attack Command Injection',
  ];
  for (let i = 0; i < 90; i++) {
    const t = base + i * rand(6000, 11000);
    events.push(mkEvent(t, WEB_ATK_IP, '172.16.16.30', pick(sigs),
      i > 10 ? 'ALERT' : 'SUSPICIOUS',
      { dst_port: 80, confidence: 0.83 + Math.random() * 0.14 }));
  }
}

// ---------- summary ----------
const byVerdict = events.reduce((m, e) => (m[e.verdict] = (m[e.verdict] || 0) + 1, m), {});
console.log('\n=== SEED SUMMARY ===');
console.log('Total events :', events.length);
console.log('By verdict   :', byVerdict);
console.log('Time range   :', isoLocal(START), '→', isoLocal(END));
console.log('DB path      :', DB_PATH);

if (DRY_RUN) {
  console.log('\nDRY_RUN=1 → no rows inserted.');
  process.exit(0);
}

// ---------- insert ----------
const db = new Database(DB_PATH);
const insert = db.prepare(`
  INSERT OR IGNORE INTO events
    (id, timestamp, src_ip, dst_ip, src_port, dst_port, protocol,
     attack_type, verdict, final_verdict, confidence, source_engine,
     community_id, flow_id, raw_log, action_taken,
     zeek_correlated, ai_analyzed, ai_analysis)
  VALUES (@id, @timestamp, @src_ip, @dst_ip, @src_port, @dst_port, @protocol,
          @attack_type, @verdict, @final_verdict, @confidence, @source_engine,
          @community_id, @flow_id, @raw_log, @action_taken,
          @zeek_correlated, @ai_analyzed, @ai_analysis)
`);
const txn = db.transaction(rows => { for (const r of rows) insert.run(r); });
txn(events);
console.log(`\n✓ Inserted ${events.length} historical events into ${DB_PATH}`);
db.close();
