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

import requests
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from config import NODEJS_BACKEND_URL, WHITELIST_IPS, should_auto_block, get_auto_block_status
from pfsense_client import block_ip_on_pfsense

logger = logging.getLogger("INGEST")

router = APIRouter()

# WebSocket connections for real-time dashboard updates
ws_clients: List[WebSocket] = []


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

def parse_suricata_alert(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Parse Suricata alert event"""
    if data.get("event_type") != "alert":
        return None
    
    alert = data.get("alert", {})
    
    return {
        "id": f"EVT-{int(datetime.now().timestamp() * 1000)}-{str(uuid4())[:3]}",
        "timestamp": data.get("timestamp", datetime.now().isoformat()),
        "src_ip": data.get("src_ip", ""),
        "dst_ip": data.get("dest_ip", ""),
        "src_port": data.get("src_port"),
        "dst_port": data.get("dest_port"),
        "protocol": data.get("proto", "TCP"),
        "attack_type": alert.get("signature", "Unknown Alert"),
        "verdict": "ALERT",
        "confidence": min(1.0, max(0.0, (4 - alert.get("severity", 2)) / 3)),
        "source_engine": "Suricata",
        "community_id": data.get("community_id", ""),
        "flow_id": str(data.get("flow_id", "")),
        "raw_log": json.dumps(data, indent=2),
    }


def parse_zeek_conn(data: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Zeek conn.log"""
    conn_state = data.get("conn_state", "")
    
    # Determine verdict based on connection state
    verdict = "SUSPICIOUS"
    confidence = 0.5
    attack_type = f"Connection: {data.get('service', 'unknown')}"
    
    # Suspicious connection states
    if conn_state in ["REJ", "RSTO", "RSTOS0", "S0"]:
        verdict = "ALERT"
        confidence = 0.7
        attack_type = f"Suspicious Connection ({conn_state})"
    
    return {
        "id": f"EVT-{int(datetime.now().timestamp() * 1000)}-{str(uuid4())[:3]}",
        "timestamp": data.get("ts", datetime.now().isoformat()),
        "src_ip": data.get("id.orig_h", ""),
        "dst_ip": data.get("id.resp_h", ""),
        "src_port": data.get("id.orig_p"),
        "dst_port": data.get("id.resp_p"),
        "protocol": (data.get("proto", "tcp")).upper(),
        "attack_type": attack_type,
        "verdict": verdict,
        "confidence": confidence,
        "source_engine": "Zeek",
        "community_id": data.get("community_id", ""),
        "raw_log": json.dumps(data, indent=2),
    }


def parse_zeek_http(data: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Zeek http.log"""
    method = data.get("method", "GET")
    host = data.get("host", "")
    uri = data.get("uri", "/")
    status_code = data.get("status_code", 0)
    
    # Basic threat detection
    verdict = "SUSPICIOUS"
    confidence = 0.4
    attack_type = f"HTTP {method} {host}{uri}"[:100]
    
    # SQL Injection indicators
    sql_patterns = ["'", "\"", ";", "--", "union", "select", "drop", "insert"]
    if any(p in uri.lower() for p in sql_patterns):
        verdict = "ALERT"
        confidence = 0.85
        attack_type = "Potential SQL Injection"
    
    # XSS indicators
    xss_patterns = ["<script", "javascript:", "onerror=", "onload="]
    if any(p in uri.lower() for p in xss_patterns):
        verdict = "ALERT"
        confidence = 0.80
        attack_type = "Potential XSS Attack"
    
    # Path traversal
    if "../" in uri or "..%2f" in uri.lower():
        verdict = "ALERT"
        confidence = 0.75
        attack_type = "Path Traversal Attempt"
    
    return {
        "id": f"EVT-{int(datetime.now().timestamp() * 1000)}-{str(uuid4())[:3]}",
        "timestamp": data.get("ts", datetime.now().isoformat()),
        "src_ip": data.get("id.orig_h", ""),
        "dst_ip": data.get("id.resp_h", ""),
        "src_port": data.get("id.orig_p"),
        "dst_port": data.get("id.resp_p", 80),
        "protocol": "HTTP",
        "attack_type": attack_type,
        "verdict": verdict,
        "confidence": confidence,
        "source_engine": "Zeek",
        "community_id": data.get("community_id", ""),
        "raw_log": json.dumps(data, indent=2),
    }


async def auto_block_from_ingest(ip: str, signature: str):
    """
    Auto-block IP directly from ingest if enabled and signature matches dangerous patterns.
    This is called in real-time when critical events are received.
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
    2. Store in database via Node.js backend
    3. Broadcast to connected WebSocket clients (real-time dashboard)
    """
    try:
        # Parse based on source type
        event = None
        
        if req.source == "suricata":
            event = parse_suricata_alert(req.data)
        elif req.source == "zeek":
            event = parse_zeek_conn(req.data)
        elif req.source == "zeek_http":
            event = parse_zeek_http(req.data)
        
        if not event:
            return {"status": "ignored", "reason": "not a relevant event type"}
        
        # Skip events without valid IPs
        if not event.get("src_ip") or not event.get("dst_ip"):
            return {"status": "ignored", "reason": "missing IP addresses"}
        
        # Store event in Node.js backend database
        try:
            response = requests.post(
                f"{NODEJS_BACKEND_URL}/api/ingest",
                json=event,
                timeout=2,
            )
            if response.status_code != 200:
                logger.warning(f"Failed to store event in backend: {response.status_code}")
        except Exception as e:
            logger.warning(f"Backend unavailable: {e}")
        
        # Broadcast to connected dashboards (real-time)
        asyncio.create_task(broadcast_event(event))
        
        # Auto-block if critical signature and auto-block is enabled
        if event.get("verdict") == "ALERT" and event.get("confidence", 0) >= 0.7:
            signature = event.get("attack_type", "")
            src_ip = event.get("src_ip", "")
            if src_ip and signature:
                asyncio.create_task(auto_block_from_ingest(src_ip, signature))
        
        logger.debug(f"[INGEST] {req.source}: {event['src_ip']} -> {event['dst_ip']} ({event['attack_type']})")
        
        return {
            "status": "ok",
            "event_id": event["id"],
            "verdict": event["verdict"],
        }
    
    except Exception as e:
        logger.error(f"[INGEST] Error processing log: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/ingest/status")
async def ingest_status():
    """Get ingest endpoint status"""
    return {
        "status": "ok",
        "connected_clients": len(ws_clients),
        "timestamp": datetime.now().isoformat(),
    }
