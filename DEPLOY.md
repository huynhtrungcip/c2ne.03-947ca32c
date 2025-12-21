# SOC Dashboard - Hướng dẫn Deploy trên Ubuntu 24.04 LTS

Deploy SOC Dashboard với AI Engine (MegaLLM) sử dụng Docker.

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SOC Dashboard System                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│   │  Frontend   │    │   Backend   │    │  AI Engine  │            │
│   │  (Nginx)    │◄──►│  (Node.js)  │◄──►│  (Python)   │            │
│   │  :8080      │    │  :3001/3002 │    │  :8000      │            │
│   └─────────────┘    └──────┬──────┘    └──────┬──────┘            │
│                             │                   │                   │
│                             ▼                   ▼                   │
│                      ┌──────────────┐    ┌──────────────┐          │
│                      │   SQLite     │    │   MegaLLM    │          │
│                      │   Database   │    │   API        │          │
│                      └──────────────┘    └──────────────┘          │
│                                                 │                   │
│                                                 ▼                   │
│                                          ┌──────────────┐          │
│                                          │   pfSense    │          │
│                                          │   Firewall   │          │
│                                          └──────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
          ▲                        ▲
          │                        │
     ┌────┴────┐              ┌────┴────┐
     │ Suricata│              │  Zeek   │
     │ Alerts  │              │  Logs   │
     └─────────┘              └─────────┘
```

## Ports sử dụng

| Port | Service | Description |
|------|---------|-------------|
| **8080** | Frontend | Dashboard web interface |
| **3001** | Backend | REST API |
| **3002** | Backend | WebSocket (real-time) |
| **8000** | AI Engine | AI Analysis API + MegaLLM |

## Yêu cầu hệ thống

- Ubuntu Server 24.04 LTS
- Docker 24.0+ & Docker Compose 2.20+
- RAM: 4GB+ (8GB khuyến nghị)
- CPU: 2 cores+
- Disk: 20GB+

---

## Bước 1: Cài đặt Docker

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Docker
curl -fsSL https://get.docker.com | sh

# Thêm user vào group docker
sudo usermod -aG docker $USER

# QUAN TRỌNG: Đăng xuất và đăng nhập lại để áp dụng group
logout
```

Sau khi đăng nhập lại:

```bash
# Verify cài đặt
docker --version
docker compose version
```

---

## Bước 2: Clone Repository

```bash
# Clone repository
git clone https://github.com/huynhtrungcip/insight-dashboard.git

# Vào thư mục project
cd insight-dashboard
```

**⚠️ QUAN TRỌNG:** Tất cả các lệnh sau đều phải chạy trong thư mục `insight-dashboard`!

---

## Bước 3: Cấu hình Environment

```bash
# Tạo file .env từ template
cp .env.example .env

# Chỉnh sửa cấu hình
nano .env
```

### Nội dung file .env

```bash
# ===== Frontend URLs =====
# Thay YOUR_SERVER_IP bằng IP thực của server (ví dụ: 10.10.10.20)
VITE_API_URL=http://YOUR_SERVER_IP:3001
VITE_WS_URL=ws://YOUR_SERVER_IP:3002
VITE_AI_URL=http://YOUR_SERVER_IP:8000

# ===== MegaLLM Configuration =====
MEGALLM_API_KEY=your-megallm-api-key-here
MEGALLM_BASE_URL=https://ai.megallm.io/v1
MEGALLM_DEFAULT_MODEL=deepseek-r1-distill-llama-70b

# ===== pfSense Configuration =====
PFSENSE_HOST=10.10.10.254
PFSENSE_PORT=8080
PFSENSE_API_KEY=your-pfsense-api-key
PFSENSE_ALIAS=AI_Blocked_IP

# ===== Whitelist IPs (không block các IP này) =====
WHITELIST_IPS=10.10.10.20,10.10.10.254,172.16.16.20

# ===== Telegram Bot (tùy chọn) =====
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# ===== Timezone =====
TZ=Asia/Ho_Chi_Minh
```

---

## Bước 4: Build và Deploy

```bash
# Build tất cả images (lần đầu mất ~5-10 phút)
docker compose build --no-cache

# Chạy tất cả services
docker compose up -d

# Kiểm tra status
docker compose ps
```

**Kết quả mong đợi:**

```
NAME           STATUS         PORTS
ai-engine      Up (healthy)   0.0.0.0:8000->8000/tcp
soc-backend    Up (healthy)   0.0.0.0:3001->3001/tcp, 0.0.0.0:3002->3002/tcp
soc-frontend   Up (healthy)   0.0.0.0:8080->80/tcp
```

---

## Bước 5: Mở Firewall

### Sử dụng UFW

```bash
sudo ufw allow 8080/tcp comment 'SOC Dashboard Frontend'
sudo ufw allow 3001/tcp comment 'SOC Backend REST API'
sudo ufw allow 3002/tcp comment 'SOC Backend WebSocket'
sudo ufw allow 8000/tcp comment 'AI Engine'
sudo ufw reload
sudo ufw status
```

### Hoặc sử dụng iptables

```bash
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3002 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8000 -j ACCEPT
```

---

## Bước 6: Kiểm tra hoạt động

### Test các endpoint

```bash
# Backend health
curl http://localhost:3001/api/health

# AI Engine health
curl http://localhost:8000/health

# AI Engine status (kiểm tra MegaLLM)
curl http://localhost:8000/status
```

### Truy cập Dashboard

Mở trình duyệt:
```
http://YOUR_SERVER_IP:8080
```

---

## Bước 7: Cấu hình Suricata gửi log

### Trên máy NIDS (nơi chạy Suricata)

Tạo script sender:

```bash
sudo nano /opt/suricata-sender.sh
```

```bash
#!/bin/bash
# Thay SOC_SERVER_IP bằng IP của máy chạy SOC Dashboard
SOC_SERVER="http://SOC_SERVER_IP:3001"

tail -F /var/log/suricata/eve.json 2>/dev/null | while read line; do
  echo "$line" | curl -s -X POST "$SOC_SERVER/api/ingest/suricata" \
    -H "Content-Type: application/json" \
    -H "X-NIDS-Hostname: $(hostname)" \
    -d @- > /dev/null 2>&1
done
```

```bash
sudo chmod +x /opt/suricata-sender.sh
```

### Tạo systemd service

```bash
sudo nano /etc/systemd/system/suricata-sender.service
```

```ini
[Unit]
Description=Suricata to SOC Dashboard Sender
After=network.target suricata.service

[Service]
Type=simple
ExecStart=/opt/suricata-sender.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable suricata-sender
sudo systemctl start suricata-sender
sudo systemctl status suricata-sender
```

---

## Bước 8: Cấu hình Zeek gửi log

### Trên máy NIDS (nơi chạy Zeek)

```bash
sudo nano /opt/zeek-sender.sh
```

```bash
#!/bin/bash
# Thay SOC_SERVER_IP bằng IP của máy chạy SOC Dashboard
SOC_SERVER="http://SOC_SERVER_IP:3001"

tail -F /opt/zeek/logs/current/conn.log 2>/dev/null | while read line; do
  [[ "$line" =~ ^# ]] && continue
  echo "$line" | curl -s -X POST "$SOC_SERVER/api/ingest/zeek" \
    -H "Content-Type: text/plain" \
    -H "X-NIDS-Hostname: $(hostname)" \
    -d @- > /dev/null 2>&1
done
```

```bash
sudo chmod +x /opt/zeek-sender.sh
```

Tạo service tương tự Suricata (đổi tên file service và ExecStart).

---

## Các lệnh quản lý Docker

### Xem logs

```bash
# Xem tất cả logs
docker compose logs -f

# Xem logs từng service
docker compose logs -f ai-engine
docker compose logs -f soc-backend
docker compose logs -f soc-frontend
```

### Restart services

```bash
# Restart tất cả
docker compose restart

# Restart một service
docker compose restart ai-engine

# Rebuild và restart
docker compose up -d --build ai-engine
```

### Dừng và xóa

```bash
# Dừng tất cả
docker compose down

# Dừng và xóa volumes (XÓA DATABASE!)
docker compose down -v
```

---

## Test gửi log thủ công

```bash
# Test gửi Suricata alert
curl -X POST http://localhost:3001/api/ingest/suricata \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -Iseconds)'",
    "event_type": "alert",
    "src_ip": "192.168.1.100",
    "dest_ip": "10.0.0.1",
    "dest_port": 22,
    "proto": "TCP",
    "community_id": "1:test123",
    "alert": {
      "signature": "ET SCAN SSH Bruteforce",
      "severity": 1
    }
  }'

# Test AI chat
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Xin chào",
    "events": []
  }'
```

---

## Troubleshooting

### 1. Container không khởi động

```bash
# Xem logs chi tiết
docker compose logs ai-engine
docker compose logs soc-backend

# Kiểm tra config
docker compose config
```

### 2. Không kết nối được WebSocket

- Kiểm tra port 3002 đã mở: `sudo ufw status`
- Kiểm tra firewall router/VM

### 3. AI không hoạt động

```bash
# Kiểm tra MegaLLM config
docker compose exec ai-engine env | grep MEGALLM

# Test MegaLLM
curl http://localhost:8000/status
```

### 4. Không nhận được log từ NIDS

1. Kiểm tra network connectivity: `curl http://SOC_SERVER:3001/api/health`
2. Kiểm tra sender service: `systemctl status suricata-sender`
3. Xem logs sender: `journalctl -u suricata-sender -f`

### 5. Database lỗi

```bash
# Reset database (XÓA TẤT CẢ DATA!)
docker compose down -v
docker compose up -d --build
```

---

## Backup & Restore

### Backup Database

```bash
# Backup SQLite database
docker compose exec soc-backend cat /app/data/soc_events.db > backup_$(date +%Y%m%d).db

# Backup toàn bộ volumes
docker run --rm -v insight-dashboard_backend-data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz /data
```

### Restore Database

```bash
# Restore SQLite
docker cp backup.db soc-backend:/app/data/soc_events.db
docker compose restart soc-backend
```

---

## Cập nhật phiên bản mới

```bash
cd insight-dashboard

# Pull code mới
git pull origin main

# Rebuild và restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Quick Reference

| Mục đích | Lệnh |
|----------|------|
| Xem status | `docker compose ps` |
| Xem logs | `docker compose logs -f` |
| Restart all | `docker compose restart` |
| Stop all | `docker compose down` |
| Rebuild | `docker compose up -d --build` |
| Dashboard URL | `http://YOUR_IP:8080` |
| Backend API | `http://YOUR_IP:3001/api` |
| AI Engine | `http://YOUR_IP:8000` |

---

**Author: Nhóm C1NE.03 - An ninh mạng K28 - Đại học Duy Tân**
