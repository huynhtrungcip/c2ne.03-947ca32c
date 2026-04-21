#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 5 (2026-04-24)
# Phase   : Cool-down — .23 goes quiet (classic APT staging)
# Source  : 192.168.168.23
# Target  : 172.16.16.30 (DMZ web server, ssh)
#
# Only 2 lazy SSH connection attempts. AI on day 25 will reference this
# silence as classic pre-attack staging.
#
# Dataset also contains 4 DoS Hulk events from .26 at 08:14 and 3 Bot
# C2 beacons from .30 at 21:05 — kept commented below for auditors.
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# =====================================================================
set -e
WEB="172.16.16.30"

echo "[Day-5 16:31] Two lone SSH connection attempts from .23 (quiet day)"
for i in 1 2; do
  timeout 3 bash -c "</dev/tcp/${WEB}/22" 2>/dev/null || true
  sleep 240
done

# ---- Unrelated DoS Hulk burst from .26 (08:14) ----
# END=$((SECONDS + 16))
# while [ $SECONDS -lt $END ]; do
#   curl -s -o /dev/null --max-time 1 -H "Cache-Control: no-cache" \
#     "http://${WEB}/?cb=$RANDOM" &
# done
# wait

# ---- Unrelated Bot/C2 beacon from .30 (21:05) ----
# for i in 1 2 3; do
#   curl -s -o /dev/null --max-time 2 -A "python-requests/2.28.0" \
#     -H "X-Beacon-Id: $RANDOM" "http://${WEB}/api/heartbeat" || true
#   sleep 8
# done

echo "[Day-5] complete — expected: 2× SUSPICIOUS (.23) + 4× DoS Hulk ALERT (.26) + 3× Bot SUSPICIOUS (.30)"
