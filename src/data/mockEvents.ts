import { SOCEvent } from '@/types/soc';

// Suricata signature patterns - CHỈ Suricata mới có ALERT
const suricataSignatures = [
  // Critical - DDoS/DoS
  'ET ATTACK DDoS HTTP Flood Detected',
  'ET ATTACK DoS Hulk HTTP Flood',
  'ET ATTACK Slow HTTP DoS Attack',
  'GPL ATTACK DoS SYN Flood Detected',
  // Exploitation
  'ET EXPLOIT RCE Attempt Detected',
  'ET EXPLOIT Command Injection Attempt',
  'ET EXPLOIT Path Traversal Attack',
  'ET ATTACK SQL Injection Attempt',
  'ET ATTACK XSS Cross-Site Scripting',
  // Malware
  'ET TROJAN Possible Backdoor Connection',
  'ET MALWARE CnC Beacon Detected',
  'ET TROJAN Botnet Traffic Detected',
  // Scan attacks
  'ET SCAN Nmap SYN Scan Detected',
  'ET SCAN Port Scan Detected',
  'ET SCAN Masscan Activity',
  // Brute force
  'ET ATTACK SSH Brute Force Attempt',
  'ET ATTACK FTP Brute Force Login',
  // Policy (suspicious, not critical)
  'ET POLICY Suspicious User-Agent',
  'ET POLICY Tor Exit Node Traffic',
  'ET INFO DNS Query to Suspicious Domain',
  // False positives
  'FP DEMO - Benign Admin Login',
  'FP DEMO - Healthcheck Request',
];

// Non-dangerous signatures (should NOT trigger auto-block)
const benignSignatures = [
  'ET INFO ICMP Echo Request',
  'ET POLICY DNS Query',
  'ET INFO Generic HTTP Request',
  'Normal HTTP Traffic',
  'ICMP Ping Request',
];

// Zeek connection states - Zeek KHÔNG có ALERT, chỉ log connections
const zeekConnStates = ['SF', 'S0', 'S1', 'REJ', 'RSTO', 'RSTOS0', 'SH', 'SHR', 'OTH'];
const zeekServices = ['http', 'https', 'ssh', 'dns', 'ftp', 'smtp', 'ssl', 'irc', '-'];

const protocols = ['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'SSH', 'DNS'];
const commonPorts = [80, 443, 22, 3306, 5432, 8080, 21, 25, 53, 3389, 445, 139, 8443, 9200];

const generateIP = () => {
  const ranges = [
    () => `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    () => `172.${16 + Math.floor(Math.random() * 16)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    () => `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  ];
  return ranges[Math.floor(Math.random() * ranges.length)]();
};

/**
 * Generate Community ID v1 từ 5-tuple
 * Format: 1:<base64_hash>
 * Real community ID uses sha1 hash, here we simulate similar pattern
 */
const generateCommunityId = (srcIp: string, dstIp: string, srcPort: number, dstPort: number, protocol: string): string => {
  // Simple hash simulation - in production would use actual sha1
  const tuple = `${srcIp}:${srcPort}-${dstIp}:${dstPort}:${protocol}`;
  let hash = 0;
  for (let i = 0; i < tuple.length; i++) {
    const char = tuple.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to base64-like string
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '1:';
  const absHash = Math.abs(hash);
  for (let i = 0; i < 27; i++) {
    result += chars.charAt((absHash * (i + 1)) % chars.length);
  }
  return result + '=';
};

/**
 * Determine verdict and source engine based on signature
 * - Suricata: Có thể có ALERT, SUSPICIOUS, FALSE_POSITIVE
 * - Zeek: KHÔNG có ALERT, chỉ có SUSPICIOUS hoặc BENIGN (vì Zeek chỉ log metadata)
 */
const getEventProperties = (isZeek: boolean, signature: string) => {
  if (isZeek) {
    // Zeek KHÔNG BAO GIỜ có verdict ALERT - chỉ log connections
    const connState = zeekConnStates[Math.floor(Math.random() * zeekConnStates.length)];
    const service = zeekServices[Math.floor(Math.random() * zeekServices.length)];
    
    // Zeek chỉ có SUSPICIOUS hoặc BENIGN dựa trên connection state
    let verdict: SOCEvent['verdict'] = 'BENIGN';
    let confidence = 0.3 + Math.random() * 0.2;
    
    if (['REJ', 'RSTO', 'RSTOS0', 'S0'].includes(connState)) {
      verdict = 'SUSPICIOUS';
      confidence = 0.5 + Math.random() * 0.3;
    }
    
    return {
      verdict,
      confidence: Math.round(confidence * 100) / 100,
      attack_type: `Zeek Connection: ${service} (${connState})`,
      source_engine: 'Zeek',
    };
  }
  
  // Suricata - có thể có ALERT
  const sigLower = signature.toLowerCase();
  
  // Check if benign/FP signature
  if (sigLower.includes('fp demo') || sigLower.includes('benign') || sigLower.includes('normal')) {
    return {
      verdict: 'FALSE_POSITIVE' as SOCEvent['verdict'],
      confidence: Math.round((0.1 + Math.random() * 0.2) * 100) / 100,
      attack_type: signature,
      source_engine: 'Suricata',
    };
  }
  
  // Check if benign traffic (ICMP, policy info)
  if (sigLower.includes('icmp') || sigLower.includes('et info') || sigLower.includes('ping')) {
    return {
      verdict: 'BENIGN' as SOCEvent['verdict'],
      confidence: Math.round((0.2 + Math.random() * 0.3) * 100) / 100,
      attack_type: signature,
      source_engine: 'Suricata',
    };
  }
  
  // Check if suspicious
  if (sigLower.includes('et policy') || sigLower.includes('suspicious')) {
    return {
      verdict: 'SUSPICIOUS' as SOCEvent['verdict'],
      confidence: Math.round((0.5 + Math.random() * 0.3) * 100) / 100,
      attack_type: signature,
      source_engine: 'Suricata',
    };
  }
  
  // Critical patterns -> ALERT
  const criticalPatterns = ['ddos', 'dos', 'exploit', 'attack', 'trojan', 'malware', 'scan', 'brute'];
  const isCritical = criticalPatterns.some(p => sigLower.includes(p));
  
  if (isCritical) {
    return {
      verdict: 'ALERT' as SOCEvent['verdict'],
      confidence: Math.round((0.7 + Math.random() * 0.3) * 100) / 100,
      attack_type: signature,
      source_engine: 'Suricata',
    };
  }
  
  // Default: SUSPICIOUS
  return {
    verdict: 'SUSPICIOUS' as SOCEvent['verdict'],
    confidence: Math.round((0.4 + Math.random() * 0.4) * 100) / 100,
    attack_type: signature,
    source_engine: 'Suricata',
  };
};

export const generateMockEvents = (count: number): SOCEvent[] => {
  const events: SOCEvent[] = [];
  const now = new Date();
  
  // Spread events across 24 hours (1440 minutes)
  const minutesInDay = 1440;
  
  for (let i = 0; i < count; i++) {
    // Spread events evenly with some randomness
    const baseMinutesAgo = Math.floor((i / count) * minutesInDay);
    const jitter = Math.floor(Math.random() * 10) - 5; // ±5 minutes jitter
    const minutesAgo = Math.max(0, baseMinutesAgo + jitter);
    const timestamp = new Date(now.getTime() - minutesAgo * 60000);
    
    // 70% Suricata, 30% Zeek (Suricata là nguồn chính cho ALERT)
    const isZeek = Math.random() < 0.3;
    
    // Select signature
    let signature: string;
    if (isZeek) {
      signature = ''; // Zeek không dùng signature
    } else {
      // Mix of attack types
      const sigRandom = Math.random();
      if (sigRandom < 0.5) {
        // Attack signatures (50%)
        signature = suricataSignatures[Math.floor(Math.random() * suricataSignatures.length)];
      } else if (sigRandom < 0.75) {
        // Benign signatures (25%)
        signature = benignSignatures[Math.floor(Math.random() * benignSignatures.length)];
      } else {
        // Random from all (25%)
        const allSigs = [...suricataSignatures, ...benignSignatures];
        signature = allSigs[Math.floor(Math.random() * allSigs.length)];
      }
    }
    
    const srcIp = generateIP();
    const dstIp = generateIP();
    const srcPort = 1024 + Math.floor(Math.random() * 64511);
    const dstPort = commonPorts[Math.floor(Math.random() * commonPorts.length)];
    const protocol = protocols[Math.floor(Math.random() * protocols.length)];
    
    const eventProps = getEventProperties(isZeek, signature);
    const communityId = generateCommunityId(srcIp, dstIp, srcPort, dstPort, protocol);

    events.push({
      id: `EVT-${Date.now()}-${i}`,
      timestamp,
      src_ip: srcIp,
      dst_ip: dstIp,
      src_port: srcPort,
      dst_port: dstPort,
      protocol,
      community_id: communityId,
      ...eventProps,
      raw_log: JSON.stringify({
        flow_id: Math.floor(Math.random() * 1000000000),
        pcap_cnt: Math.floor(Math.random() * 10000),
        event_type: isZeek ? 'conn' : 'alert',
        community_id: communityId,
        src_port: srcPort,
        proto: protocol.toLowerCase(),
        ...(isZeek ? {
          conn_state: zeekConnStates[Math.floor(Math.random() * zeekConnStates.length)],
          duration: Math.random() * 60,
          orig_bytes: Math.floor(Math.random() * 100000),
          resp_bytes: Math.floor(Math.random() * 500000),
        } : {
          alert: {
            signature: eventProps.attack_type,
            severity: eventProps.verdict === 'ALERT' ? 1 : eventProps.verdict === 'SUSPICIOUS' ? 2 : 3,
          }
        }),
      }, null, 2)
    });
  }

  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

// Default: generate 1000 events spread across 1 day
export const mockEvents = generateMockEvents(1000);
