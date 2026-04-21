#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 5 (2026-04-24)
# Phase   : Cool-down — attacker goes quiet (APT staging behaviour)
# Source  : 192.168.168.23
# Target  : 192.168.168.254 (gateway, ssh)
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# Only 2 lazy SSH connection attempts. AI on day 25 will reference this
# silence as classic pre-attack staging.
# =====================================================================
set -e
GATEWAY="192.168.168.254"
echo "[Day-5 16:31] Two lone SSH connection attempts (quiet day)"

for i in 1 2; do
  timeout 3 bash -c "</dev/tcp/${GATEWAY}/22" 2>/dev/null || true
  sleep 240
done

echo "[Day-5] complete — expected: 2× SUSPICIOUS (low volume, looks like a typo)"
