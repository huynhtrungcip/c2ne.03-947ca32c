# Attack Storyline — 5-day APT against C1NE.03 Lab

> Use this document to brief the review board **before** the live demo
> so they understand the historical context the dashboard already shows.

## Cast

| IP / asset | Role |
|------------|------|
| **192.168.168.23** | The attacker (Kali box). Performs slow recon for 5 days, then strikes on day 6. |
| 192.168.168.20-50 | Lab hosts producing benign noise. |
| 192.168.168.254 | pfSense gateway (the principal target). |
| 192.168.168.30 | Web server behind NAT. |
| 192.168.168.10 | DNS resolver. |
| Spoofed external pool (~60 IPs) | Unrelated DDoS event on day 4 — included for ML class coverage. |

## The 5-day plot

### Day 1 — 2026-04-20 09:14  (Passive presence)
- 6 ICMP echoes to random hosts in `.20–.50`.
- A single HTTPS GET to the gateway web UI.
- **Verdict:** BENIGN, very low confidence.
- **What it looks like:** a fresh device joining the LAN.

### Day 2 — 2026-04-21 22:47  (Light TCP probing)
- `.23`: Bash `</dev/tcp>` connects to ports 22, 80, 443, 8080, 3389 of the **DMZ web server (172.16.16.30)**.
- Zeek logs `REJ` connection states.
- **Verdict:** SUSPICIOUS (5 events).
- *Side incident:* `.27` runs FTP-Patator against the web server (3 ALERT events) — opportunistic, unrelated to `.23`.

### Day 3 — 2026-04-22 02:18  (Targeted PortScan)
- `.23`: nmap `-sS -T2 --top-ports 100 -Pn` against **172.16.16.30**.
- ~80 SYN events; first Suricata ALERT triggered.
- **Verdict:** PortScan ALERT (confidence 0.88+).
- *Side incident:* `.29` fires 4 Web Attack probes (SQLi/XSS/LFI) at 14:05.

### Day 4 — 2026-04-23 19:42  (External DDoS, unrelated)
- ~160 SYN packets from ~60 spoofed external IPs hitting **172.16.16.30:80**.
- **Verdict:** DDoS ALERT (confidence 0.9+); auto-block fires on the last source.
- **What it looks like:** a separate threat actor — used to give
  the "Attack Types" panel a DDoS data point. Does not involve `.23`.
- *Side incidents:* `.25` SSH-Patator (3 ALERT, 11:20), `.28` DoS slowloris (3 ALERT, 05:48).

### Day 5 — 2026-04-24 16:31  (Cool-down — APT staging)
- `.23` makes only **2 SSH probes** (4 minutes apart).
- **Verdict:** SUSPICIOUS (2 events).
- **What it looks like:** the attacker has gone quiet — *exactly* the
  kind of low-and-slow staging behaviour that precedes a real
  campaign. The AI chatbot can highlight this on day 6.
- *Side incidents:* `.26` DoS Hulk burst (4 ALERT, 08:14), `.30` Bot/C2 beacon (3 SUSPICIOUS, 21:05).

### Day 6 — 2026-04-25 09:00+  (★ Live attack ★)
The same actor IP (`.23`) launches a structured 9-phase campaign:

1. PortScan (90 s)
2. SSH-Patator (60 s)
3. FTP-Patator (45 s)
4. Web Attack — SQLi + XSS + LFI + nikto (75 s)
5. DoS slowloris (60 s)
6. DoS Slowhttptest (60 s)
7. DoS Hulk (45 s)
8. DoS GoldenEye (45 s)
9. Bot / C2 beacon (60 s)

Suricata signatures fire on the NIDS box. The backend
`reshapeForDemo()` function normalises every alert into one of the **10
ML classes** the model was trained on (DDoS excluded by design — see
day 4). The dashboard ends up showing 10/11 classes with high
confidence, all originating from a single IP whose 5-day shadow
history is already in the database.

## What the AI should say (suggested narrative)

When the analyst asks the chatbot "analyse 192.168.168.23" during
phase 4 of the live attack, it should:

1. Call `get_ip_history(ip)` → sees activity on 4 of the past 5 days.
2. Call `analyze_ip(ip, since_minutes=15)` → sees the live spike.
3. Conclude: *"This IP has been staging a campaign for 5 days — passive
   presence on day 1, increasing probing on days 2–3, an eerie quiet
   on day 5, and now a coordinated multi-vector attack. Recommend
   immediate block via pfSense (`block_ip`)."*

This is the moment the demo lands.
