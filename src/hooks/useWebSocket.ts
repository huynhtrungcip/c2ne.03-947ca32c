import { useEffect, useRef, useCallback, useState } from 'react';
import { SOCEvent } from '@/types/soc';

interface WebSocketConfig {
  url: string;
  enabled: boolean;
  onEvent?: (event: SOCEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
  reconnectInterval?: number;
}

interface ParsedNIDSLog {
  source: 'suricata' | 'zeek' | 'zeek_http';
  data: Record<string, unknown>;
}

// Parse Suricata alert log
function parseSuricataAlert(data: Record<string, unknown>): Partial<SOCEvent> | null {
  if (data.event_type !== 'alert') return null;

  const alert = data.alert as Record<string, unknown> | undefined;
  
  return {
    src_ip: data.src_ip as string,
    dst_ip: data.dest_ip as string,
    src_port: data.src_port as number,
    dst_port: data.dest_port as number,
    protocol: data.proto as string || 'TCP',
    attack_type: alert?.signature as string || 'Unknown',
    verdict: 'ALERT',
    confidence: ((alert?.severity as number) ? (4 - (alert.severity as number)) / 3 : 0.5),
    source_engine: 'Suricata',
    community_id: data.community_id as string,
    raw_log: JSON.stringify(data, null, 2),
  };
}

// Parse Zeek conn.log
function parseZeekConn(data: Record<string, unknown>): Partial<SOCEvent> | null {
  return {
    src_ip: data['id.orig_h'] as string,
    dst_ip: data['id.resp_h'] as string,
    src_port: data['id.orig_p'] as number,
    dst_port: data['id.resp_p'] as number,
    protocol: (data.proto as string)?.toUpperCase() || 'TCP',
    attack_type: `Connection: ${data.service || 'unknown'}`,
    verdict: 'SUSPICIOUS',
    confidence: 0.5,
    source_engine: 'Zeek',
    community_id: data.community_id as string,
    raw_log: JSON.stringify(data, null, 2),
  };
}

// Parse Zeek http.log
function parseZeekHttp(data: Record<string, unknown>): Partial<SOCEvent> | null {
  const method = data.method as string || 'GET';
  const host = data.host as string || '';
  const uri = data.uri as string || '';

  return {
    src_ip: data['id.orig_h'] as string,
    dst_ip: data['id.resp_h'] as string,
    src_port: data['id.orig_p'] as number,
    dst_port: data['id.resp_p'] as number,
    protocol: 'HTTP',
    attack_type: `HTTP ${method} ${host}${uri}`.substring(0, 100),
    verdict: 'SUSPICIOUS',
    confidence: 0.5,
    source_engine: 'Zeek',
    community_id: data.community_id as string,
    raw_log: JSON.stringify(data, null, 2),
  };
}

// Convert NIDS log to SOCEvent
function parseNIDSLog(log: ParsedNIDSLog): SOCEvent | null {
  let parsed: Partial<SOCEvent> | null = null;

  switch (log.source) {
    case 'suricata':
      parsed = parseSuricataAlert(log.data);
      break;
    case 'zeek':
      parsed = parseZeekConn(log.data);
      break;
    case 'zeek_http':
      parsed = parseZeekHttp(log.data);
      break;
  }

  if (!parsed || !parsed.src_ip || !parsed.dst_ip) {
    return null;
  }

  return {
    id: `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    timestamp: new Date(log.data.ts as string || log.data.timestamp as string || Date.now()),
    src_ip: parsed.src_ip,
    dst_ip: parsed.dst_ip,
    src_port: parsed.src_port,
    dst_port: parsed.dst_port,
    protocol: parsed.protocol || 'TCP',
    attack_type: parsed.attack_type || 'Unknown',
    verdict: parsed.verdict || 'SUSPICIOUS',
    confidence: parsed.confidence || 0.5,
    source_engine: parsed.source_engine || 'Unknown',
    community_id: parsed.community_id || '',
    raw_log: parsed.raw_log || '',
  };
}

export const useWebSocket = ({
  url,
  enabled,
  onEvent,
  onConnectionChange,
  reconnectInterval = 5000,
}: WebSocketConfig) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      console.log(`[WebSocket] Connecting to ${url}...`);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        onConnectionChange?.(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(event.data);

          // Handle different message types
          if (data.type === 'NEW_EVENT') {
            // Event from Node.js backend
            const socEvent: SOCEvent = {
              ...data.data,
              timestamp: new Date(data.data.timestamp),
            };
            setEventCount((c) => c + 1);
            onEvent?.(socEvent);
          } else if (data.source && data.data) {
            // Raw NIDS log from shipper
            const parsedEvent = parseNIDSLog(data as ParsedNIDSLog);
            if (parsedEvent) {
              setEventCount((c) => c + 1);
              onEvent?.(parsedEvent);
            }
          }
        } catch (err) {
          console.error('[WebSocket] Parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        onConnectionChange?.(false);

        // Reconnect
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WebSocket] Connection error:', err);
    }
  }, [url, enabled, onEvent, onConnectionChange, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    eventCount,
    sendMessage,
    connect,
    disconnect,
  };
};
