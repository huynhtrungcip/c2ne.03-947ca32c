import { SOCEvent } from '@/types/soc';

const attackTypes = [
  'DDoS Attack',
  'Port Scan',
  'SSH Brute Force',
  'SQL Injection',
  'XSS Attack',
  'Path Traversal',
  'ICMP Flood',
  'SYN Scan',
  'HTTP Flood',
  'DNS Amplification'
];

const sourceEngines = ['Suricata', 'Zeek', 'AI Correlation'];
const protocols = ['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'SSH', 'DNS'];
const verdicts: SOCEvent['verdict'][] = ['ALERT', 'SUSPICIOUS', 'BENIGN', 'FALSE_POSITIVE'];

const generateIP = () => {
  const ranges = [
    () => `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    () => `172.${16 + Math.floor(Math.random() * 16)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    () => `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  ];
  return ranges[Math.floor(Math.random() * ranges.length)]();
};

const generateCommunityId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '1:';
  for (let i = 0; i < 27; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result + '=';
};

export const generateMockEvents = (count: number): SOCEvent[] => {
  const events: SOCEvent[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const minutesAgo = Math.floor(Math.random() * 1440); // Last 24 hours
    const timestamp = new Date(now.getTime() - minutesAgo * 60000);
    
    const verdictRandom = Math.random();
    let verdict: SOCEvent['verdict'];
    if (verdictRandom < 0.15) verdict = 'ALERT';
    else if (verdictRandom < 0.35) verdict = 'SUSPICIOUS';
    else if (verdictRandom < 0.45) verdict = 'FALSE_POSITIVE';
    else verdict = 'BENIGN';

    events.push({
      id: `EVT-${Date.now()}-${i}`,
      timestamp,
      src_ip: generateIP(),
      dst_ip: generateIP(),
      dst_port: [80, 443, 22, 3306, 5432, 8080, 21, 25, 53, 3389][Math.floor(Math.random() * 10)],
      protocol: protocols[Math.floor(Math.random() * protocols.length)],
      verdict,
      attack_type: verdict === 'BENIGN' ? 'Normal Traffic' : attackTypes[Math.floor(Math.random() * attackTypes.length)],
      confidence: Math.round((0.5 + Math.random() * 0.5) * 100) / 100,
      source_engine: sourceEngines[Math.floor(Math.random() * sourceEngines.length)],
      community_id: generateCommunityId(),
      raw_log: JSON.stringify({
        flow_id: Math.floor(Math.random() * 1000000000),
        pcap_cnt: Math.floor(Math.random() * 10000),
        event_type: 'alert',
        src_port: Math.floor(Math.random() * 65535),
      }, null, 2)
    });
  }

  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

export const mockEvents = generateMockEvents(500);
