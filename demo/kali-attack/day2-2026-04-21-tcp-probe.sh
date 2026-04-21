#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 2 (2026-04-21)
# Phase   : Light TCP probing — first SUSPICIOUS verdict
# Source  : 192.168.168.23
# Target  : 192.168.168.254 (gateway)
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# Events are seeded by the historical dataset.
# =====================================================================
set -e
GATEWAY="192.168.168.254"
echo "[Day-2 22:47] Light TCP probing — late-night curiosity"

# nc-style banner grabs on common admin ports — no flags, no payload
for port in 22 80 443 8080 3389; do
  timeout 3 bash -c "</dev/tcp/${GATEWAY}/${port}" 2>/dev/null && \
    echo "  port $port: open" || echo "  port $port: closed/filtered"
  sleep 12
done

echo "[Day-2] complete — expected: SUSPICIOUS verdict from Zeek (REJ states)"
