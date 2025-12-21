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

# ================= PATTERN-BASED AUTO-BLOCK DETECTION =================
# Keywords để phát hiện tấn công nguy hiểm cần auto-block
# Sử dụng pattern thay vì tên cứng để linh hoạt với các signature mới

# Các pattern TẤN CÔNG NGUY HIỂM - cần auto-block ngay
CRITICAL_ATTACK_PATTERNS = [
    # DDoS / DoS attacks - làm sập hệ thống
    "ddos", "dos", "flood", "hulk", "slowloris", "slowhttp",
    # Exploitation attacks - chiếm quyền điều khiển
    "exploit", "rce", "remote code", "command injection", "cmd injection",
    "shell", "backdoor", "reverse shell", "bind shell",
    # Web attacks - tấn công trực tiếp ứng dụng
    "sql injection", "sqli", "xss", "cross-site", "path traversal",
    "directory traversal", "lfi", "rfi", "file inclusion",
    # Malware / Trojan
    "trojan", "malware", "ransomware", "cryptominer", "botnet", "c2", "c&c",
    # Brute force - tấn công mạnh
    "brute force", "bruteforce", "credential stuffing",
    # Scan attacks - có thể dẫn tới tấn công lớn hơn
    "port scan", "portscan", "syn scan", "nmap", "masscan",
    # ET Rules critical
    "et attack", "et exploit", "et trojan", "et malware", "gpl attack",
]

# Các pattern KHÔNG NGUY HIỂM - KHÔNG auto-block
NON_DANGEROUS_PATTERNS = [
    # ICMP thông thường
    "icmp", "ping", "traceroute", "tracert",
    # Policy / Info alerts (cảnh báo thông tin)
    "et policy", "et info", "et games", "et chat",
    # Benign traffic
    "benign", "false positive", "fp demo", "healthcheck",
    "normal traffic", "legitimate",
    # DNS queries thông thường
    "dns query", "dns lookup",
]

# Legacy lists - giữ lại để tương thích ngược
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


def should_auto_block(signature: str) -> bool:
    """
    Kiểm tra signature có nên được auto-block không
    Sử dụng pattern matching thay vì tên cứng
    
    Returns:
        True nếu cần auto-block, False nếu không
    """
    sig_lower = signature.lower()
    
    # Kiểm tra nếu thuộc danh sách không nguy hiểm -> KHÔNG block
    for pattern in NON_DANGEROUS_PATTERNS:
        if pattern in sig_lower:
            return False
    
    # Kiểm tra nếu thuộc danh sách nguy hiểm -> CẦN block
    for pattern in CRITICAL_ATTACK_PATTERNS:
        if pattern in sig_lower:
            return True
    
    # Mặc định: không auto-block các cảnh báo chưa rõ
    return False


def get_attack_severity(signature: str) -> str:
    """
    Xác định mức độ nghiêm trọng của tấn công
    
    Returns:
        "critical" | "high" | "medium" | "low" | "info"
    """
    sig_lower = signature.lower()
    
    # Critical - cần hành động ngay
    critical_keywords = ["ddos", "dos", "exploit", "rce", "trojan", "malware", "backdoor", "ransomware"]
    for kw in critical_keywords:
        if kw in sig_lower:
            return "critical"
    
    # High - nguy hiểm cao
    high_keywords = ["sql injection", "sqli", "xss", "brute force", "port scan", "command injection"]
    for kw in high_keywords:
        if kw in sig_lower:
            return "high"
    
    # Medium - cần theo dõi
    medium_keywords = ["scan", "suspicious", "policy violation"]
    for kw in medium_keywords:
        if kw in sig_lower:
            return "medium"
    
    # Low / Info
    if any(p in sig_lower for p in NON_DANGEROUS_PATTERNS):
        return "info"
    
    return "low"


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
