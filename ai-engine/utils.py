"""
Utility functions for AI-SOC Engine
Bao gồm: Community ID calculation, feature extraction, data validation
"""
import hashlib
import base64
import struct
import socket
from typing import Dict, Any, Optional, Tuple, List


# ================= COMMUNITY ID CALCULATION =================

def calculate_community_id(
    src_ip: str,
    dst_ip: str,
    src_port: int,
    dst_port: int,
    protocol: str,
    seed: int = 0
) -> str:
    """
    Tính toán Community ID v1 từ 5-tuple.
    
    Community ID là một hash chuẩn để correlate các flow giữa các engine khác nhau
    (Suricata, Zeek, Elastic, etc.)
    
    Format: 1:<base64_sha1_hash>=
    
    Args:
        src_ip: Source IP address
        dst_ip: Destination IP address
        src_port: Source port (0 for ICMP)
        dst_port: Destination port (0 for ICMP)
        protocol: Protocol name or number (TCP, UDP, ICMP, 6, 17, 1)
        seed: Optional seed for hashing (default 0)
    
    Returns:
        Community ID string in format "1:<base64>="
    """
    try:
        # Map protocol to number
        proto_map = {
            'tcp': 6,
            'udp': 17,
            'icmp': 1,
            'icmpv6': 58,
            'sctp': 132,
            'gre': 47,
        }
        
        if isinstance(protocol, str):
            proto_num = proto_map.get(protocol.lower(), 6)  # Default to TCP
        else:
            proto_num = int(protocol)
        
        # Convert IPs to binary
        try:
            src_ip_bin = socket.inet_aton(src_ip)
            dst_ip_bin = socket.inet_aton(dst_ip)
            is_ipv6 = False
        except socket.error:
            # Try IPv6
            try:
                src_ip_bin = socket.inet_pton(socket.AF_INET6, src_ip)
                dst_ip_bin = socket.inet_pton(socket.AF_INET6, dst_ip)
                is_ipv6 = True
            except socket.error:
                return ""
        
        # Ensure ports are integers
        src_port = int(src_port or 0)
        dst_port = int(dst_port or 0)
        
        # Order the tuple (lower IP/port comes first for consistency)
        if src_ip_bin > dst_ip_bin or (src_ip_bin == dst_ip_bin and src_port > dst_port):
            src_ip_bin, dst_ip_bin = dst_ip_bin, src_ip_bin
            src_port, dst_port = dst_port, src_port
        
        # Build the hash input
        # Format: seed (2 bytes) + src_ip + dst_ip + proto (1 byte) + pad (1 byte) + src_port (2 bytes) + dst_port (2 bytes)
        if is_ipv6:
            hash_input = struct.pack(">H", seed) + src_ip_bin + dst_ip_bin + struct.pack(">BBhh", proto_num, 0, src_port, dst_port)
        else:
            hash_input = struct.pack(">H", seed) + src_ip_bin + dst_ip_bin + struct.pack(">BBhh", proto_num, 0, src_port, dst_port)
        
        # SHA-1 hash
        sha1_hash = hashlib.sha1(hash_input).digest()
        
        # Base64 encode
        b64_hash = base64.b64encode(sha1_hash).decode('ascii')
        
        return f"1:{b64_hash}"
    
    except Exception as e:
        # Fallback: simple hash
        return generate_simple_community_id(src_ip, dst_ip, src_port, dst_port, protocol)


def generate_simple_community_id(
    src_ip: str,
    dst_ip: str,
    src_port: int,
    dst_port: int,
    protocol: str
) -> str:
    """
    Simple fallback Community ID generator when full calculation fails.
    """
    try:
        # Create ordered tuple string
        tuple_str = f"{src_ip}:{src_port}:{dst_ip}:{dst_port}:{protocol}"
        
        # SHA-1 hash
        sha1_hash = hashlib.sha1(tuple_str.encode()).digest()
        b64_hash = base64.b64encode(sha1_hash).decode('ascii')
        
        return f"1:{b64_hash}"
    except Exception:
        return ""


def extract_community_id_from_event(event: Dict[str, Any]) -> str:
    """
    Trích xuất hoặc tính toán Community ID từ event.
    
    Nếu event đã có community_id thì dùng luôn.
    Nếu không, tính từ 5-tuple.
    """
    # Check if already has community_id
    existing_cid = event.get("community_id", "")
    if existing_cid and existing_cid.startswith("1:"):
        return existing_cid
    
    # Extract 5-tuple
    src_ip = event.get("src_ip") or event.get("id.orig_h") or ""
    dst_ip = event.get("dst_ip") or event.get("dest_ip") or event.get("id.resp_h") or ""
    src_port = event.get("src_port") or event.get("id.orig_p") or 0
    dst_port = event.get("dst_port") or event.get("dest_port") or event.get("id.resp_p") or 0
    protocol = event.get("protocol") or event.get("proto") or "TCP"
    
    if not src_ip or not dst_ip:
        return ""
    
    return calculate_community_id(src_ip, dst_ip, src_port, dst_port, protocol)


# ================= FEATURE EXTRACTION =================

def extract_zeek_features(zeek_log: Dict[str, Any]) -> Dict[str, float]:
    """
    Trích xuất features từ Zeek log cho ML analysis.
    
    Returns dict với các features cần thiết cho model.
    """
    features = {}
    
    try:
        # Basic connection features
        features["duration"] = float(zeek_log.get("duration", 0) or 0)
        features["orig_bytes"] = float(zeek_log.get("orig_bytes", 0) or 0)
        features["resp_bytes"] = float(zeek_log.get("resp_bytes", 0) or 0)
        features["orig_pkts"] = float(zeek_log.get("orig_pkts", 0) or 0)
        features["resp_pkts"] = float(zeek_log.get("resp_pkts", 0) or 0)
        features["orig_ip_bytes"] = float(zeek_log.get("orig_ip_bytes", 0) or 0)
        features["resp_ip_bytes"] = float(zeek_log.get("resp_ip_bytes", 0) or 0)
        
        # Calculated features
        total_bytes = features["orig_bytes"] + features["resp_bytes"]
        total_pkts = features["orig_pkts"] + features["resp_pkts"]
        duration = features["duration"]
        
        if duration > 0:
            features["bytes_per_sec"] = total_bytes / duration
            features["pkts_per_sec"] = total_pkts / duration
        else:
            features["bytes_per_sec"] = 0
            features["pkts_per_sec"] = 0
        
        if total_pkts > 0:
            features["avg_pkt_size"] = total_bytes / total_pkts
        else:
            features["avg_pkt_size"] = 0
        
        # Connection state flags
        conn_state = zeek_log.get("conn_state", "") or ""
        history = zeek_log.get("history", "") or ""
        
        features["is_syn"] = 1.0 if "S" in history else 0.0
        features["is_fin"] = 1.0 if "F" in history else 0.0
        features["is_rst"] = 1.0 if "R" in history else 0.0
        features["is_ack"] = 1.0 if "A" in history else 0.0
        
        # Connection state indicators
        features["is_established"] = 1.0 if conn_state == "SF" else 0.0
        features["is_rejected"] = 1.0 if conn_state in ["REJ", "RSTO", "RSTOS0"] else 0.0
        features["is_incomplete"] = 1.0 if conn_state in ["S0", "S1", "S2", "S3"] else 0.0
        
        # Port features
        features["dst_port"] = float(zeek_log.get("id.resp_p") or zeek_log.get("dst_port") or 0)
        features["src_port"] = float(zeek_log.get("id.orig_p") or zeek_log.get("src_port") or 0)
        
        # Is well-known port
        features["is_well_known_port"] = 1.0 if features["dst_port"] < 1024 else 0.0
        
    except Exception:
        pass
    
    return features


def correlate_suricata_zeek(
    suricata_alert: Dict[str, Any],
    zeek_flows: List[Dict[str, Any]]
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Correlate Suricata alert với Zeek flows dựa trên Community ID hoặc 5-tuple.
    
    Returns:
        (matched_zeek_flow, match_method)
    """
    if not zeek_flows:
        return None, "no_zeek_data"
    
    # Get community_id from Suricata alert
    suricata_cid = extract_community_id_from_event(suricata_alert)
    
    # Try to match by community_id
    if suricata_cid:
        for zf in zeek_flows:
            zeek_cid = extract_community_id_from_event(zf)
            if zeek_cid == suricata_cid:
                return zf, "community_id"
    
    # Fallback: match by 5-tuple
    src_ip = suricata_alert.get("src_ip") or ""
    dst_ip = suricata_alert.get("dst_ip") or suricata_alert.get("dest_ip") or ""
    src_port = suricata_alert.get("src_port") or 0
    dst_port = suricata_alert.get("dst_port") or suricata_alert.get("dest_port") or 0
    
    for zf in zeek_flows:
        zf_src = zf.get("id.orig_h") or zf.get("src_ip") or ""
        zf_dst = zf.get("id.resp_h") or zf.get("dst_ip") or ""
        zf_src_port = zf.get("id.orig_p") or zf.get("src_port") or 0
        zf_dst_port = zf.get("id.resp_p") or zf.get("dst_port") or 0
        
        # Check both directions
        if (src_ip == zf_src and dst_ip == zf_dst and 
            int(src_port) == int(zf_src_port) and int(dst_port) == int(zf_dst_port)):
            return zf, "5tuple_exact"
        
        if (src_ip == zf_dst and dst_ip == zf_src and
            int(src_port) == int(zf_dst_port) and int(dst_port) == int(zf_src_port)):
            return zf, "5tuple_reverse"
    
    # Match by IP pair only (less precise)
    for zf in zeek_flows:
        zf_src = zf.get("id.orig_h") or zf.get("src_ip") or ""
        zf_dst = zf.get("id.resp_h") or zf.get("dst_ip") or ""
        
        if (src_ip == zf_src and dst_ip == zf_dst) or (src_ip == zf_dst and dst_ip == zf_src):
            return zf, "ip_pair"
    
    return None, "no_match"


# ================= DATA VALIDATION =================

def validate_event_data(event: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validate event data structure.
    
    Returns:
        (is_valid, list_of_errors)
    """
    errors = []
    
    # Required fields
    if not event.get("src_ip"):
        errors.append("Missing src_ip")
    if not event.get("dst_ip") and not event.get("dest_ip"):
        errors.append("Missing dst_ip/dest_ip")
    
    # IP format validation
    src_ip = event.get("src_ip", "")
    if src_ip:
        try:
            socket.inet_aton(src_ip)
        except socket.error:
            try:
                socket.inet_pton(socket.AF_INET6, src_ip)
            except socket.error:
                errors.append(f"Invalid src_ip format: {src_ip}")
    
    dst_ip = event.get("dst_ip") or event.get("dest_ip") or ""
    if dst_ip:
        try:
            socket.inet_aton(dst_ip)
        except socket.error:
            try:
                socket.inet_pton(socket.AF_INET6, dst_ip)
            except socket.error:
                errors.append(f"Invalid dst_ip format: {dst_ip}")
    
    return len(errors) == 0, errors


def normalize_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize event fields to standard format.
    Handles different field naming conventions from Suricata/Zeek.
    """
    normalized = dict(event)
    
    # Normalize IP fields
    if "dest_ip" in event and "dst_ip" not in event:
        normalized["dst_ip"] = event["dest_ip"]
    
    if "id.orig_h" in event and "src_ip" not in event:
        normalized["src_ip"] = event["id.orig_h"]
    
    if "id.resp_h" in event and "dst_ip" not in event:
        normalized["dst_ip"] = event["id.resp_h"]
    
    # Normalize port fields
    if "dest_port" in event and "dst_port" not in event:
        normalized["dst_port"] = event["dest_port"]
    
    if "id.orig_p" in event and "src_port" not in event:
        normalized["src_port"] = event["id.orig_p"]
    
    if "id.resp_p" in event and "dst_port" not in event:
        normalized["dst_port"] = event["id.resp_p"]
    
    # Normalize protocol
    proto = event.get("protocol") or event.get("proto") or "TCP"
    normalized["protocol"] = proto.upper() if isinstance(proto, str) else str(proto)
    
    # Ensure community_id exists
    if not normalized.get("community_id"):
        normalized["community_id"] = extract_community_id_from_event(normalized)
    
    return normalized
