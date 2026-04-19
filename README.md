# SOC Dashboard - False Positive Reduction System

> **C1NE.03 Team** — Cybersecurity K28 — Đại học Duy Tân

Hệ thống SOC dashboard tích hợp **AI (MegaLLM)** để giảm false-positive cho các alert từ NIDS (Suricata/Zeek), kết nối **pfSense** để auto-block IP độc hại, và cảnh báo qua **Telegram Bot**.

**Repo:** https://github.com/huynhtrungcip/c2ne.03-947ca32c

---

## ✨ Tính Năng Chính

- 🛡️ **Hybrid Correlation Pipeline** — Suricata (alerts) + Zeek (context) ghép thành event giàu thông tin
- 🤖 **AI Assistant (MegaLLM)** — phân tích log, tool calling (`block_ip`, `query_events`, `analyze_ip`), streaming token-by-token
- 🔥 **Auto-Block pfSense** — đồng bộ alias `AI_Blocked_IP` 2 chiều (block/unblock từ UI hoặc AI đều sync ngược lại firewall)
- 📊 **Real-time Dashboard** — System Resources, Events Rate, Verdict Distribution, Top Blocked IPs, Reports CSV/PDF
- 📡 **Telegram Bot** — alert critical events qua bot, hỗ trợ command `/status`, `/block`, `/unblock`
- 💾 **Hybrid Data Source** — chạy được với data thật từ NIDS shipper hoặc mock data offline

---

## 🏗️ Kiến Trúc

```
┌──────────────┐  WebSocket  ┌──────────────┐   REST   ┌──────────────┐
│  Frontend    │◄───────────►│  Backend     │◄────────►│  AI Engine   │
│ React/Nginx  │             │  Node + WS   │          │  Python/FastAPI│
│   :8080      │             │ :3001 / :3002│          │   :8000      │
└──────────────┘             └──────┬───────┘          └──────┬───────┘
                                    │                         │
                                    ▼                         ▼
                              ┌──────────┐              ┌──────────┐
                              │ SQLite   │              │ MegaLLM  │
                              └──────────┘              │ pfSense  │
                                                        │ Telegram │
                                                        └──────────┘
        ▲                          ▲
        │ Suricata eve.json        │ Zeek conn.log
   ┌────┴─────┐               ┌────┴────┐
   │ NIDS #1  │               │ NIDS #2 │
   └──────────┘               └─────────┘
```

| Service     | Port  | Mô tả                                |
|-------------|-------|--------------------------------------|
| Frontend    | 8080  | React + Vite, served bởi Nginx       |
| Backend     | 3001  | Node.js REST API + SQLite            |
| WebSocket   | 3002  | Realtime event streaming             |
| AI Engine   | 8000  | FastAPI + MegaLLM + pfSense client   |

---

## 🚀 Cài Đặt Nhanh

### Cách 1: Cài full từ đầu (Ubuntu 24.04)

```bash
git clone https://github.com/huynhtrungcip/c2ne.03-947ca32c.git
cd c2ne.03-947ca32c
chmod +x install.sh
./install.sh
```

Script tự động cài Docker + clone vào `/opt/soc-dashboard/` + tạo `.env` với IP server + build & start.

### Cách 2: Deploy local (đã có source code)

```bash
chmod +x start-local.sh
./start-local.sh            # tự tạo .env + build + start
./start-local.sh status     # kiểm tra services
./start-local.sh logs       # xem logs realtime
./start-local.sh stop       # dừng
```

### Cách 3: Docker Compose thủ công

```bash
cp .env.example .env
nano .env                   # sửa IP server + API keys
docker compose up -d --build
```

Sau khi chạy, truy cập **http://YOUR_IP:8080**.

---

## ⚙️ Cấu Hình `.env`

```env
# Frontend bake vào build
VITE_API_URL=http://YOUR_SERVER_IP:3001
VITE_WS_URL=ws://YOUR_SERVER_IP:3002
VITE_AI_URL=http://YOUR_SERVER_IP:8000

# MegaLLM (lấy key tại https://megallm.io)
MEGALLM_API_KEY=sk-...
MEGALLM_DEFAULT_MODEL=deepseek-r1-distill-llama-70b

# pfSense Auto-block
PFSENSE_HOST=10.10.10.254
PFSENSE_API_KEY=...
PFSENSE_ALIAS=AI_Blocked_IP

# IP không bao giờ bị block
WHITELIST_IPS=10.10.10.20,10.10.10.254
```

> ⚠️ **Sau khi sửa `VITE_*` URL phải rebuild frontend:** `docker compose up -d --build soc-frontend`

---

## 📡 Tích Hợp NIDS

Cài shipper trên máy chạy Suricata/Zeek để gửi log về dashboard. Xem chi tiết trong [DEPLOY.md](./DEPLOY.md#-cấu-hình-nids).

```bash
# Suricata
curl -X POST http://SOC_IP:3001/api/ingest/suricata \
  -H "Content-Type: application/json" \
  -d @eve.json
```

---

## 🛠️ Quản Lý

```bash
docker compose ps                       # status
docker compose logs -f soc-backend      # logs
docker compose restart                  # restart
docker compose down                     # stop
docker compose up -d --build            # rebuild
./install.sh --status                   # health check tổng
./install.sh --uninstall                # gỡ cài đặt (giữ Docker)
```

---

## 📚 Tài Liệu

- [DEPLOY.md](./DEPLOY.md) — hướng dẫn deploy chi tiết Ubuntu 24.04, NIDS shipper, firewall, troubleshooting
- [ai-engine/README.md](./ai-engine/README.md) — chi tiết AI Engine (MegaLLM, pfSense client, Telegram bot)
- [server/README.md](./server/README.md) — chi tiết Backend Node.js

---

## 🧪 Tech Stack

**Frontend:** React 18, Vite 5, TypeScript, Tailwind CSS, shadcn/ui, Recharts
**Backend:** Node.js 18, Express, WebSocket (ws), better-sqlite3
**AI Engine:** Python 3.11, FastAPI, scikit-learn, MegaLLM SDK
**Infra:** Docker Compose, Nginx, Ubuntu 24.04 LTS

---

## 👥 Team

**C1NE.03** — An ninh mạng K28 — Đại học Duy Tân

📧 Liên hệ qua GitHub Issues: https://github.com/huynhtrungcip/c2ne.03-947ca32c/issues
