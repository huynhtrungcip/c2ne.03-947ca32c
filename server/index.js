/**
 * SOC Dashboard Backend Server - False Positive Reduction System
 * 
 * Architecture:
 * 1. Receives alerts from Suricata (stored as PENDING)
 * 2. Correlates with Zeek logs using community_id or 5-tuple
 * 3. AI analyzes combined data to determine final verdict
 * 
 * Author: C1NE.03 Team - Cybersecurity K28 - Duy Tan University
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'soc_events.db');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.text({ type: 'text/plain', limit: '50mb' }));

// Trust proxy for getting real client IP
app.set('trust proxy', true);

// Initialize SQLite Database
const db = new Database(DB_PATH);

// Create tables with enhanced schema for correlation
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    src_ip TEXT,
    dst_ip TEXT,
    src_port INTEGER,
    dst_port INTEGER,
    protocol TEXT,
    attack_type TEXT,
    verdict TEXT DEFAULT 'PENDING',
    final_verdict TEXT,
    confidence REAL DEFAULT 0.5,
    source_engine TEXT,
    community_id TEXT,
    flow_id TEXT,
    raw_log TEXT,
    action_taken TEXT,
    zeek_correlated INTEGER DEFAULT 0,
    ai_analyzed INTEGER DEFAULT 0,
    ai_analysis TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS zeek_flows (
    id TEXT PRIMARY KEY,
    timestamp DATETIME,
    uid TEXT,
    community_id TEXT,
    src_ip TEXT,
    dst_ip TEXT,
    src_port INTEGER,
    dst_port INTEGER,
    protocol TEXT,
    service TEXT,
    duration REAL,
    orig_bytes INTEGER,
    resp_bytes INTEGER,
    conn_state TEXT,
    raw_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS connected_sources (
    id TEXT PRIMARY KEY,
    ip_address TEXT UNIQUE,
    source_type TEXT,
    hostname TEXT,
    last_seen DATETIME,
    total_events INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_src_ip ON events(src_ip);
  CREATE INDEX IF NOT EXISTS idx_events_verdict ON events(verdict);
  CREATE INDEX IF NOT EXISTS idx_events_community_id ON events(community_id);
  CREATE INDEX IF NOT EXISTS idx_zeek_community_id ON zeek_flows(community_id);
  CREATE INDEX IF NOT EXISTS idx_zeek_5tuple ON zeek_flows(src_ip, dst_ip, src_port, dst_port, protocol);
`);

// WebSocket Server for real-time updates
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`[WS] Client connected from ${req.socket.remoteAddress}. Total: ${clients.size}`);
  
  // Send current connection status
  ws.send(JSON.stringify({ type: 'CONNECTED', clients: clients.size }));
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });
});

// Broadcast event to all connected clients
function broadcastEvent(event) {
  const message = JSON.stringify({ type: 'NEW_EVENT', data: event });
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Update or create connected source
function updateConnectedSource(ip, sourceType, req) {
  const hostname = req.headers['x-nids-hostname'] || req.headers['host'] || 'Unknown';
  
  db.prepare(`
    INSERT INTO connected_sources (id, ip_address, source_type, hostname, last_seen, total_events)
    VALUES (?, ?, ?, ?, datetime('now'), 1)
    ON CONFLICT(ip_address) DO UPDATE SET
      last_seen = datetime('now'),
      total_events = total_events + 1,
      source_type = CASE 
        WHEN source_type NOT LIKE '%' || ? || '%' THEN source_type || ', ' || ?
        ELSE source_type
      END
  `).run(uuidv4(), ip, sourceType, hostname, sourceType, sourceType);
}

// ==================== CORRELATION ENGINE ====================

// Find matching Zeek flow for a Suricata alert
function findZeekCorrelation(event) {
  // First try community_id (most accurate)
  if (event.community_id) {
    const zeekFlow = db.prepare(`
      SELECT * FROM zeek_flows 
      WHERE community_id = ?
      ORDER BY ABS(julianday(timestamp) - julianday(?)) 
      LIMIT 1
    `).get(event.community_id, event.timestamp);
    
    if (zeekFlow) return zeekFlow;
  }
  
  // Fallback to 5-tuple matching within time window
  const zeekFlow = db.prepare(`
    SELECT * FROM zeek_flows 
    WHERE src_ip = ? AND dst_ip = ? AND dst_port = ?
    AND ABS(julianday(timestamp) - julianday(?)) < 0.0007  -- ~1 minute window
    ORDER BY ABS(julianday(timestamp) - julianday(?))
    LIMIT 1
  `).get(event.src_ip, event.dst_ip, event.dst_port, event.timestamp, event.timestamp);
  
  return zeekFlow;
}

// Process pending alerts - correlate with Zeek and update verdict
function processPendingAlerts() {
  const pendingAlerts = db.prepare(`
    SELECT * FROM events 
    WHERE verdict = 'PENDING' AND zeek_correlated = 0
    ORDER BY timestamp DESC
    LIMIT 100
  `).all();
  
  for (const alert of pendingAlerts) {
    const zeekFlow = findZeekCorrelation(alert);
    
    if (zeekFlow) {
      // Found Zeek correlation - update alert
      const correlationData = {
        zeek_uid: zeekFlow.uid,
        zeek_service: zeekFlow.service,
        zeek_conn_state: zeekFlow.conn_state,
        zeek_duration: zeekFlow.duration,
        zeek_bytes: (zeekFlow.orig_bytes || 0) + (zeekFlow.resp_bytes || 0)
      };
      
      // Preliminary verdict based on Zeek data
      let preliminaryVerdict = 'SUSPICIOUS';
      
      // If connection was reset/rejected, more likely to be attack
      if (['REJ', 'RSTO', 'RSTOS0'].includes(zeekFlow.conn_state)) {
        preliminaryVerdict = 'ALERT';
      }
      // If connection completed normally with normal duration, might be false positive
      else if (zeekFlow.conn_state === 'SF' && zeekFlow.duration > 0.5) {
        preliminaryVerdict = 'SUSPICIOUS'; // Still need AI verification
      }
      
      db.prepare(`
        UPDATE events SET 
          zeek_correlated = 1,
          verdict = ?,
          raw_log = json_patch(raw_log, ?)
        WHERE id = ?
      `).run(preliminaryVerdict, JSON.stringify({ zeek_correlation: correlationData }), alert.id);
      
      console.log(`[CORRELATION] Alert ${alert.id} correlated with Zeek flow ${zeekFlow.uid}`);
    } else {
      // No Zeek correlation found - mark as checked but uncorrelated
      db.prepare(`
        UPDATE events SET zeek_correlated = -1, verdict = 'SUSPICIOUS'
        WHERE id = ?
      `).run(alert.id);
    }
  }
}

// Run correlation every 5 seconds
setInterval(processPendingAlerts, 5000);

// ==================== BACKGROUND RE-CORRELATION + AI RE-ANALYZE ====================
// Every 30s: scan events that are still uncorrelated OR not yet AI-analyzed.
// If Zeek log has now arrived (community_id / 5-tuple match), call AI engine
// /analyze/flow and push the updated verdict to all WS clients.
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const RECORRELATION_INTERVAL_MS = 30000;
const RECORRELATION_LOOKBACK_MIN = 30; // only re-check recent events

async function reCorrelateAndAnalyze() {
  try {
    // Candidates: events that are PENDING, or zeek_correlated=0/-1, or never AI-analyzed
    const candidates = db.prepare(`
      SELECT * FROM events
      WHERE (verdict = 'PENDING' OR zeek_correlated <= 0 OR ai_analyzed = 0)
        AND timestamp >= datetime('now', '-${RECORRELATION_LOOKBACK_MIN} minutes')
      ORDER BY timestamp DESC
      LIMIT 50
    `).all();

    if (candidates.length === 0) return;

    let reanalyzed = 0;

    for (const event of candidates) {
      const zeekFlow = findZeekCorrelation(event);
      // Only re-analyze if we now have a Zeek match that we didn't have before,
      // OR if the event was never AI-analyzed at all.
      if (!zeekFlow && event.ai_analyzed === 1) continue;

      try {
        const res = await fetch(`${AI_ENGINE_URL}/analyze/flow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: event.id,
            suricata_alert: event,
            zeek_flows: zeekFlow ? [zeekFlow] : [],
          }),
          // Avoid hanging the loop on AI engine downtime
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) continue;
        const result = await res.json();
        if (!result?.success || !result.analysis) continue;

        const analysis = result.analysis;

        db.prepare(`
          UPDATE events SET
            verdict = ?,
            final_verdict = ?,
            confidence = ?,
            ai_analyzed = 1,
            ai_analysis = ?,
            zeek_correlated = ?
          WHERE id = ?
        `).run(
          analysis.verdict,
          analysis.verdict,
          analysis.confidence ?? event.confidence,
          JSON.stringify(analysis),
          zeekFlow ? 1 : (event.zeek_correlated ?? -1),
          event.id
        );

        const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
        broadcastEvent({ ...updated, type: 'VERDICT_UPDATED' });
        reanalyzed++;
      } catch (err) {
        // Network / timeout — silently skip, will retry next cycle
      }
    }

    if (reanalyzed > 0) {
      console.log(`[RE-CORRELATE] Re-analyzed ${reanalyzed}/${candidates.length} events via AI engine`);
    }
  } catch (err) {
    console.error('[RE-CORRELATE] Loop error:', err.message);
  }
}

setInterval(reCorrelateAndAnalyze, RECORRELATION_INTERVAL_MS);
console.log(`[RE-CORRELATE] Background loop scheduled every ${RECORRELATION_INTERVAL_MS / 1000}s (lookback ${RECORRELATION_LOOKBACK_MIN}min)`);

// ==================== ZEEK-ONLY ML DETECTION ====================
// ML was trained on CICIDS dataset which mirrors Zeek conn.log shape.
// → Run ML on every Zeek flow that has NO matching Suricata alert.
// If ML flags it as ALERT with high confidence, create a brand-new
// event sourced as "Zeek+ML" so it shows up on the Event Stream.
const ZEEK_ML_INTERVAL_MS = 30000;
const ZEEK_ML_LOOKBACK_MIN = 30;
const ZEEK_ML_BATCH = 100;
const ZEEK_ML_MIN_CONFIDENCE = 0.7; // anything below stays silent

// Track which Zeek flow IDs we've already pushed through ML to avoid re-processing
const processedZeekIds = new Set();

async function scanZeekOnlyFlows() {
  try {
    // Find recent Zeek flows that have NO matching Suricata event by community_id
    const flows = db.prepare(`
      SELECT z.* FROM zeek_flows z
      LEFT JOIN events e
        ON e.community_id IS NOT NULL
       AND e.community_id = z.community_id
      WHERE z.timestamp >= datetime('now', '-${ZEEK_ML_LOOKBACK_MIN} minutes')
        AND e.id IS NULL
      ORDER BY z.timestamp DESC
      LIMIT ${ZEEK_ML_BATCH}
    `).all();

    if (flows.length === 0) return;

    let created = 0;
    for (const zf of flows) {
      if (processedZeekIds.has(zf.id)) continue;
      processedZeekIds.add(zf.id);

      try {
        const res = await fetch(`${AI_ENGINE_URL}/analyze/zeek`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zeek_flow: zf }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const result = await res.json();
        const a = result?.analysis;
        if (!a) continue;

        // Only surface ALERTs with meaningful confidence
        if (a.verdict !== 'ALERT' || (a.confidence ?? 0) < ZEEK_ML_MIN_CONFIDENCE) continue;

        const newEvent = {
          id: uuidv4(),
          timestamp: zf.timestamp || new Date().toISOString(),
          src_ip: zf.src_ip || 'unknown',
          dst_ip: zf.dst_ip || 'unknown',
          src_port: zf.src_port || null,
          dst_port: zf.dst_port || null,
          protocol: (zf.protocol || 'TCP').toUpperCase(),
          attack_type: `ML Detected: ${a.reasoning || 'Anomalous Zeek flow'}`.substring(0, 200),
          verdict: 'ALERT',
          final_verdict: 'ALERT',
          confidence: a.confidence,
          source_engine: 'Zeek+ML',
          community_id: zf.community_id || null,
          flow_id: zf.uid || null,
          raw_log: JSON.stringify({ zeek_flow: zf, ml_analysis: a }),
          ai_analyzed: 1,
          ai_analysis: JSON.stringify(a),
          zeek_correlated: 1,
        };

        db.prepare(`
          INSERT INTO events (id, timestamp, src_ip, dst_ip, src_port, dst_port, protocol,
            attack_type, verdict, final_verdict, confidence, source_engine, community_id,
            flow_id, raw_log, ai_analyzed, ai_analysis, zeek_correlated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newEvent.id, newEvent.timestamp, newEvent.src_ip, newEvent.dst_ip,
          newEvent.src_port, newEvent.dst_port, newEvent.protocol, newEvent.attack_type,
          newEvent.verdict, newEvent.final_verdict, newEvent.confidence, newEvent.source_engine,
          newEvent.community_id, newEvent.flow_id, newEvent.raw_log,
          newEvent.ai_analyzed, newEvent.ai_analysis, newEvent.zeek_correlated
        );

        broadcastEvent({ ...newEvent, type: 'NEW_EVENT' });
        created++;
      } catch (err) {
        // Silent skip on AI engine errors — try again next cycle
      }
    }

    if (created > 0) {
      console.log(`[ZEEK-ML] Created ${created} ML-detected ALERT events from Zeek-only flows`);
    }

    // Trim memo set to avoid unbounded growth
    if (processedZeekIds.size > 5000) {
      const arr = Array.from(processedZeekIds);
      processedZeekIds.clear();
      arr.slice(-2000).forEach((x) => processedZeekIds.add(x));
    }
  } catch (err) {
    console.error('[ZEEK-ML] Loop error:', err.message);
  }
}

setInterval(scanZeekOnlyFlows, ZEEK_ML_INTERVAL_MS);
console.log(`[ZEEK-ML] Background ML scan scheduled every ${ZEEK_ML_INTERVAL_MS / 1000}s (min confidence ${ZEEK_ML_MIN_CONFIDENCE})`);

// ==================== API ENDPOINTS ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: clients.size,
    version: '2.0.0',
    mode: 'False Positive Reduction System'
  });
});

// Get server configuration info
app.get('/api/config', (req, res) => {
  const serverIP = req.ip || req.socket.localAddress || '0.0.0.0';
  res.json({
    ingest_endpoint: `http://${req.headers.host}/api/ingest`,
    suricata_endpoint: `http://${req.headers.host}/api/ingest/suricata`,
    zeek_endpoint: `http://${req.headers.host}/api/ingest/zeek`,
    websocket: `ws://${req.headers.host.replace(/:\d+$/, '')}:${WS_PORT}`,
    server_ip: serverIP,
    port: PORT,
    ws_port: WS_PORT,
    system_mode: 'False Positive Reduction',
    correlation_engine: 'active'
  });
});

// Get connected sources (NIDS machines sending logs)
app.get('/api/sources', (req, res) => {
  try {
    const sources = db.prepare(`
      SELECT * FROM connected_sources 
      ORDER BY last_seen DESC
    `).all();
    
    res.json(sources);
  } catch (error) {
    console.error('[API] Error fetching sources:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all events with filtering
app.get('/api/events', (req, res) => {
  try {
    const { 
      limit = 20000,
      offset = 0, 
      verdict, 
      src_ip, 
      time_range,
      attack_type,
      correlated_only
    } = req.query;

    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (verdict && verdict !== 'All') {
      query += ' AND (verdict = ? OR final_verdict = ?)';
      params.push(verdict, verdict);
    }

    if (src_ip) {
      query += ' AND src_ip LIKE ?';
      params.push(`%${src_ip}%`);
    }

    if (attack_type) {
      query += ' AND attack_type LIKE ?';
      params.push(`%${attack_type}%`);
    }

    if (correlated_only === 'true') {
      query += ' AND zeek_correlated = 1';
    }

    if (time_range) {
      const now = new Date();
      let startTime;
      switch (time_range) {
        case '1h': startTime = new Date(now - 3600000); break;
        case '6h': startTime = new Date(now - 21600000); break;
        case '24h': startTime = new Date(now - 86400000); break;
        case '7d': startTime = new Date(now - 604800000); break;
        default: startTime = null;
      }
      if (startTime) {
        query += ' AND timestamp >= ?';
        params.push(startTime.toISOString());
      }
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const events = db.prepare(query).all(...params);
    res.json(events);
  } catch (error) {
    console.error('[API] Error fetching events:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get event with Zeek correlation data for AI analysis
app.get('/api/events/:id/full', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Get related Zeek flows
    let zeekFlows = [];
    if (event.community_id) {
      zeekFlows = db.prepare(`
        SELECT * FROM zeek_flows WHERE community_id = ?
      `).all(event.community_id);
    }
    
    // Get all events from same source IP in last hour
    const relatedEvents = db.prepare(`
      SELECT * FROM events 
      WHERE src_ip = ? 
      AND id != ?
      AND timestamp >= datetime(?, '-1 hour')
      ORDER BY timestamp DESC
      LIMIT 20
    `).all(event.src_ip, event.id, event.timestamp);
    
    res.json({
      event,
      zeek_flows: zeekFlows,
      related_events: relatedEvents,
      correlation_status: event.zeek_correlated === 1 ? 'correlated' : 
                          event.zeek_correlated === -1 ? 'no_match' : 'pending'
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all events from an IP for AI analysis
app.get('/api/events/by-ip/:ip', (req, res) => {
  try {
    const { ip } = req.params;
    const { limit = 100 } = req.query;
    
    const events = db.prepare(`
      SELECT * FROM events 
      WHERE src_ip = ? OR dst_ip = ?
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(ip, ip, parseInt(limit));
    
    const zeekFlows = db.prepare(`
      SELECT * FROM zeek_flows 
      WHERE src_ip = ? OR dst_ip = ?
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(ip, ip, parseInt(limit));
    
    res.json({ 
      events, 
      zeek_flows: zeekFlows,
      total_events: events.length,
      total_flows: zeekFlows.length
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get metrics
app.get('/api/metrics', (req, res) => {
  try {
    const timeRange = req.query.time_range || '1h';
    const now = new Date();
    let startTime;
    
    switch (timeRange) {
      case '1h': startTime = new Date(now - 3600000); break;
      case '6h': startTime = new Date(now - 21600000); break;
      case '24h': startTime = new Date(now - 86400000); break;
      case '7d': startTime = new Date(now - 604800000); break;
      default: startTime = new Date(now - 3600000);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM events WHERE timestamp >= ?
    `).get(startTime.toISOString());

    const byVerdict = db.prepare(`
      SELECT verdict, COUNT(*) as count FROM events 
      WHERE timestamp >= ? GROUP BY verdict
    `).all(startTime.toISOString());

    const uniqueSources = db.prepare(`
      SELECT COUNT(DISTINCT src_ip) as count FROM events WHERE timestamp >= ?
    `).get(startTime.toISOString());

    const topSources = db.prepare(`
      SELECT src_ip as ip, COUNT(*) as count FROM events 
      WHERE timestamp >= ? 
      GROUP BY src_ip ORDER BY count DESC LIMIT 10
    `).all(startTime.toISOString());

    const attackTypes = db.prepare(`
      SELECT attack_type as type, COUNT(*) as count FROM events 
      WHERE timestamp >= ? AND attack_type IS NOT NULL
      GROUP BY attack_type ORDER BY count DESC LIMIT 10
    `).all(startTime.toISOString());

    // Correlation stats
    const correlationStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN zeek_correlated = 1 THEN 1 ELSE 0 END) as correlated,
        SUM(CASE WHEN zeek_correlated = -1 THEN 1 ELSE 0 END) as uncorrelated,
        SUM(CASE WHEN zeek_correlated = 0 THEN 1 ELSE 0 END) as pending
      FROM events WHERE timestamp >= ?
    `).get(startTime.toISOString());

    const verdictMap = {};
    byVerdict.forEach(v => verdictMap[v.verdict] = v.count);

    res.json({
      totalEvents: total.count,
      criticalAlerts: verdictMap['ALERT'] || 0,
      suspicious: verdictMap['SUSPICIOUS'] || 0,
      falsePositives: verdictMap['FALSE_POSITIVE'] || 0,
      benign: verdictMap['BENIGN'] || 0,
      pending: verdictMap['PENDING'] || 0,
      uniqueSources: uniqueSources.count,
      topSources,
      attackTypes,
      correlation: correlationStats
    });
  } catch (error) {
    console.error('[API] Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get traffic data for charts
app.get('/api/traffic', (req, res) => {
  try {
    const timeRange = req.query.time_range || '1h';
    const now = new Date();
    let startTime;
    
    switch (timeRange) {
      case '1h': startTime = new Date(now - 3600000); break;
      case '6h': startTime = new Date(now - 21600000); break;
      case '24h': startTime = new Date(now - 86400000); break;
      default: startTime = new Date(now - 3600000);
    }

    const data = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:%M', timestamp) as time_bucket,
        COUNT(*) as total,
        SUM(CASE WHEN verdict = 'ALERT' THEN 1 ELSE 0 END) as alerts,
        SUM(CASE WHEN zeek_correlated = 1 THEN 1 ELSE 0 END) as correlated
      FROM events 
      WHERE timestamp >= ?
      GROUP BY time_bucket
      ORDER BY time_bucket
    `).all(startTime.toISOString());

    res.json(data);
  } catch (error) {
    console.error('[API] Error fetching traffic:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== LOG INGESTION ====================

// Suricata EVE JSON ingestion
app.post('/api/ingest/suricata', (req, res) => {
  try {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    updateConnectedSource(clientIP, 'Suricata', req);
    
    let logs = [];
    if (typeof req.body === 'string') {
      logs = req.body.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } else {
      logs = Array.isArray(req.body) ? req.body : [req.body];
    }

    let inserted = 0;
    const insertStmt = db.prepare(`
      INSERT INTO events (id, timestamp, src_ip, dst_ip, src_port, dst_port, protocol, 
        attack_type, verdict, confidence, source_engine, community_id, flow_id, raw_log)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((logs) => {
      for (const log of logs) {
        if (log.event_type !== 'alert') continue;

        const event = {
          id: uuidv4(),
          timestamp: log.timestamp || new Date().toISOString(),
          src_ip: log.src_ip || 'unknown',
          dst_ip: log.dest_ip || 'unknown',
          src_port: log.src_port || null,
          dst_port: log.dest_port || null,
          protocol: log.proto || 'unknown',
          attack_type: log.alert?.signature || 'Unknown Suricata Alert',
          verdict: 'PENDING', // Always start as PENDING - wait for Zeek correlation
          confidence: (log.alert?.severity ? (4 - log.alert.severity) / 3 : 0.5),
          source_engine: 'Suricata',
          community_id: log.community_id || null,
          flow_id: log.flow_id?.toString() || null,
          raw_log: JSON.stringify(log)
        };

        insertStmt.run(
          event.id, event.timestamp, event.src_ip, event.dst_ip,
          event.src_port, event.dst_port, event.protocol, event.attack_type,
          event.verdict, event.confidence, event.source_engine,
          event.community_id, event.flow_id, event.raw_log
        );

        broadcastEvent({ ...event, status: 'pending_correlation' });
        inserted++;
      }
    });

    insertMany(logs);
    console.log(`[SURICATA] Received ${inserted} alerts from ${clientIP}`);
    res.json({ success: true, inserted, status: 'pending_zeek_correlation' });
  } catch (error) {
    console.error('[SURICATA] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Zeek log ingestion
app.post('/api/ingest/zeek', (req, res) => {
  try {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    updateConnectedSource(clientIP, 'Zeek', req);
    
    let logs = [];
    if (typeof req.body === 'string') {
      const lines = req.body.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      logs = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          const fields = line.split('\t');
          return { raw: line, fields };
        }
      });
    } else {
      logs = Array.isArray(req.body) ? req.body : [req.body];
    }

    let inserted = 0;
    const insertStmt = db.prepare(`
      INSERT INTO zeek_flows (id, timestamp, uid, community_id, src_ip, dst_ip, 
        src_port, dst_port, protocol, service, duration, orig_bytes, resp_bytes, 
        conn_state, raw_log)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((logs) => {
      for (const log of logs) {
        const flow = {
          id: uuidv4(),
          timestamp: log.ts ? new Date(parseFloat(log.ts) * 1000).toISOString() : new Date().toISOString(),
          uid: log.uid || null,
          community_id: log.community_id || null,
          src_ip: log['id.orig_h'] || log.src_ip || 'unknown',
          dst_ip: log['id.resp_h'] || log.dst_ip || 'unknown',
          src_port: log['id.orig_p'] || log.src_port || null,
          dst_port: log['id.resp_p'] || log.dst_port || null,
          protocol: log.proto || 'unknown',
          service: log.service || null,
          duration: log.duration || null,
          orig_bytes: log.orig_bytes || 0,
          resp_bytes: log.resp_bytes || 0,
          conn_state: log.conn_state || null,
          raw_log: JSON.stringify(log)
        };

        insertStmt.run(
          flow.id, flow.timestamp, flow.uid, flow.community_id,
          flow.src_ip, flow.dst_ip, flow.src_port, flow.dst_port,
          flow.protocol, flow.service, flow.duration, flow.orig_bytes,
          flow.resp_bytes, flow.conn_state, flow.raw_log
        );

        inserted++;
      }
    });

    insertMany(logs);
    console.log(`[ZEEK] Received ${inserted} flows from ${clientIP}`);
    
    // Trigger correlation check
    processPendingAlerts();
    
    res.json({ success: true, inserted });
  } catch (error) {
    console.error('[ZEEK] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update event verdict after AI analysis
app.post('/api/events/:id/verdict', (req, res) => {
  try {
    const { verdict, analysis } = req.body;
    
    db.prepare(`
      UPDATE events SET 
        final_verdict = ?,
        ai_analyzed = 1,
        ai_analysis = ?
      WHERE id = ?
    `).run(verdict, JSON.stringify(analysis), req.params.id);
    
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    broadcastEvent({ ...event, type: 'VERDICT_UPDATED' });
    
    res.json({ success: true, event });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║       SOC Dashboard - False Positive Reduction System v2.0       ║
║            C1NE.03 Team - Cybersecurity K28 - DTU                ║
╠══════════════════════════════════════════════════════════════════╣
║  REST API:    http://0.0.0.0:${PORT}                                ║
║  WebSocket:   ws://0.0.0.0:${WS_PORT}                                 ║
╠══════════════════════════════════════════════════════════════════╣
║  System Flow:                                                    ║
║    1. Suricata alert → PENDING                                   ║
║    2. Correlate with Zeek flow (community_id / 5-tuple)          ║
║    3. AI analysis → Final verdict                                ║
╠══════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                      ║
║    POST /api/ingest/suricata  - Receive Suricata alerts          ║
║    POST /api/ingest/zeek      - Receive Zeek flows               ║
║    GET  /api/sources          - View connected NIDS machines     ║
║    GET  /api/events/:id/full  - Get event + Zeek correlation     ║
╚══════════════════════════════════════════════════════════════════╝
  `);
});
