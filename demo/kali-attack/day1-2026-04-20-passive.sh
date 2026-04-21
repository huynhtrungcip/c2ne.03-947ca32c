#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 1 (2026-04-20)
# Phase   : Passive presence — actor (.23) joins the LAN
# Source  : 192.168.168.23 (Kali, after IP rotation via set-static-ip.sh)
# Target  : DMZ web server 172.16.16.30 + a few neighbour hosts
#
# WARNING — DEMO REFERENCE ONLY
# This script is NOT executed during the live demo. The corresponding
# events for 20/04/2026 are pre-loaded from the historical baseline
# (src/data/historicalDataset.ts).
#
# Each command below is a faithful, runnable reconstruction of the
# actor's actions on day 1 (verdict expected: BENIGN, low confidence).
# =====================================================================
set -e
WEB="172.16.16.30"
NEIGHBOURS=(22 24 28 33 41 45)   # last octets in 192.168.168.0/24

echo "[Day-1 09:14] Passive presence — actor joins the LAN"

# 1. ICMP sweep — 6 pings, 18s apart (looks like ARP/neighbour discovery)
for last in "${NEIGHBOURS[@]}"; do
  ping -c 1 -W 1 "192.168.168.${last}" >/dev/null 2>&1 || true
  sleep 18
done

# 2. One curious HTTPS GET on the public web service (no auth, no scan)
curl -ks --max-time 5 "https://${WEB}/" -o /dev/null

echo "[Day-1] complete — expected dashboard verdict: BENIGN (low confidence)"
