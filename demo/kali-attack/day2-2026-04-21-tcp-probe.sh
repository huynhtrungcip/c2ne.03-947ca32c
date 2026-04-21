#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 2 (2026-04-21)
# Phase   : Light TCP probing from .23 — first SUSPICIOUS verdict
# Source  : 192.168.168.23
# Target  : 172.16.16.30 (DMZ web server)
#
# Dataset also contains 3 unrelated FTP-Patator events from
# 192.168.168.27 on the same day (opportunistic scanner) — the second
# block reconstructs that for auditors.
#
# WARNING — DEMO REFERENCE ONLY (not executed live).
# =====================================================================
set -e
WEB="172.16.16.30"

echo "[Day-2 22:47] Light TCP banner-grab from .23 (the actor)"
# nc-style TCP connects on common admin ports — no flags, no payload
for port in 22 80 443 8080 3389; do
  timeout 3 bash -c "</dev/tcp/${WEB}/${port}" 2>/dev/null && \
    echo "  port $port: open" || echo "  port $port: closed/filtered"
  sleep 12
done

# ---- Unrelated opportunist (192.168.168.27) — for class-coverage in dataset ----
# (Not run during the demo. Kept here so the audit trail is consistent.)
# echo "[Day-2 03:12] FTP-Patator from .27 (opportunistic, unrelated to .23)"
# cat > /tmp/u.txt <<EOF
# admin
# ftp
# anonymous
# EOF
# cat > /tmp/p.txt <<EOF
# admin
# 123456
# password
# EOF
# timeout 25 hydra -L /tmp/u.txt -P /tmp/p.txt -t 3 -f ftp://${WEB} >/dev/null 2>&1 || true

echo "[Day-2] complete — expected: 5× SUSPICIOUS (.23) + 3× FTP-Patator ALERT (.27)"
