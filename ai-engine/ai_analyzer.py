"""
AI Analyzer Module
Phân tích log Suricata + Zeek để xác định verdict cuối cùng
"""
import os
import logging
from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import pandas as pd

from config import (
    ARTIFACTS_DIR,
    CRITICAL_SIGNATURES,
    SUSPICIOUS_SIGNATURES,
    BENIGN_FP_SIGNATURES,
    get_auto_block_status,
)

logger = logging.getLogger("AI_ANALYZER")

# AI Model storage
AI_BRAIN: Dict[str, Any] = {}


def load_models() -> bool:
    """
    Load ML models từ thư mục artifacts.
    Trả về True nếu load thành công ít nhất 1 model.
    """
    global AI_BRAIN

    try:
        import joblib
        import tensorflow as tf

        logger.info("🧠 Loading AI models...")

        if not os.path.exists(ARTIFACTS_DIR):
            logger.warning(f"Artifacts directory not found: {ARTIFACTS_DIR}")
            return False

        # L1: Autoencoder for anomaly detection
        l1_path = os.path.join(ARTIFACTS_DIR, "L1_AnomalyGate.keras")
        if os.path.exists(l1_path):
            AI_BRAIN["l1_model"] = tf.keras.models.load_model(l1_path)
            scaler_path = os.path.join(ARTIFACTS_DIR, "L1_scaler_anomaly.joblib")
            if os.path.exists(scaler_path):
                AI_BRAIN["l1_scaler"] = joblib.load(scaler_path)
            AI_BRAIN["l1_features"] = []
            logger.info("✅ L1 Autoencoder loaded")

        # L2: Classifier for attack type
        l2_model_path = os.path.join(ARTIFACTS_DIR, "L2_BenignVerifier_Final.joblib")
        if os.path.exists(l2_model_path):
            AI_BRAIN["l2_model"] = joblib.load(l2_model_path)

            l2_scaler_path = os.path.join(ARTIFACTS_DIR, "L2_scaler_classifier.joblib")
            if os.path.exists(l2_scaler_path):
                AI_BRAIN["l2_scaler"] = joblib.load(l2_scaler_path)

            l2_thresh_path = os.path.join(ARTIFACTS_DIR, "L2_optimal_threshold.joblib")
            if os.path.exists(l2_thresh_path):
                AI_BRAIN["l2_thresh"] = joblib.load(l2_thresh_path)

            l2_feats_path = os.path.join(ARTIFACTS_DIR, "L2_top_features.joblib")
            if os.path.exists(l2_feats_path):
                AI_BRAIN["l2_feats"] = joblib.load(l2_feats_path)

            if hasattr(AI_BRAIN.get("l2_scaler"), "feature_names_in_"):
                AI_BRAIN["feature_names"] = AI_BRAIN["l2_scaler"].feature_names_in_.tolist()
            else:
                AI_BRAIN["feature_names"] = []

            logger.info("✅ L2 Classifier loaded")

        return bool(AI_BRAIN)

    except Exception as e:
        logger.error(f"❌ Error loading models: {e}")
        return False


def extract_features(log: Dict[str, Any], feature_list: List[str]) -> Optional[List[float]]:
    """
    Trích xuất features từ Zeek log cho ML model.
    """
    if not feature_list:
        return None

    feats = {n: 0.0 for n in feature_list}

    try:
        dur = float(log.get("duration", 0) or 0)
        orig_pkts = float(log.get("orig_pkts", 0) or 0)
        resp_pkts = float(log.get("resp_pkts", 0) or 0)
        orig_bytes = float(log.get("orig_bytes", 0) or 0)
        resp_bytes = float(log.get("resp_bytes", 0) or 0)

        feats["Destination Port"] = float(log.get("id.resp_p") or log.get("dst_port") or 0)
        feats["Flow Duration"] = dur * 1e6
        feats["Total Fwd Packets"] = orig_pkts
        feats["Total Backward Packets"] = resp_pkts
        feats["Total Length of Fwd Packets"] = orig_bytes
        feats["Total Length of Bwd Packets"] = resp_bytes

        if dur > 0:
            feats["Flow Bytes/s"] = (orig_bytes + resp_bytes) / dur
            feats["Flow Packets/s"] = (orig_pkts + resp_pkts) / dur

        history = log.get("history", "") or log.get("conn_state", "") or ""
        if "S" in history or "s" in history:
            feats["SYN Flag Count"] = 1
        if "F" in history or "f" in history:
            feats["FIN Flag Count"] = 1
        if "R" in history or "r" in history:
            feats["RST Flag Count"] = 1
        if "P" in history:
            feats["PSH Flag Count"] = 1
        if "A" in history:
            feats["ACK Flag Count"] = 1

    except Exception as e:
        logger.warning(f"Feature extraction warning: {e}")

    return [feats.get(n, 0.0) for n in feature_list]


def analyze_with_models(
    zeek_flow: Optional[Dict[str, Any]], signature: str
) -> Tuple[str, float, str]:
    """
    Sử dụng ML models để phân tích.
    
    Returns:
        (verdict, confidence, reasoning)
    """
    if not AI_BRAIN:
        return "SUSPICIOUS", 0.5, "No AI models loaded"

    if not zeek_flow:
        return "SUSPICIOUS", 0.5, "No Zeek flow data available"

    try:
        # L1: Anomaly detection
        mse = 0.0
        if "l1_model" in AI_BRAIN and "l1_scaler" in AI_BRAIN:
            l1_features = AI_BRAIN.get("l1_features", [])
            if l1_features:
                vec_l1 = np.array([extract_features(zeek_flow, l1_features)])
                vec_l1_scaled = AI_BRAIN["l1_scaler"].transform(vec_l1)
                recon = AI_BRAIN["l1_model"].predict(vec_l1_scaled, verbose=0)
                mse = float(np.mean(np.power(vec_l1_scaled - recon, 2), axis=1)[0])

        # L2: Classification
        if "l2_model" in AI_BRAIN and "l2_feats" in AI_BRAIN:
            fnames = AI_BRAIN.get("feature_names", [])
            vec_l2 = extract_features(zeek_flow, fnames) or [0.0] * len(fnames)
            feat_dict = dict(zip(fnames, vec_l2))
            feat_dict["reconstruction_error"] = mse

            final_input = pd.DataFrame([feat_dict])[AI_BRAIN["l2_feats"]]
            prob = float(AI_BRAIN["l2_model"].predict_proba(final_input)[:, 1][0])
            thresh = float(AI_BRAIN.get("l2_thresh", 0.5))

            if prob > thresh:
                return "ALERT", prob, f"AI Confirmed Attack (Score: {prob:.2f}, MSE: {mse:.4f})"
            elif prob > (thresh * 0.4):
                return "SUSPICIOUS", prob, f"AI Uncertain (Score: {prob:.2f})"
            else:
                return "FALSE_POSITIVE", prob, f"AI Classified Benign (Score: {prob:.2f})"

    except Exception as e:
        logger.error(f"Model analysis error: {e}")

    return "SUSPICIOUS", 0.5, "Model analysis failed"


def analyze_flow(
    suricata_alert: Dict[str, Any],
    zeek_flows: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Phân tích một flow (Suricata alert + Zeek correlation).
    
    Quy trình:
    1. Check signature patterns
    2. Correlate với Zeek logs
    3. Chạy ML models nếu có
    4. Đưa ra verdict cuối cùng
    
    Returns:
        {
            "verdict": "ALERT" | "SUSPICIOUS" | "FALSE_POSITIVE" | "BENIGN",
            "confidence": 0.0-1.0,
            "reasoning": str,
            "zeek_matched": bool,
            "ml_used": bool,
            "should_block": bool,
            "details": {...}
        }
    """
    signature = suricata_alert.get("attack_type") or suricata_alert.get("signature") or ""
    signature = signature if isinstance(signature, str) else str(signature)
    sig_lower = signature.lower()

    result = {
        "verdict": "SUSPICIOUS",
        "confidence": 0.5,
        "reasoning": "",
        "zeek_matched": bool(zeek_flows),
        "ml_used": False,
        "should_block": False,
        "details": {
            "signature": signature,
            "zeek_flows_count": len(zeek_flows) if zeek_flows else 0,
        },
    }

    # Step 1: Check signature patterns
    for crit_sig in CRITICAL_SIGNATURES:
        if crit_sig.lower() in sig_lower:
            result["verdict"] = "ALERT"
            result["confidence"] = 1.0
            result["reasoning"] = f"Critical signature matched: {crit_sig}"
            result["should_block"] = True
            return result

    for benign_sig in BENIGN_FP_SIGNATURES:
        if benign_sig.lower() in sig_lower:
            result["verdict"] = "FALSE_POSITIVE"
            result["confidence"] = 0.1
            result["reasoning"] = f"Known benign pattern: {benign_sig}"
            return result

    for susp_sig in SUSPICIOUS_SIGNATURES:
        if susp_sig.lower() in sig_lower:
            result["verdict"] = "SUSPICIOUS"
            result["confidence"] = 0.6
            result["reasoning"] = f"Suspicious signature: {susp_sig}"
            break

    # Step 2: Zeek correlation analysis
    if zeek_flows and len(zeek_flows) > 0:
        zeek_flow = zeek_flows[0]  # Primary correlated flow
        conn_state = zeek_flow.get("conn_state", "")

        # Analyze connection state
        if conn_state in ["REJ", "RSTO", "RSTOS0"]:
            result["confidence"] = max(result["confidence"], 0.8)
            result["reasoning"] += f" | Zeek: Connection rejected ({conn_state})"
            if result["verdict"] != "ALERT":
                result["verdict"] = "ALERT"
        elif conn_state == "SF":
            # Successful connection - might be false positive
            duration = float(zeek_flow.get("duration", 0) or 0)
            if duration > 0.5:
                result["confidence"] = min(result["confidence"], 0.4)
                result["reasoning"] += f" | Zeek: Normal connection (duration={duration:.2f}s)"

        # Step 3: ML model analysis
        if AI_BRAIN:
            ml_verdict, ml_conf, ml_reason = analyze_with_models(zeek_flow, signature)
            result["ml_used"] = True
            result["details"]["ml_analysis"] = {
                "verdict": ml_verdict,
                "confidence": ml_conf,
                "reasoning": ml_reason,
            }

            # Combine ML result with rule-based
            if ml_verdict == "FALSE_POSITIVE" and result["verdict"] != "ALERT":
                result["verdict"] = "FALSE_POSITIVE"
                result["confidence"] = ml_conf
                result["reasoning"] = ml_reason
            elif ml_verdict == "ALERT":
                result["verdict"] = "ALERT"
                result["confidence"] = max(result["confidence"], ml_conf)
                result["reasoning"] = ml_reason
                result["should_block"] = ml_conf >= 0.8
    else:
        result["reasoning"] += " | No Zeek correlation found"

    # Final decision for auto-block
    if result["verdict"] == "ALERT" and result["confidence"] >= 0.8:
        result["should_block"] = True

    return result


def analyze_ip_flows(
    events: List[Dict[str, Any]],
    zeek_flows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Phân tích tất cả flows từ một IP.
    
    Returns:
        {
            "ip": str,
            "total_events": int,
            "verdicts": {verdict: count},
            "risk_score": 0-100,
            "recommendation": str,
            "should_block": bool,
            "analysis_details": [...]
        }
    """
    if not events:
        return {
            "error": "No events to analyze",
            "risk_score": 0,
            "should_block": False,
        }

    ip = events[0].get("src_ip", "unknown")
    verdicts = {"ALERT": 0, "SUSPICIOUS": 0, "FALSE_POSITIVE": 0, "BENIGN": 0}
    details = []

    # Create zeek lookup by community_id
    zeek_lookup: Dict[str, List[Dict]] = {}
    for zf in zeek_flows:
        cid = zf.get("community_id")
        if cid:
            if cid not in zeek_lookup:
                zeek_lookup[cid] = []
            zeek_lookup[cid].append(zf)

    for event in events[:50]:  # Limit to 50 events for performance
        cid = event.get("community_id")
        related_zeek = zeek_lookup.get(cid, [])

        analysis = analyze_flow(event, related_zeek if related_zeek else None)
        verdicts[analysis["verdict"]] = verdicts.get(analysis["verdict"], 0) + 1
        details.append({
            "event_id": event.get("id"),
            "signature": event.get("attack_type"),
            "verdict": analysis["verdict"],
            "confidence": analysis["confidence"],
            "reasoning": analysis["reasoning"],
        })

    # Calculate risk score
    total = sum(verdicts.values())
    if total == 0:
        risk_score = 0
    else:
        risk_score = (
            (verdicts["ALERT"] * 100 + verdicts["SUSPICIOUS"] * 50) / total
        )

    # Recommendation
    if risk_score >= 80:
        recommendation = "HIGH RISK - Recommend immediate block"
        should_block = True
    elif risk_score >= 50:
        recommendation = "MEDIUM RISK - Manual review recommended"
        should_block = False
    elif risk_score >= 20:
        recommendation = "LOW RISK - Monitor activity"
        should_block = False
    else:
        recommendation = "MINIMAL RISK - Likely benign"
        should_block = False

    return {
        "ip": ip,
        "total_events": len(events),
        "verdicts": verdicts,
        "risk_score": round(risk_score, 1),
        "recommendation": recommendation,
        "should_block": should_block,
        "analysis_details": details[:10],  # Return first 10 details
    }


# Try to load models on import
try:
    load_models()
except Exception as e:
    logger.warning(f"Could not load models on startup: {e}")
