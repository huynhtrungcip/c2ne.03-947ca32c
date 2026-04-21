#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 3 (2026-04-22)
# Phase   : Targeted PortScan — first Suricata ALERT
# Source  : 192.168.168.23
# Target  : 172.16.16.30 (DMZ web server)
#
# Dataset also contains 4 unrelated Web Attack probes (SQLi/XSS/LFI)
# from 192.168.168.29 around 14:05 — second block below reconstructs
# them for auditors.
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# =====================================================================
set -e
WEB="172.16.16.30"

echo "[Day-3 02:18] nmap top-100 SYN scan from .23 against the web server"
nmap -sS -T2 --top-ports 100 -Pn "$WEB" -oN /tmp/day3-nmap.txt >/dev/null

# ---- Unrelated opportunist (192.168.168.29) — Web Attack probes ----
# (Not run during the demo. Kept for audit consistency with dataset.)
# for payload in \
#   "/?id=1' OR '1'='1" \
#   "/search?q=<script>alert(1)</script>" \
#   "/page?file=../../etc/passwd" \
#   "/admin/login.php?user=admin'--"
# do
#   curl -s -o /dev/null --max-time 3 "http://${WEB}${payload}" || true
#   sleep 25
# done

echo "[Day-3] complete — expected: PortScan ALERT (~80 events, conf 0.88+) + 4× Web Attack ALERT"
