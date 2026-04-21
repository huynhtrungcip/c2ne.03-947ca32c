# Demo Runbook — 2026-04-25 (Defence Day)

> A minute-by-minute script for the C1NE.03 demo. Two operators:
> **A** at the dashboard, **B** at the Kali console.

## T-30 min — Pre-flight

- [ ] **A** : `docker compose up -d` on the SOC server. Verify dashboard loads.
- [ ] **A** : open dashboard, set time range to **Last 7d** → confirm 5-day baseline is visible (≥500 events).
- [ ] **A** : (optional) `node demo/seed-history/seed-historical-data.js` if backend DB is empty.
- [ ] **B** : Kali interface = `192.168.168.23/24`, gateway reachable (`ping -c1 192.168.168.254`).
- [ ] **B** : verify tools installed — `which nmap hydra nikto slowhttptest curl`.
- [ ] **A** : open the AI chat panel; ensure the active provider is connected (test with "ping").
- [ ] **A** : open `demo/ATTACK_STORYLINE.md` on a side monitor for reference.

## T-0 — Open the demo

> **A (verbal):** *"What you see on the dashboard is 5 days of NIDS
> data from our lab — Suricata + Zeek + an ML model we trained on
> CICIDS2017. Look at the source IP `192.168.168.23` — we'll come
> back to it."*

- [ ] Click on any event from `.23` on day 3 → Event Inspector opens.
- [ ] Show the verdict, confidence, and Zeek correlation panel.

## T+2 — Hand over to the chatbot

- [ ] Ask: *"give me the activity history of 192.168.168.23"*.
- [ ] AI should call `get_ip_history` and reply with the 4-day timeline.
- [ ] Highlight the day-5 silence: *"Notice how it went quiet right before today."*

## T+4 — Launch the live attack

- [ ] **B**: `sudo /opt/ai-soc/demo/kali-attack/day6-2026-04-25-LIVE-attack.sh`
- [ ] Timing on the dashboard (matches script phases):

| T+    | Phase                                | Watch for                |
|-------|--------------------------------------|--------------------------|
| +4:00 | PortScan                             | "PortScan" ALERT cluster |
| +5:35 | SSH-Patator                          | port 22 spike            |
| +6:40 | FTP-Patator                          | port 21 spike            |
| +7:30 | Web Attack (SQLi/XSS/LFI/nikto)      | HTTP signatures fire     |
| +8:50 | DoS slowloris                        | slow-header alerts       |
| +9:55 | DoS Slowhttptest                     | slow-POST alerts         |
| +11:0 | DoS Hulk                             | cache-buster flood       |
| +11:50| DoS GoldenEye                        | Mozilla UA flood         |
| +12:35| Bot / C2 beacon                      | python-requests UA       |

## T+8 — Mid-attack: ask the AI again

> *"Same IP — analyse the last 15 minutes."*

- [ ] AI calls `analyze_ip(192.168.168.23, since_minutes=15)`.
- [ ] AI should list multiple ML classes and recommend `block_ip`.
- [ ] **Click "Confirm" when the block dialog appears** (live pfSense alias update).

## T+13 — Wrap up

- [ ] Show the **Attack Types** chart now contains 9–10 of the 11 ML classes.
- [ ] Show the **Top Sources** panel — `.23` dominates.
- [ ] Show the action audit log — pfSense block recorded.

> **A (closing):** *"In one screen we covered: a 5-day APT timeline,
> live multi-vector detection, ML classification across 10 classes,
> and an automated response. Questions?"*

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No live events on dashboard | Check Suricata is running: `systemctl status suricata`, and the shipper is sending to the SOC server. |
| Live alerts show raw signatures, not ML class names | `DEMO_ATTACKER_IP` env not set — restart backend with `DEMO_ATTACKER_IP=192.168.168.23 docker compose up -d`. |
| AI doesn't reference the 5-day history | Check `get_ip_history` is registered in `src/lib/socTools.ts` and the dataset loaded (open browser console, look for `historicalEvents`). |
| Dashboard empty on first load | Clear localStorage key `soc-mock-events` and reload — it will re-seed from `historicalDataset.ts`. |
