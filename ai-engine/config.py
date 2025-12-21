"""
AI-SOC Configuration
Cấu hình cho hệ thống AI phân tích và tự động block
"""
import os
import json
from typing import Set

# ====== CẤU HÌNH pfSense REST API V2 ======
PFSENSE_HOST = os.getenv("PFSENSE_HOST", "10.10.10.254")
PFSENSE_PORT = int(os.getenv("PFSENSE_PORT", "8080"))
PFSENSE_API_KEY = os.getenv("PFSENSE_API_KEY", "")
PFSENSE_ALIAS = os.getenv("PFSENSE_ALIAS", "AI_Blocked_IP")

# File lưu trạng thái auto-block
SETTINGS_FILE = os.getenv("SETTINGS_FILE", "/app/database/settings.json")
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "/app/artifacts")

# Node.js backend URL
NODEJS_BACKEND_URL = os.getenv("NODEJS_BACKEND_URL", "http://soc-backend:3001")

# ====== DANH SÁCH TRẮNG – KHÔNG BAO GIỜ ĐƯỢC BLOCK ======
WHITELIST_IPS: Set[str] = {
    "10.10.10.20",    # AI server
    "10.10.10.254",   # pfSense / gateway
    "172.16.16.20",   # NIDS / Web server (DMZ)
    "172.16.16.254",  # DMZ gateway
    "10.10.10.99",    # Remote
    "127.0.0.1",      # Localhost
}

# Load thêm whitelist từ environment nếu có
extra_whitelist = os.getenv("WHITELIST_IPS", "")
if extra_whitelist:
    WHITELIST_IPS.update(ip.strip() for ip in extra_whitelist.split(",") if ip.strip())

# ================= DANH SÁCH CHỮ KÝ THEO KỊCH BẢN =================
CRITICAL_SIGNATURES = [
    "ALERT - DDoS HTTP Flood DEMO",
    "ALERT - DoS Hulk HTTP Flood DEMO",
    "ALERT - PortScan SYN Scan DEMO",
    "ALERT - Web Attack Path Traversal DEMO",
    "ALERT - Web Attack Debug RCE DEMO",
    "ET SCAN",
    "ET ATTACK",
    "ET EXPLOIT",
    "GPL ATTACK",
    "ET TROJAN",
    "ET MALWARE",
]

SUSPICIOUS_SIGNATURES = [
    "SUSPICIOUS - DoS slowhttptest style DEMO",
    "SUSPICIOUS - Bot Beacon DEMO",
    "SUSPICIOUS - Backup/Config File Access DEMO",
    "ET POLICY",
    "ET INFO",
]

BENIGN_FP_SIGNATURES = [
    "FP DEMO - Benign Admin Login Access",
    "FP DEMO - Benign Healthcheck Status Page",
]


def get_auto_block_status() -> bool:
    """Đọc trạng thái Auto Block từ file settings.json"""
    if not os.path.exists(SETTINGS_FILE):
        return False
    try:
        with open(SETTINGS_FILE, "r") as f:
            data = json.load(f)
            return bool(data.get("auto_block", False))
    except Exception:
        return False


def set_auto_block_status(status: bool) -> None:
    """Ghi trạng thái Auto Block xuống file settings.json"""
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump({"auto_block": bool(status)}, f)
    except Exception:
        pass
