"""
Ingest endpoint for receiving logs from NIDS shipper (ai_log_shipper.py)
Endpoint: POST /ingest
Format: { "source": "suricata" | "zeek" | "zeek_http", "data": {...} }
"""
import logging
import asyncio
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
from uuid import uuid4
from collections import deque

import requests
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from config import NODEJS_BACKEND_URL, WHITELIST_IPS, should_auto_block, get_auto_block_status
from pfsense_client import block_ip_on_pfsense
from utils import calculate_community_id, extract_community_id_from_event, normalize_event

logger = logging.getLogger("INGEST")

router = APIRouter()

# WebSocket connections for real-time dashboard updates
ws_clients: List[WebSocket] = []

# In-memory log buffer for debugging (last 500 entries)
ingest_logs: deque = deque(maxlen=500)

# Last time the shipper sent us anything (even if ignored)
last_shipper_seen: Optional[datetime] = None
last_shipper_seen_by_source: Dict[str, datetime] = {}

def add_ingest_log(level: str, source: str, message: str, details: Dict[str, Any] = None):
    """Add a log entry to the in-memory buffer for debugging"""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "level": level,
        "source": source,
        "message": message,
        "details": details or {}
    }
    ingest_logs.append(entry)
    
    # Also log to standard logger
    if level == "ERROR":
        logger.error(f"[{source}] {message}")
    elif level == "WARNING":
        logger.warning(f"[{source}] {message}")
    else:
        logger.info(f"[{source}] {message}")


class IngestRequest(BaseModel):
    source: str  # "suricata", "zeek", "zeek_http"
    data: Dict[str, Any]


# ==================== WEBSOCKET ====================

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time event streaming to dashboard"""
    await websocket.accept()
    ws_clients.append(websocket)
    logger.info(f"[WS] Client connected. Total: {len(ws_clients)}")
    
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_clients.remove(websocket)
        logger.info(f"[WS] Client disconnected. Total: {len(ws_clients)}")


async def broadcast_event(event: Dict[str, Any]):
    """Broadcast event to all connected WebSocket clients"""
    if not ws_clients:
        return
    
    message = json.dumps({"type": "NEW_EVENT", "data": event})
    disconnected = []
    
    for client in ws_clients:
        try:
            await client.send_text(message)
        except Exception:
            disconnected.append(client)
    
    # Remove disconnected clients
    for client in disconnected:
        ws_clients.remove(client)


# ==================== PARSERS ====================

def ensure_community_id(data: Dict[str, Any]) -> str:
    """
    Đảm bảo có community_id cho event.
    Nếu không có sẵn, tính toán từ 5-tuple.
    """
    # Check existing
    existing = data.get("community_id", "")
    if existing and existing.startswith("1:"):
        return existing
    
    # Extract 5-tuple from various formats
    src_ip = data.get("src_ip") or data.get("id.orig_h") or ""
    dst_ip = data.get("dest_ip") or data.get("dst_ip") or data.get("id.resp_h") or ""
    src_port = data.get("src_port") or data.get("id.orig_p") or 0
    dst_port = data.get("dest_port") or data.get("dst_port") or data.get("id.resp_p") or 0
    protocol = data.get("proto") or data.get("protocol") or "TCP"
    
    if src_ip and dst_ip:
        return calculate_community_id(src_ip, dst_ip, int(src_port or 0), int(dst_port or 0), protocol)
    
    return ""


def parse_suricata_alert(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parse Suricata alert event.
    Suricata là nguồn duy nhất tạo ALERT.
    """
    if data.get("event_type") != "alert":
        return None
    
    alert = data.get("alert", {})
    
    # Ensure community_id
    community_id = ensure_community_id(data)
    
    return {
        "id": f"EVT-{int(datetime.now().timestamp() * 1000)}-{str(uuid4())[:3]}",
        "timestamp": data.get("timestamp", datetime.now().isoformat()),
        "src_ip": data.get("src_ip", ""),
        "dst_ip": data.get("dest_ip", ""),
        "src_port": data.get("src_port"),
        "dst_port": data.get("dest_port"),
        "protocol": (data.get("proto", "TCP") or "TCP").upper(),
        "attack_type": alert.get("signature", "Unknown Alert"),
        "verdict": "ALERT",  # Suricata alerts are always ALERT initially
        "confidence": min(1.0, max(0.0, (4 - alert.get("severity", 2)) / 3)),
        "source_engine": "Suricata",
        "community_id": community_id,
        "flow_id": str(data.get("flow_id", "")),
        "raw_log": json.dumps(data, indent=2),
    }


def parse_zeek_conn(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse Zeek conn.log.
    
    QUAN TRỌNG: Zeek KHÔNG tạo ALERT - chỉ log metadata connections.
    Verdict chỉ có thể là SUSPICIOUS hoặc BENIGN dựa trên connection state.
    """
    conn_state = data.get("conn_state", "") or ""
    service = data.get("service", "-") or "-"
    
    # Ensure community_id
    community_id = ensure_community_id(data)
    
    # Zeek chỉ có SUSPICIOUS hoặc BENIGN, KHÔNG BAO GIỜ có ALERT
    verdict = "BENIGN"
    confidence = 0.3
    attack_type = f"Zeek Connection: {service}"
    
    # Suspicious connection states
    if conn_state in ["REJ", "RSTO", "RSTOS0"]:
        verdict = "SUSPICIOUS"
        confidence = 0.6
        attack_type = f"Zeek: Connection Rejected ({conn_state})"
    elif conn_state == "S0":
        verdict = "SUSPICIOUS"
        confidence = 0.5
        attack_type = f"Zeek: No Response ({conn_state})"
    elif conn_state in ["S1", "S2", "S3"]:
        verdict = "SUSPICIOUS"
        confidence = 0.4
        attack_type = f"Zeek: Incomplete Connection ({conn_state})"
    elif conn_state == "SF":
        # Successful connection - benign
        verdict = "BENIGN"
        confidence = 0.2
        attack_type = f"Zeek: Normal Connection ({service})"
    
    return {
        "id": f"EVT-{int(datetime.now().timestamp() * 1000)}-{str(uuid4())[:3]}",
        "timestamp": data.get("ts", datetime.now().isoformat()),
        "src_ip": data.get("id.orig_h", ""),
        "dst_ip": data.get("id.resp_h", ""),
        "src_port": data.get("id.orig_p"),
        "dst_port": data.get("id.resp_p"),
        "protocol": (data.get("proto", "tcp") or "tcp").upper(),
        "attack_type": attack_type,
        "verdict": verdict,  # NEVER "ALERT" for Zeek
        "confidence": confidence,
        "source_engine": "Zeek",
        "community_id": community_id,
        "raw_log": json.dumps(data, indent=2),
    }


def parse_zeek_http(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse Zeek http.log.
    
    Zeek HTTP logs có thể phát hiện patterns nghi ngờ nhưng verdict vẫn là SUSPICIOUS,
    KHÔNG PHẢI ALERT (chỉ Suricata mới có ALERT).
    """
    method = data.get("method", "GET") or "GET"
    host = data.get("host", "") or ""
    uri = data.get("uri", "/") or "/"
    status_code = data.get("status_code", 0) or 0
    
    # Ensure community_id
    community_id = ensure_community_id(data)
    
    # Zeek HTTP: SUSPICIOUS hoặc BENIGN, KHÔNG BAO GIỜ ALERT
    verdict = "BENIGN"
    confidence = 0.3
    attack_type = f"Zeek HTTP: {method} {host}{uri}"[:100]
    
    # SQL Injection indicators -> SUSPICIOUS (not ALERT)
    sql_patterns = ["'", "\"", ";", "--", "union", "select", "drop", "insert"]
    if any(p in uri.lower() for p in sql_patterns):
        verdict = "SUSPICIOUS"
        confidence = 0.7
        attack_type = "Zeek: Potential SQL Injection Pattern"
    
    # XSS indicators -> SUSPICIOUS
    xss_patterns = ["<script", "javascript:", "onerror=", "onload="]
    if any(p in uri.lower() for p in xss_patterns):
        verdict = "SUSPICIOUS"
        confidence = 0.65
        attack_type = "Zeek: Potential XSS Pattern"
    
    # Path traversal -> SUSPICIOUS
    if "../" in uri or "..%2f" in uri.lower():
        verdict = "SUSPICIOUS"
        confidence = 0.6
        attack_type = "Zeek: Path Traversal Pattern"
    
    return {
        "id": f"EVT-{int(datetime.now().timestamp() * 1000)}-{str(uuid4())[:3]}",
        "timestamp": data.get("ts", datetime.now().isoformat()),
        "src_ip": data.get("id.orig_h", ""),
        "dst_ip": data.get("id.resp_h", ""),
        "src_port": data.get("id.orig_p"),
        "dst_port": data.get("id.resp_p", 80),
        "protocol": "HTTP",
        "attack_type": attack_type,
        "verdict": verdict,  # NEVER "ALERT" for Zeek
        "confidence": confidence,
        "source_engine": "Zeek",
        "community_id": community_id,
        "raw_log": json.dumps(data, indent=2),
    }


async def auto_block_from_ingest(ip: str, signature: str):
    """
    Auto-block IP directly from ingest if enabled and signature matches dangerous patterns.
    This is called in real-time when critical events are received.
    
    CHỈ BLOCK từ Suricata ALERT, không block từ Zeek (vì Zeek không có ALERT).
    """
    if not get_auto_block_status():
        return
    
    if ip in WHITELIST_IPS:
        logger.info(f"[AUTO-BLOCK] IP {ip} is whitelisted, skipping")
        return
    
    if not should_auto_block(signature):
        logger.debug(f"[AUTO-BLOCK] Signature '{signature}' is not critical, skipping")
        return
    
    logger.warning(f"🚨 [AUTO-BLOCK] Critical signature detected: '{signature}' from IP {ip}")
    
    success, message, _ = block_ip_on_pfsense(ip)
    if success:
        logger.info(f"🔒 [AUTO-BLOCK] Blocked IP {ip}: {message}")
    else:
        logger.warning(f"[AUTO-BLOCK] Failed to block IP {ip}: {message}")


# ==================== INGEST ENDPOINT ====================

@router.post("/ingest")
async def ingest_log(req: IngestRequest):
    """
    Receive logs from NIDS shipper and:
    1. Parse log based on source type
    2. Calculate/verify community_id for correlation
    3. Store in database via Node.js backend
    4. Broadcast to connected WebSocket clients (real-time dashboard)
    5. Auto-block if critical Suricata ALERT (not Zeek)
    """
    try:
        # Track shipper activity (used by healthcheck)
        global last_shipper_seen, last_shipper_seen_by_source
        last_shipper_seen = datetime.now()
        last_shipper_seen_by_source[req.source] = last_shipper_seen

        add_ingest_log("INFO", req.source.upper(), f"Received log from shipper", {
            "has_data": bool(req.data),
            "data_keys": list(req.data.keys())[:10] if req.data else []
        })
        
        # Parse based on source type
        event = None
        
        if req.source == "suricata":
            event = parse_suricata_alert(req.data)
            if not event:
                add_ingest_log("INFO", "SURICATA", "Ignored non-alert event", {
                    "event_type": req.data.get("event_type", "unknown")
                })
        elif req.source == "zeek":
            event = parse_zeek_conn(req.data)
        elif req.source == "zeek_http":
            event = parse_zeek_http(req.data)
        else:
            add_ingest_log("WARNING", "UNKNOWN", f"Unknown source type: {req.source}")
        
        if not event:
            return {"status": "ignored", "reason": "not a relevant event type"}
        
        # Skip events without valid IPs
        if not event.get("src_ip") or not event.get("dst_ip"):
            add_ingest_log("WARNING", req.source.upper(), "Event missing IP addresses", {
                "src_ip": event.get("src_ip"),
                "dst_ip": event.get("dst_ip")
            })
            return {"status": "ignored", "reason": "missing IP addresses"}
        
        # Log successful parse
        add_ingest_log("INFO", req.source.upper(), f"Parsed event: {event['verdict']}", {
            "event_id": event["id"],
            "src_ip": event["src_ip"],
            "dst_ip": event["dst_ip"],
            "attack_type": event.get("attack_type", "")[:50],
            "confidence": event.get("confidence", 0),
            "community_id": event.get("community_id", "")[:20] if event.get("community_id") else None
        })
        
        # Store event in Node.js backend database
        try:
            response = requests.post(
                f"{NODEJS_BACKEND_URL}/api/ingest",
                json=event,
                timeout=2,
            )
            if response.status_code != 200:
                add_ingest_log("WARNING", "BACKEND", f"Failed to store event: HTTP {response.status_code}")
            else:
                add_ingest_log("INFO", "BACKEND", "Event stored successfully")
        except Exception as e:
            add_ingest_log("ERROR", "BACKEND", f"Backend unavailable: {str(e)}")
        
        # Broadcast to connected dashboards (real-time)
        asyncio.create_task(broadcast_event(event))
        add_ingest_log("INFO", "WEBSOCKET", f"Broadcasting to {len(ws_clients)} clients")
        
        # Auto-block CHỈ từ Suricata ALERT với critical signature
        # Zeek không có ALERT nên không trigger auto-block
        if (event.get("source_engine") == "Suricata" and 
            event.get("verdict") == "ALERT" and 
            event.get("confidence", 0) >= 0.7):
            signature = event.get("attack_type", "")
            src_ip = event.get("src_ip", "")
            if src_ip and signature:
                add_ingest_log("WARNING", "AUTO-BLOCK", f"Triggering auto-block for {src_ip}", {
                    "signature": signature
                })
                asyncio.create_task(auto_block_from_ingest(src_ip, signature))
        
        return {
            "status": "ok",
            "event_id": event["id"],
            "verdict": event["verdict"],
            "community_id": event.get("community_id", ""),
        }
    
    except Exception as e:
        add_ingest_log("ERROR", "INGEST", f"Error processing log: {str(e)}", {
            "source": req.source,
            "error": str(e)
        })
        return {"status": "error", "message": str(e)}


@router.get("/ingest/status")
async def ingest_status():
    """Get ingest endpoint status"""
    return {
        "status": "ok",
        "connected_clients": len(ws_clients),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/ingest/health")
async def ingest_health(max_age_seconds: int = 120):
    """Healthcheck for NIDS shipper activity (does not affect dashboard status indicator)."""
    now = datetime.now()

    if last_shipper_seen is None:
        return {
            "shipper_seen": False,
            "shipper_last_seen": None,
            "shipper_age_seconds": None,
            "max_age_seconds": max_age_seconds,
            "connected_ws_clients": len(ws_clients),
        }

    age = int((now - last_shipper_seen).total_seconds())
    return {
        "shipper_seen": True,
        "shipper_last_seen": last_shipper_seen.isoformat(),
        "shipper_age_seconds": age,
        "max_age_seconds": max_age_seconds,
        "shipper_is_recent": age <= max_age_seconds,
        "by_source": {k: v.isoformat() for k, v in last_shipper_seen_by_source.items()},
        "connected_ws_clients": len(ws_clients),
    }


@router.get("/ingest/logs")
async def get_ingest_logs(limit: int = 100, level: str = None, source: str = None):
    """
    Get recent ingest logs for debugging.
    
    Query params:
    - limit: Max number of logs to return (default 100, max 500)
    - level: Filter by level (INFO, WARNING, ERROR)
    - source: Filter by source (suricata, zeek, zeek_http)
    """
    limit = min(limit, 500)
    
    logs = list(ingest_logs)
    
    # Apply filters
    if level:
        logs = [l for l in logs if l["level"].upper() == level.upper()]
    if source:
        logs = [l for l in logs if source.lower() in l["source"].lower()]
    
    # Return most recent first
    logs = logs[-limit:]
    logs.reverse()
    
    return {
        "logs": logs,
        "total": len(ingest_logs),
        "filtered": len(logs),
        "connected_ws_clients": len(ws_clients),
    }


@router.delete("/ingest/logs")
async def clear_ingest_logs():
    """Clear all ingest logs"""
    ingest_logs.clear()
    add_ingest_log("INFO", "SYSTEM", "Logs cleared by user")
    return {"status": "ok", "message": "Logs cleared"}
