#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 3 (2026-04-22)
# Phase   : Targeted PortScan — first Suricata ALERT
# Source  : 192.168.168.23
# Target  : 192.168.168.254 (gateway)
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# Events are seeded by the historical dataset.
# =====================================================================
set -e
GATEWAY="192.168.168.254"
echo "[Day-3 02:18] nmap top-100 SYN scan against gateway"

# Real scan (audit-only): SYN scan, top 100 ports, slow timing
nmap -sS -T2 --top-ports 100 -Pn "$GATEWAY" -oN /tmp/day3-nmap.txt >/dev/null

echo "[Day-3] complete — expected: PortScan ALERT (~80 events, conf 0.88+)"
