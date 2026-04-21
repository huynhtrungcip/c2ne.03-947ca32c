# AI-SOC Demo Kit — 25/04/2026

Three deliverables for the live demo to the review board.

## 1. Suricata custom rules — `suricata-rules/local.rules`

11 tuned rules (SID 9000001-9000061) covering exactly the classes the ML model was trained on (CICIDS-2017): PortScan, DDoS, DoS (Hulk/GoldenEye/Slowloris/Slowhttptest), FTP-Patator, SSH-Patator, Web Attack (SQLi/XSS/LFI), Bot/C2.

**Install on NIDS server (172.16.16.20):**
```bash
sudo cp suricata-rules/local.rules /etc/suricata/rules/local.rules
# In suricata.yaml ensure:  rule-files: [ local.rules ]
sudo suricata -T -c /etc/suricata/suricata.yaml   # validate
sudo systemctl restart suricata
```

ET Open is intentionally disabled — we want **clean, explainable** alerts that map 1:1 to the ML classes for the panel discussion.

## 2. Kali attack orchestrator — `kali-attack/run-demo-attack.sh`

7-phase hybrid scenario (≈12 min total): real Kali source IP (192.168.168.23) for recon/brute/web/slowloris/bot phases, plus `hping3 --rand-source` waves for the DDoS phase to populate the **Top Sources** chart with 50–200 spoofed IPs.

Each phase aligns with one ML class so you can narrate: *"Watch the dashboard — DoS Hulk just lit up, AI engine cross-checked Zeek flow, confidence 0.94, recommends auto-block."*

**Install dependencies on Kali:**
```bash
sudo apt install -y hping3 nmap hydra nikto slowhttptest curl uuid-runtime
pip3 install slowloris       # optional
```

**Run:**
```bash
chmod +x kali-attack/run-demo-attack.sh
sudo TARGET=192.168.168.254 ./kali-attack/run-demo-attack.sh
```

## 3. Historical seed — `seed-history/seed-historical-data.js`

Populates SQLite with 5 days of believable history (20→24/04/2026):
- ~95% BENIGN baseline traffic (every 2–7 min)
- 4 scripted incidents at sensible hours so the **Trends / Heatmap / Top Sources** views all show meaningful patterns when the panel asks "what does last week look like?"

**Run:**
```bash
# Stop backend first to avoid write conflicts
docker compose stop soc-backend

cd demo/seed-history
node seed-historical-data.js          # inserts ~3000-3500 events
# or: DRY_RUN=1 node seed-historical-data.js   (preview counts only)

docker compose start soc-backend
```

Source labelling: every seeded row has `source_engine='Suricata+Zeek+ML'` and `ai_analyzed=1`, identical to live traffic — review board sees one continuous timeline. The live attack on 25/04 will append on top with the same shape.

## Suggested demo run-of-show

| Time   | Action |
|--------|--------|
| T-0    | Open dashboard — show 5-day history, narrate baseline + 4 incidents |
| T+1m   | Switch to **Live Events** tab |
| T+2m   | SSH into Kali, launch `run-demo-attack.sh` |
| T+3m   | Phase 1 (PortScan) — point out Suricata rule SID 9000001, AI cross-correlates with Zeek, verdict SUSPICIOUS |
| T+5m   | Phase 2 (SSH brute) — first ALERT, confidence > 0.9, AI recommends block, click **Confirm** to push to pfSense alias |
| T+7m   | Phase 3 (Web attacks) — show SQLi event in Inspector, AI explains payload |
| T+9m   | Phase 5 (DDoS spoofed) — Top Sources panel explodes with 80+ IPs, narrate: *"AI doesn't blindly block all of them — it detects the pattern as DDoS class, recommends rate-limit not blacklist"* |
| T+11m  | Phase 7 (C2 beacon) — low-and-slow detection, ML-only ALERT (no Suricata signature) |
| T+13m  | Wrap-up: open Telegram bot, show alert summary delivered to analyst phone |
