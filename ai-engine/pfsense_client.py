"""
pfSense REST API Client
Tích hợp với pfSense để tự động block IP
"""
import json
import requests
import urllib3
from datetime import datetime
from typing import Tuple, Dict, Any, List

from config import (
    PFSENSE_HOST,
    PFSENSE_PORT,
    PFSENSE_API_KEY,
    PFSENSE_ALIAS,
    WHITELIST_IPS,
)

# Tắt cảnh báo SSL tự ký
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def block_ip_on_pfsense(ip: str) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Thêm IP vào alias AI_Blocked_IP trên pfSense bằng REST API v2.

    Returns:
        - success (bool)
        - message (str)
        - debug_info (dict)
    """
    debug: Dict[str, Any] = {
        "ip": ip,
        "alias": PFSENSE_ALIAS,
        "host": PFSENSE_HOST,
        "port": PFSENSE_PORT,
    }

    if not ip:
        return False, "Không có IP nguồn để block.", debug

    ip_norm = ip.strip()

    # Check whitelist
    if ip_norm in WHITELIST_IPS:
        debug["whitelist_hit"] = True
        return (
            False,
            f"IP {ip_norm} nằm trong danh sách trắng - không được block.",
            debug,
        )

    if not PFSENSE_API_KEY:
        return False, "pfSense API key chưa được cấu hình.", debug

    base_url = f"http://{PFSENSE_HOST}:{PFSENSE_PORT}/api/v2"
    headers = {
        "X-API-Key": PFSENSE_API_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    try:
        # GET alias hiện tại
        list_url = f"{base_url}/firewall/aliases?name={PFSENSE_ALIAS}"
        debug["list_url"] = list_url

        r = requests.get(list_url, headers=headers, timeout=5, verify=False)
        debug["list_status"] = r.status_code

        if r.status_code != 200:
            return (
                False,
                f"GET aliases thất bại (HTTP {r.status_code}).",
                debug,
            )

        try:
            data = r.json()
        except Exception:
            return False, "pfSense trả về dữ liệu không phải JSON.", debug

        aliases = data.get("data", data)
        alias_obj = None

        if isinstance(aliases, list):
            for item in aliases:
                if item.get("name") == PFSENSE_ALIAS:
                    alias_obj = item
                    break
        elif isinstance(aliases, dict) and aliases.get("name") == PFSENSE_ALIAS:
            alias_obj = aliases

        if not alias_obj:
            return False, f"Alias '{PFSENSE_ALIAS}' không tồn tại trên pfSense.", debug

        alias_id = alias_obj.get("id")
        debug["alias_id"] = alias_id

        # Normalize addresses
        raw_addresses = alias_obj.get("address", [])
        raw_detail = alias_obj.get("detail", [])

        if isinstance(raw_addresses, str):
            current_addresses: List[str] = [
                a.strip() for a in raw_addresses.split(" ") if a.strip()
            ]
        elif isinstance(raw_addresses, list):
            current_addresses = [str(a).strip() for a in raw_addresses if str(a).strip()]
        else:
            current_addresses = []

        if isinstance(raw_detail, str):
            current_detail: List[str] = [raw_detail]
        elif isinstance(raw_detail, list):
            current_detail = [str(d) for d in raw_detail]
        else:
            current_detail = []

        # Check if IP already exists
        if ip_norm in current_addresses:
            return (
                True,
                f"IP {ip_norm} đã có sẵn trong alias {PFSENSE_ALIAS}.",
                debug,
            )

        # Add new IP
        current_addresses.append(ip_norm)
        current_detail.append(
            f"Blocked by AI-SOC at {datetime.now().isoformat(timespec='seconds')}"
        )

        # PATCH to update alias
        payload = {
            "id": alias_id,
            "name": PFSENSE_ALIAS,
            "type": alias_obj.get("type", "host"),
            "address": current_addresses,
            "detail": current_detail,
            "apply": True,
        }

        patch_url = f"{base_url}/firewall/alias"
        debug["patch_url"] = patch_url

        r2 = requests.patch(
            patch_url,
            headers=headers,
            data=json.dumps(payload),
            timeout=8,
            verify=False,
        )
        debug["patch_status"] = r2.status_code

        if r2.status_code not in (200, 201):
            return (
                False,
                f"PATCH alias thất bại (HTTP {r2.status_code}).",
                debug,
            )

        return True, f"Đã thêm IP {ip_norm} vào alias {PFSENSE_ALIAS} trên pfSense.", debug

    except Exception as e:
        debug["exception"] = repr(e)
        return False, f"Lỗi kết nối tới pfSense: {e}", debug


def unblock_ip_on_pfsense(ip: str) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Xóa IP khỏi alias AI_Blocked_IP trên pfSense.
    """
    debug: Dict[str, Any] = {"ip": ip, "alias": PFSENSE_ALIAS}

    if not ip or not PFSENSE_API_KEY:
        return False, "Missing IP or API key", debug

    ip_norm = ip.strip()
    base_url = f"http://{PFSENSE_HOST}:{PFSENSE_PORT}/api/v2"
    headers = {
        "X-API-Key": PFSENSE_API_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    try:
        # GET alias
        r = requests.get(
            f"{base_url}/firewall/aliases?name={PFSENSE_ALIAS}",
            headers=headers,
            timeout=5,
            verify=False,
        )

        if r.status_code != 200:
            return False, f"GET aliases failed ({r.status_code})", debug

        data = r.json()
        aliases = data.get("data", data)
        alias_obj = None

        if isinstance(aliases, list):
            for item in aliases:
                if item.get("name") == PFSENSE_ALIAS:
                    alias_obj = item
                    break

        if not alias_obj:
            return False, f"Alias '{PFSENSE_ALIAS}' not found", debug

        raw_addresses = alias_obj.get("address", [])
        raw_detail = alias_obj.get("detail", [])

        if isinstance(raw_addresses, str):
            current_addresses = [a.strip() for a in raw_addresses.split(" ") if a.strip()]
        else:
            current_addresses = list(raw_addresses)

        if isinstance(raw_detail, str):
            current_detail = [raw_detail]
        else:
            current_detail = list(raw_detail)

        if ip_norm not in current_addresses:
            return True, f"IP {ip_norm} not in alias", debug

        # Remove IP
        idx = current_addresses.index(ip_norm)
        current_addresses.pop(idx)
        if idx < len(current_detail):
            current_detail.pop(idx)

        # PATCH to update
        payload = {
            "id": alias_obj.get("id"),
            "name": PFSENSE_ALIAS,
            "type": alias_obj.get("type", "host"),
            "address": current_addresses,
            "detail": current_detail,
            "apply": True,
        }

        r2 = requests.patch(
            f"{base_url}/firewall/alias",
            headers=headers,
            data=json.dumps(payload),
            timeout=8,
            verify=False,
        )

        if r2.status_code not in (200, 201):
            return False, f"PATCH failed ({r2.status_code})", debug

        return True, f"Đã xóa IP {ip_norm} khỏi alias {PFSENSE_ALIAS}", debug

    except Exception as e:
        debug["exception"] = repr(e)
        return False, f"Error: {e}", debug
