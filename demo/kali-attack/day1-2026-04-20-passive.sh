#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 1 (2026-04-20)
# Phase   : Passive presence
# Source  : 192.168.168.23 (single Kali host, after IP rotation)
# Target  : 192.168.168.0/24
#
# WARNING — DEMO REFERENCE ONLY
# This script is NOT executed during the live demo. The corresponding
# events for 20/04/2026 are pre-loaded from the historical baseline
# (src/data/historicalDataset.ts + demo/seed-history/seed-historical-data.js).
#
# It is included so the review board can audit exactly what real
# behaviour the historical events represent. Each command below is a
# faithful, runnable reconstruction of the actor's actions on day 1.
# =====================================================================
set -e
TARGET_NET="192.168.168.0/24"
GATEWAY="192.168.168.254"
echo "[Day-1 09:14] Passive presence — actor joins the LAN"

# 1. ICMP sweep on a handful of neighbours (looks like normal ARP/ping)
for last in 22 24 28 33 41 45; do
  ping -c 1 -W 1 "192.168.168.$last" >/dev/null 2>&1 || true
  sleep 18
done

# 2. One curious look at the gateway web UI (no auth, no scan)
curl -ks --max-time 5 "https://${GATEWAY}/" -o /dev/null

echo "[Day-1] complete — expected dashboard verdict: BENIGN (low confidence)"
