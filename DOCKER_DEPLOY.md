# SOC Dashboard - Hướng dẫn Deploy với Docker

Deploy SOC Dashboard với AI Engine (MegaLLM) trên Ubuntu Server 24.04.

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

## Cài đặt Docker

```bash
# Cài Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Đăng xuất và đăng nhập lại
logout

# Verify
docker --version
docker compose version
```

## Clone và Cấu hình

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Tạo file .env từ example (QUAN TRỌNG!)
cp .env.example .env

# Chỉnh sửa .env nếu cần
nano .env
```

### Cấu hình .env

```bash
# ===== MegaLLM Configuration =====
MEGALLM_API_KEY=sk-mega-7bd02bf1c5720f9bde518db892d4da8ef94671adcca28dd19299b1c2d8d4e753
MEGALLM_BASE_URL=https://ai.megallm.io/v1
MEGALLM_DEFAULT_MODEL=deepseek-r1-distill-llama-70b

# ===== pfSense Configuration =====
PFSENSE_HOST=10.10.10.254
PFSENSE_PORT=8080
PFSENSE_API_KEY=7b917f5bd35ae9aef5b7352
PFSENSE_ALIAS=AI_Blocked_IP

# ===== Whitelist IPs =====
WHITELIST_IPS=10.10.10.20,10.10.10.254,172.16.16.20
```

## Build và Deploy

```bash
# Build và chạy tất cả services
docker compose up -d --build

# Kiểm tra status
docker compose ps

# Xem logs
docker compose logs -f

# Xem logs từng service
docker compose logs -f ai-engine
docker compose logs -f soc-backend
docker compose logs -f soc-frontend
```

## Truy cập Dashboard

```
http://YOUR_SERVER_IP:8080
```

## Kiểm tra AI Engine

```bash
# Health check
curl http://localhost:8000/health

# Status với MegaLLM
curl http://localhost:8000/status

# Test chat với AI
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Xin chào",
    "events": []
  }'
```

## Cấu hình Suricata gửi log

### Trên máy NIDS

Tạo script `/opt/suricata-sender.sh`:

```bash
#!/bin/bash
SOC_SERVER="http://YOUR_SOC_SERVER_IP:3001"

tail -F /var/log/suricata/eve.json | while read line; do
  echo "$line" | curl -s -X POST "$SOC_SERVER/api/ingest/suricata" \
    -H "Content-Type: application/json" \
    -H "X-NIDS-Hostname: $(hostname)" \
    -d @-
done
```

Chạy như systemd service:

```bash
sudo chmod +x /opt/suricata-sender.sh

sudo tee /etc/systemd/system/suricata-sender.service << EOF
[Unit]
Description=Suricata to SOC Dashboard
After=suricata.service

[Service]
ExecStart=/opt/suricata-sender.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now suricata-sender
```

## Cấu hình Zeek gửi log

```bash
#!/bin/bash
SOC_SERVER="http://YOUR_SOC_SERVER_IP:3001"

tail -F /opt/zeek/logs/current/conn.log | while read line; do
  [[ "$line" =~ ^# ]] && continue
  echo "$line" | curl -s -X POST "$SOC_SERVER/api/ingest/zeek" \
    -H "Content-Type: text/plain" \
    -H "X-NIDS-Hostname: $(hostname)" \
    -d @-
done
```

## Test hệ thống

```bash
# Backend health
curl http://localhost:3001/api/health

# AI Engine health
curl http://localhost:8000/health

# Xem NIDS sources
curl http://localhost:3001/api/sources

# Test gửi alert
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

# Test AI playbook
curl -X POST http://localhost:8000/playbook \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "src_ip": "192.168.1.100",
      "dst_ip": "10.0.0.1",
      "attack_type": "ET SCAN SSH Bruteforce",
      "verdict": "ALERT"
    }
  }'
```

## Quy trình xử lý (False Positive Reduction)

```
1. Suricata Alert → Backend → Lưu với status "PENDING"
                                    │
                                    ▼
2. Zeek Flow → Backend → Lưu vào zeek_flows table
                                    │
                                    ▼
3. Correlation Engine (mỗi 5 giây):
   - Tìm PENDING alerts
   - Match với Zeek flows (community_id hoặc 5-tuple)
   - Cập nhật verdict: ALERT / SUSPICIOUS / BENIGN
                                    │
                                    ▼
4. AI Analysis (MegaLLM):
   - User click "Analyze This Flow"
   - AI phân tích context (Suricata + Zeek)
   - Generate playbook và recommendation
                                    │
                                    ▼
5. Auto-Block (nếu bật):
   - Nếu verdict=ALERT + confidence≥0.8
   - Block IP trên pfSense tự động
```

## Firewall

```bash
# Mở ports cần thiết
sudo ufw allow 8080/tcp  # Frontend
sudo ufw allow 3001/tcp  # Backend REST
sudo ufw allow 3002/tcp  # Backend WebSocket
sudo ufw allow 8000/tcp  # AI Engine
```

## Troubleshooting

### Container không khởi động

```bash
docker compose logs ai-engine
docker compose logs soc-backend
docker compose logs soc-frontend
```

### AI không hoạt động

```bash
# Kiểm tra MegaLLM config
docker compose exec ai-engine env | grep MEGALLM

# Test MegaLLM trực tiếp
curl http://localhost:8000/status
```

### Database lỗi

```bash
docker compose down
docker volume rm $(docker volume ls -q | grep soc)
docker compose up -d --build
```

### Không nhận được log

1. Kiểm tra firewall: `sudo ufw status`
2. Kiểm tra script sender: `systemctl status suricata-sender`
3. Test kết nối: `curl http://SOC_SERVER:3001/api/health`

## Restart Services

```bash
# Restart tất cả
docker compose restart

# Restart một service
docker compose restart ai-engine

# Rebuild và restart
docker compose up -d --build ai-engine
```

## Backup Database

```bash
# Backup
docker compose exec soc-backend cat /app/data/soc_events.db > backup.db

# Restore
docker cp backup.db soc-backend:/app/data/soc_events.db
docker compose restart soc-backend
```

---

**Author: Nhóm C1NE.03 - An ninh mạng K28 - Đại học Duy Tân**
