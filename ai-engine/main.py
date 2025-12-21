"""
AI-SOC Engine - Main FastAPI Application
Hệ thống AI phân tích log để giảm thiểu False Positive
Tích hợp MegaLLM cho AI Assistant
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

import requests
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import (
    get_auto_block_status,
    set_auto_block_status,
    NODEJS_BACKEND_URL,
    WHITELIST_IPS,
    should_auto_block,
    get_attack_severity,
)
from ai_analyzer import analyze_flow, analyze_ip_flows, load_models, AI_BRAIN
from pfsense_client import block_ip_on_pfsense, unblock_ip_on_pfsense, get_blocked_ips
from megallm_client import (
    chat_with_megallm,
    generate_playbook,
    analyze_ip_with_llm,
    MEGALLM_MODELS,
    MEGALLM_DEFAULT_MODEL,
    MEGALLM_API_KEY,
)
from ingest import router as ingest_router
from telegram_bot import telegram_bot, handle_telegram_update, configure_bot

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("AI_ENGINE")

# FastAPI app
app = FastAPI(
    title="AI-SOC False Positive Reduction Engine",
    description="Hệ thống AI phân tích log Suricata + Zeek với MegaLLM Assistant",
    version="2.3.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include ingest router for /ingest endpoint
app.include_router(ingest_router)


# ==================== MODELS ====================

class AnalyzeFlowRequest(BaseModel):
    event_id: str
    suricata_alert: Dict[str, Any]
    zeek_flows: Optional[List[Dict[str, Any]]] = None


class AnalyzeIPRequest(BaseModel):
    ip: str
    events: List[Dict[str, Any]]
    zeek_flows: List[Dict[str, Any]]


class BlockIPRequest(BaseModel):
    ip: str
    reason: Optional[str] = None


class AutoBlockConfig(BaseModel):
    enabled: bool


class ChatRequest(BaseModel):
    prompt: str
    events: Optional[List[Dict[str, Any]]] = None
    zeek_flows: Optional[List[Dict[str, Any]]] = None
    model: Optional[str] = None


class PlaybookRequest(BaseModel):
    event: Dict[str, Any]
    zeek_flows: Optional[List[Dict[str, Any]]] = None
    model: Optional[str] = None


class IPAnalysisRequest(BaseModel):
    ip: str
    events: List[Dict[str, Any]]
    zeek_flows: Optional[List[Dict[str, Any]]] = None
    model: Optional[str] = None


# ==================== ROUTES ====================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "models_loaded": bool(AI_BRAIN),
        "megallm_configured": bool(MEGALLM_API_KEY),
        "auto_block_enabled": get_auto_block_status(),
    }


@app.get("/status")
async def get_status():
    """Get detailed system status"""
    return {
        "ai_engine": {
            "status": "running",
            "models_loaded": list(AI_BRAIN.keys()) if AI_BRAIN else [],
            "version": "2.2.0",
        },
        "megallm": {
            "configured": bool(MEGALLM_API_KEY),
            "default_model": MEGALLM_DEFAULT_MODEL,
            "available_models": MEGALLM_MODELS,
        },
        "auto_block": {
            "enabled": get_auto_block_status(),
        },
        "whitelist": list(WHITELIST_IPS),
    }


@app.post("/reload-models")
async def reload_models():
    """Reload AI models from disk"""
    success = load_models()
    return {
        "success": success,
        "models_loaded": list(AI_BRAIN.keys()) if AI_BRAIN else [],
    }


# ==================== MEGALLM CHAT ====================

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Chat với MegaLLM về SOC events
    """
    result = chat_with_megallm(
        prompt=req.prompt,
        events=req.events,
        zeek_flows=req.zeek_flows,
        model=req.model,
    )
    return result


@app.post("/playbook")
async def playbook_endpoint(req: PlaybookRequest):
    """
    Generate AI playbook cho một event
    """
    result = generate_playbook(
        event=req.event,
        zeek_flows=req.zeek_flows,
        model=req.model,
    )
    return result


@app.post("/analyze-ip-llm")
async def analyze_ip_llm_endpoint(req: IPAnalysisRequest):
    """
    Phân tích IP với MegaLLM
    """
    result = analyze_ip_with_llm(
        ip=req.ip,
        events=req.events,
        zeek_flows=req.zeek_flows,
        model=req.model,
    )
    return result


# ==================== ANALYSIS ====================

@app.post("/analyze/flow")
async def analyze_single_flow(req: AnalyzeFlowRequest, background_tasks: BackgroundTasks):
    """
    Phân tích một flow đơn lẻ (Suricata alert + Zeek correlation)
    """
    try:
        result = analyze_flow(req.suricata_alert, req.zeek_flows)

        # Update verdict in Node.js backend
        if req.event_id:
            background_tasks.add_task(
                update_event_verdict,
                req.event_id,
                result["verdict"],
                result,
            )

        # Auto-block if enabled and recommended
        if result["should_block"] and get_auto_block_status():
            src_ip = req.suricata_alert.get("src_ip")
            signature = req.suricata_alert.get("alert", {}).get("signature", "")
            if src_ip:
                background_tasks.add_task(auto_block_ip, src_ip, signature, result)

        return {
            "success": True,
            "event_id": req.event_id,
            "analysis": result,
        }

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/ip")
async def analyze_ip(req: AnalyzeIPRequest, background_tasks: BackgroundTasks):
    """
    Phân tích tất cả flows từ một IP
    """
    try:
        result = analyze_ip_flows(req.events, req.zeek_flows)

        # Auto-block if high risk and enabled
        if result.get("should_block") and get_auto_block_status():
            # Get the most critical signature from events
            signatures = [e.get("alert", {}).get("signature", "") for e in req.events if e.get("alert")]
            critical_sig = next((s for s in signatures if should_auto_block(s)), signatures[0] if signatures else "Unknown")
            background_tasks.add_task(auto_block_ip, req.ip, critical_sig, result)

        return {
            "success": True,
            "analysis": result,
        }

    except Exception as e:
        logger.error(f"IP analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== BLOCKING ====================

@app.post("/block")
async def block_ip(req: BlockIPRequest):
    """Block một IP trên pfSense"""
    success, message, debug = block_ip_on_pfsense(req.ip)
    return {
        "success": success,
        "message": message,
        "ip": req.ip,
        "debug": debug,
    }


@app.post("/unblock")
async def unblock_ip(req: BlockIPRequest):
    """Unblock một IP trên pfSense"""
    success, message, debug = unblock_ip_on_pfsense(req.ip)
    return {
        "success": success,
        "message": message,
        "ip": req.ip,
        "debug": debug,
    }


@app.get("/blocked-ips")
async def list_blocked_ips():
    """
    Lấy danh sách IP đang bị block từ pfSense alias.
    Dùng để sync với dashboard.
    """
    success, ips, debug = get_blocked_ips()
    return {
        "success": success,
        "ips": ips,
        "count": len(ips),
        "alias": debug.get("alias", ""),
    }


@app.get("/auto-block")
async def get_auto_block():
    """Get auto-block status"""
    return {"enabled": get_auto_block_status()}


@app.post("/auto-block")
async def set_auto_block(config: AutoBlockConfig):
    """Set auto-block status"""
    set_auto_block_status(config.enabled)
    return {"enabled": get_auto_block_status()}


# ==================== TELEGRAM ====================

class TelegramConfigRequest(BaseModel):
    bot_token: str
    chat_id: str
    confidence_threshold: int = 80


@app.post("/telegram/configure")
async def configure_telegram(req: TelegramConfigRequest):
    """Configure Telegram bot"""
    configure_bot(req.bot_token, req.chat_id, req.confidence_threshold)
    return {"success": True, "enabled": telegram_bot.enabled}


@app.post("/telegram/webhook")
async def telegram_webhook(update: dict):
    """Handle Telegram webhook updates"""
    async def get_blocked():
        success, ips, _ = get_blocked_ips()
        return ips if success else []
    
    response = await handle_telegram_update(update, get_blocked)
    if response:
        chat_id = update.get("message", {}).get("chat", {}).get("id")
        if chat_id:
            await telegram_bot.send_message(response, chat_id=str(chat_id))
    return {"ok": True}


@app.post("/telegram/send-alert")
async def send_telegram_alert(event: dict, verdict: str, confidence: float):
    """Manually send alert via Telegram"""
    success = await telegram_bot.send_alert(event, verdict, confidence)
    return {"success": success}


# ==================== BACKGROUND TASKS ====================

async def update_event_verdict(event_id: str, verdict: str, analysis: Dict[str, Any]):
    """Update event verdict in Node.js backend"""
    try:
        response = requests.post(
            f"{NODEJS_BACKEND_URL}/api/events/{event_id}/verdict",
            json={"verdict": verdict, "analysis": analysis},
            timeout=5,
        )
        if response.status_code == 200:
            logger.info(f"Updated event {event_id} verdict to {verdict}")
        else:
            logger.warning(f"Failed to update event {event_id}: {response.status_code}")
    except Exception as e:
        logger.error(f"Error updating event verdict: {e}")


async def auto_block_ip(ip: str, signature: str, analysis: Dict[str, Any]):
    """
    Auto-block IP based on analysis result and signature patterns.
    Uses pattern-based detection instead of hardcoded signature names.
    """
    if ip in WHITELIST_IPS:
        logger.info(f"IP {ip} is whitelisted, skipping auto-block")
        return
    
    # Check if signature matches dangerous patterns
    if not should_auto_block(signature):
        severity = get_attack_severity(signature)
        logger.info(f"IP {ip} signature '{signature}' is not critical (severity: {severity}), skipping auto-block")
        return
    
    severity = get_attack_severity(signature)
    logger.info(f"🚨 Auto-blocking IP {ip} - Signature: '{signature}' (severity: {severity})")

    success, message, _ = block_ip_on_pfsense(ip)
    if success:
        logger.info(f"🔒 Auto-blocked IP {ip}: {message}")
    else:
        logger.warning(f"Failed to auto-block IP {ip}: {message}")


# ==================== STARTUP ====================

@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("🧠 AI-SOC False Positive Reduction Engine v2.2.0")
    logger.info("   With MegaLLM AI Assistant Integration")
    logger.info("=" * 60)

    if AI_BRAIN:
        logger.info(f"✅ ML Models loaded: {list(AI_BRAIN.keys())}")
    else:
        logger.warning("⚠️ No ML models loaded - using rule-based analysis only")

    if MEGALLM_API_KEY:
        logger.info(f"✅ MegaLLM configured: {MEGALLM_DEFAULT_MODEL}")
    else:
        logger.warning("⚠️ MegaLLM not configured - AI chat disabled")

    logger.info(f"Auto-block: {'ENABLED' if get_auto_block_status() else 'DISABLED'}")
    logger.info(f"Whitelist IPs: {len(WHITELIST_IPS)} entries")
    logger.info("=" * 60)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
