"""
MegaLLM Client - SOC AI Assistant
Tích hợp MegaLLM API cho phân tích SOC
"""
import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from openai import OpenAI

logger = logging.getLogger("MEGALLM")

# ===== Configuration =====
MEGALLM_API_KEY = os.getenv("MEGALLM_API_KEY", "")
MEGALLM_BASE_URL = os.getenv("MEGALLM_BASE_URL", "https://ai.megallm.io/v1")
MEGALLM_DEFAULT_MODEL = os.getenv("MEGALLM_DEFAULT_MODEL", "deepseek-r1-distill-llama-70b")

MEGALLM_MODELS = [
    "openai-gpt-oss-20b",
    "openai-gpt-oss-120b", 
    "deepseek-r1-distill-llama-70b",
    "llama3.3-70b-instruct",
]

# ===== SOC Keywords for classification =====
SOC_KEYWORDS = [
    "soc", "alert", "log", "event", "incident", "traffic", "flow",
    "ip ", "ip:", "src_ip", "dst_ip", "port", "scan", "portscan",
    "quet port", "quét port", "tan cong", "tấn công", "attack",
    "suricata", "zeek", "nids", "siem", "packet", "signature",
    "dos", "ddos", "icmp", "ssh", "http", "rule id", "sid:",
    "community_id", "threat", "malicious", "suspicious",
    "nguon ip", "nguồn ip", "top ip", "luu luong", "lưu lượng",
    "ping", "bruteforce", "brute force",
]

GREETING_KEYWORDS = [
    "xin chao", "xin chào", "chao", "chào", "hello", "hi", "hey",
    "yo", "good morning", "good evening",
]


def get_megallm_client() -> Tuple[Optional[OpenAI], Optional[str]]:
    """Get MegaLLM client instance"""
    if not MEGALLM_API_KEY:
        return None, "MegaLLM API key chưa được cấu hình (MEGALLM_API_KEY)."
    
    try:
        client = OpenAI(base_url=MEGALLM_BASE_URL, api_key=MEGALLM_API_KEY)
        return client, None
    except Exception as e:
        return None, f"Lỗi khởi tạo MegaLLM client: {e}"


def classify_prompt(prompt: str) -> str:
    """
    Phân loại prompt để xác định cách xử lý:
    - "soc": Câu hỏi về SOC/security
    - "greeting": Lời chào
    - "other": Câu hỏi ngoài phạm vi
    """
    p = prompt.lower().strip()
    
    if any(k in p for k in SOC_KEYWORDS):
        return "soc"
    
    if any(g in p for g in GREETING_KEYWORDS) and len(p.split()) <= 4:
        return "greeting"
    
    return "other"


def build_log_context(events: List[Dict[str, Any]], zeek_flows: List[Dict[str, Any]] = None) -> str:
    """Build JSON context từ events và zeek flows"""
    if not events:
        return "No SOC events loaded."
    
    # Lọc lấy alerts
    alerts = [e for e in events if e.get("verdict") == "ALERT"][:30]
    
    context = {
        "total_events": len(events),
        "alert_count": len(alerts),
        "alert_sample": alerts,
    }
    
    if zeek_flows:
        context["zeek_flows_count"] = len(zeek_flows)
        context["zeek_sample"] = zeek_flows[:10]
    
    return json.dumps(context, default=str, ensure_ascii=False)


# ===== SYSTEM PROMPTS =====

SOC_CHAT_SYSTEM_PROMPT = """You are an AI SOC analyst (Tier 2) working on a hybrid NIDS stack with Zeek, Suricata and AI correlation.

You receive:
1) A natural language question from the analyst.
2) A compact JSON snapshot of recent SOC alerts and Zeek flows.

You must:
- Correlate patterns across events.
- Identify likely attack scenarios (DDoS, PortScan, Brute Force, Web Attack, etc.).
- Propose CLEAR next actions: BLOCK / INVESTIGATE / IGNORE with reasoning.
- NEVER hallucinate log entries that are not present in the provided JSON.
- Answer in concise Vietnamese, but keep technical terms in English when necessary.
- Focus on actionable insights for the SOC analyst.

Response format:
1. **Tóm tắt tình hình** (2-3 câu)
2. **Phân tích chi tiết** (patterns, correlations)
3. **Đề xuất hành động** (cụ thể, có thể thực hiện được)
"""

SOC_PLAYBOOK_SYSTEM_PROMPT = """You are an AI SOC Tier-2 analyst. Generate a concise but complete incident handling playbook for ONE single network flow / alert.

Return:
- **Classification**: Short classification (MITRE ATT&CK technique if relevant).
- **Why flagged**: Based on the event fields only, why was this flagged.
- **Triage steps**: Concrete investigation steps.
- **Containment**: Immediate actions to contain the threat.
- **Remediation**: Steps to remediate and prevent recurrence.
- **Monitoring**: What to monitor afterwards.

Answer in Vietnamese with bullet points, but keep technical terms in English.
Do NOT invent any fields or data that are not in the provided JSON.
"""

GREETING_RESPONSE = """Xin chào, tôi là **SOC AI Assistant** của hệ thống AI-SOC Dashboard, được phát triển bởi nhóm **C1NE.03 – K28 An ninh mạng, Đại học Duy Tân**.

- Tôi chỉ tập trung vào **phân tích sự kiện an ninh**, logs, alerts và traffic trong SOC.
- Anh/chị có thể hỏi bằng **tiếng Việt (có/không dấu) hoặc tiếng Anh**.
- Phong cách trả lời theo chuẩn **SOC Tier-2**, ngắn gọn, rõ ràng, tập trung vào hành động.

Ví dụ câu hỏi:
- `IP nao tan cong he thong nhieu nhat trong 1h qua?`
- `Are these ICMP alerts likely to be a scan or health check?`
- `De xuat hanh dong xu ly cho cac PortScan trong 1h gan day`
"""

OUT_OF_SCOPE_RESPONSE = """Hiện tại **SOC AI Assistant** chỉ hỗ trợ các câu hỏi liên quan tới **hệ thống SOC**, bao gồm:
- Logs, alerts, traffic, IP nguồn/đích
- Rule Suricata/Zeek và phân tích mối đe dọa
- Correlation và pattern detection
- Đề xuất hành động xử lý sự cố

Các câu hỏi ngoài phạm vi SOC (ví dụ: đời sống, học tập, chủ đề chung) sẽ **không được xử lý** tại đây.

Vui lòng đặt câu hỏi tập trung vào công việc giám sát an ninh mạng."""


def chat_with_megallm(
    prompt: str,
    events: List[Dict[str, Any]] = None,
    zeek_flows: List[Dict[str, Any]] = None,
    model: str = None,
) -> Dict[str, Any]:
    """
    Chat với MegaLLM về SOC events
    
    Returns:
        {
            "success": bool,
            "response": str,
            "prompt_type": str,
            "model": str
        }
    """
    model = model or MEGALLM_DEFAULT_MODEL
    prompt_type = classify_prompt(prompt)
    
    # Handle greeting
    if prompt_type == "greeting":
        return {
            "success": True,
            "response": GREETING_RESPONSE,
            "prompt_type": "greeting",
            "model": model,
        }
    
    # Handle out of scope
    if prompt_type == "other":
        return {
            "success": True,
            "response": OUT_OF_SCOPE_RESPONSE,
            "prompt_type": "other",
            "model": model,
        }
    
    # SOC question - call MegaLLM
    client, err = get_megallm_client()
    if err:
        return {
            "success": False,
            "response": f"[MegaLLM Error] {err}",
            "prompt_type": prompt_type,
            "model": model,
        }
    
    log_context = build_log_context(events or [], zeek_flows)
    
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SOC_CHAT_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Analyst question:\n{prompt}\n\n=== SOC ALERT SNAPSHOT (JSON) ===\n{log_context}"
                },
            ],
        )
        content = resp.choices[0].message.content
        return {
            "success": True,
            "response": content.strip() if content else "[MegaLLM] Empty response.",
            "prompt_type": prompt_type,
            "model": model,
        }
    except Exception as e:
        logger.error(f"MegaLLM chat error: {e}")
        return {
            "success": False,
            "response": f"[MegaLLM Error] {e}",
            "prompt_type": prompt_type,
            "model": model,
        }


def generate_playbook(
    event: Dict[str, Any],
    zeek_flows: List[Dict[str, Any]] = None,
    model: str = None,
) -> Dict[str, Any]:
    """
    Generate AI playbook cho một event cụ thể
    
    Returns:
        {
            "success": bool,
            "playbook": str,
            "model": str
        }
    """
    model = model or MEGALLM_DEFAULT_MODEL
    
    client, err = get_megallm_client()
    if err:
        return {
            "success": False,
            "playbook": f"[MegaLLM Error] {err}",
            "model": model,
        }
    
    # Build event context
    event_data = {
        "event": event,
    }
    if zeek_flows:
        event_data["zeek_flows"] = zeek_flows[:5]
    
    event_json = json.dumps(event_data, default=str, indent=2, ensure_ascii=False)
    
    user_prompt = f"""Generate a SOC playbook ONLY for this single event.
Do not invent fields. Base everything strictly on JSON below.

=== EVENT JSON ===
{event_json}"""
    
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SOC_PLAYBOOK_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = resp.choices[0].message.content
        return {
            "success": True,
            "playbook": content.strip() if content else "[MegaLLM] Empty response.",
            "model": model,
        }
    except Exception as e:
        logger.error(f"MegaLLM playbook error: {e}")
        return {
            "success": False,
            "playbook": f"[MegaLLM Error] {e}",
            "model": model,
        }


def analyze_ip_with_llm(
    ip: str,
    events: List[Dict[str, Any]],
    zeek_flows: List[Dict[str, Any]] = None,
    model: str = None,
) -> Dict[str, Any]:
    """
    Phân tích tất cả hoạt động từ một IP với LLM
    """
    model = model or MEGALLM_DEFAULT_MODEL
    
    client, err = get_megallm_client()
    if err:
        return {
            "success": False,
            "analysis": f"[MegaLLM Error] {err}",
            "model": model,
        }
    
    context = {
        "target_ip": ip,
        "total_events": len(events),
        "events_sample": events[:20],
    }
    if zeek_flows:
        context["zeek_flows_count"] = len(zeek_flows)
        context["zeek_sample"] = zeek_flows[:10]
    
    context_json = json.dumps(context, default=str, ensure_ascii=False)
    
    system_prompt = """You are an AI SOC Tier-2 analyst. Analyze ALL activity from a specific IP address.

Provide:
1. **Risk Assessment**: LOW / MEDIUM / HIGH / CRITICAL with reasoning
2. **Attack Pattern**: What type of attack/behavior is this IP exhibiting
3. **Timeline**: Key events in chronological order
4. **Recommendation**: BLOCK / MONITOR / IGNORE with detailed reasoning
5. **MITRE ATT&CK**: Relevant techniques if applicable

Answer in Vietnamese, keep technical terms in English."""

    user_prompt = f"""Analyze all activity from IP: {ip}

=== ACTIVITY DATA (JSON) ===
{context_json}"""
    
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = resp.choices[0].message.content
        return {
            "success": True,
            "analysis": content.strip() if content else "[MegaLLM] Empty response.",
            "model": model,
        }
    except Exception as e:
        logger.error(f"MegaLLM IP analysis error: {e}")
        return {
            "success": False,
            "analysis": f"[MegaLLM Error] {e}",
            "model": model,
        }
