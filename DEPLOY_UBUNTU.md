# 🚀 Hướng Dẫn Deploy SOC Dashboard trên Ubuntu 24.04 LTS

> **Author:** C1NE.03 Team - Chuyên ngành An ninh mạng K28 - Đại học Duy Tân  
> **Version:** 2.0.0 - False Positive Reduction System

---

## 📋 Mục Lục

1. [Yêu Cầu Hệ Thống](#-yêu-cầu-hệ-thống)
2. [Cài Đặt Docker](#-cài-đặt-docker)
3. [Clone Repository](#-clone-repository)
4. [Cấu Hình Environment](#-cấu-hình-environment)
5. [Build và Deploy](#-build-và-deploy)
6. [Cấu Hình Firewall](#-cấu-hình-firewall)
7. [Cấu Hình Suricata](#-cấu-hình-suricata)
8. [Cấu Hình Zeek](#-cấu-hình-zeek)
9. [Kiểm Tra Hệ Thống](#-kiểm-tra-hệ-thống)
10. [Xử Lý Sự Cố](#-xử-lý-sự-cố)
11. [Backup & Restore](#-backup--restore)
12. [Các Lệnh Hữu Ích](#-các-lệnh-hữu-ích)

---

## 🖥 Yêu Cầu Hệ Thống

### Phần Cứng Tối Thiểu
| Thành Phần | Yêu Cầu Tối Thiểu | Khuyến Nghị |
|------------|-------------------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 50 GB SSD | 100+ GB SSD |
| Network | 1 Gbps | 10 Gbps |

### Phần Mềm
- Ubuntu Server 24.04 LTS (fresh install khuyến nghị)
- Docker Engine 24.0+
- Docker Compose v2.20+
- Git

### Ports Sử Dụng
| Port | Service | Mô Tả |
|------|---------|-------|
| 8080 | Frontend | SOC Dashboard Web UI |
| 3001 | Backend | REST API |
| 3002 | Backend | WebSocket (real-time) |
| 8000 | AI Engine | AI Analysis API |

---

## 🐳 Cài Đặt Docker

### Bước 1: Cập nhật hệ thống

```bash
# Cập nhật package list
sudo apt update && sudo apt upgrade -y

# Cài đặt các gói cần thiết
sudo apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    htop \
    vim
```

### Bước 2: Thêm Docker Repository

```bash
# Thêm Docker GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Thêm Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### Bước 3: Cài đặt Docker Engine

```bash
# Cập nhật và cài đặt Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Thêm user hiện tại vào docker group
sudo usermod -aG docker $USER

# Áp dụng group mới (hoặc logout/login)
newgrp docker
```

### Bước 4: Kiểm tra Docker

```bash
# Kiểm tra version
docker --version
docker compose version

# Test Docker
docker run hello-world
```

**Output mong đợi:**
```
Docker version 24.x.x, build xxx
Docker Compose version v2.x.x
Hello from Docker!
```

---

## 📦 Clone Repository

### Bước 1: Clone source code

```bash
# Tạo thư mục cho project
sudo mkdir -p /opt/soc-dashboard
sudo chown $USER:$USER /opt/soc-dashboard
cd /opt/soc-dashboard

# Clone repository (thay YOUR_REPO bằng URL repo của bạn)
git clone https://github.com/YOUR_USERNAME/soc-dashboard.git .

# Hoặc nếu có sẵn source, copy vào thư mục này
```

### Bước 2: Kiểm tra cấu trúc thư mục

```bash
ls -la
```

**Output mong đợi:**
```
├── ai-engine/
│   ├── Dockerfile
│   ├── main.py
│   ├── requirements.txt
│   └── ...
├── server/
│   ├── Dockerfile
│   ├── index.js
│   └── package.json
├── src/
├── docker-compose.yml
├── Dockerfile.frontend
├── nginx.conf
├── .env.example
└── DEPLOY_UBUNTU.md
```

---

## ⚙️ Cấu Hình Environment

### Bước 1: Tạo file .env

```bash
cd /opt/soc-dashboard

# Copy file mẫu
cp .env.example .env

# Chỉnh sửa cấu hình
nano .env
```

### Bước 2: Cập nhật các biến quan trọng

```bash
# Lấy IP của server
hostname -I | awk '{print $1}'
```

Sau đó sửa file `.env`:

```env
# Thay YOUR_SERVER_IP bằng IP thực của server
VITE_API_URL=http://10.10.10.20:3001
VITE_WS_URL=ws://10.10.10.20:3002
VITE_AI_URL=http://10.10.10.20:8000

# MegaLLM API Key (lấy tại https://megallm.io)
MEGALLM_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# pfSense config (nếu có)
PFSENSE_HOST=10.10.10.254
PFSENSE_PORT=8080
PFSENSE_API_KEY=your-pfsense-api-key

# Whitelist IPs (các IP không bị block)
WHITELIST_IPS=10.10.10.20,10.10.10.254,172.16.16.20
```

### Bước 3: Kiểm tra file .env

```bash
# Kiểm tra không có lỗi syntax
cat .env | grep -v '^#' | grep -v '^$'
```

---

## 🚀 Build và Deploy

### Bước 1: Build tất cả containers

```bash
cd /opt/soc-dashboard

# Build images (lần đầu mất ~5-10 phút)
docker compose build --no-cache
```

### Bước 2: Khởi động services

```bash
# Khởi động tất cả services ở background
docker compose up -d
```

### Bước 3: Kiểm tra trạng thái

```bash
# Xem trạng thái containers
docker compose ps
```

**Output mong đợi:**
```
NAME              IMAGE                    STATUS                   PORTS
soc-ai-engine     soc-dashboard-ai-engine  Up (healthy)             0.0.0.0:8000->8000/tcp
soc-backend       soc-dashboard-backend    Up (healthy)             0.0.0.0:3001-3002->3001-3002/tcp
soc-frontend      soc-dashboard-frontend   Up (healthy)             0.0.0.0:8080->80/tcp
```

### Bước 4: Xem logs

```bash
# Xem logs tất cả services
docker compose logs -f

# Xem logs từng service
docker compose logs -f ai-engine
docker compose logs -f soc-backend
docker compose logs -f soc-frontend
```

---

## 🔥 Cấu Hình Firewall

### UFW (Uncomplicated Firewall)

```bash
# Cài đặt UFW (nếu chưa có)
sudo apt install -y ufw

# Cho phép SSH (quan trọng - làm trước!)
sudo ufw allow ssh

# Cho phép các ports của SOC Dashboard
sudo ufw allow 8080/tcp comment 'SOC Dashboard Frontend'
sudo ufw allow 3001/tcp comment 'SOC Backend API'
sudo ufw allow 3002/tcp comment 'SOC WebSocket'
sudo ufw allow 8000/tcp comment 'AI Engine API'

# Kích hoạt firewall
sudo ufw enable

# Kiểm tra rules
sudo ufw status verbose
```

### Iptables (Nếu không dùng UFW)

```bash
# Cho phép các ports
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3002 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8000 -j ACCEPT

# Lưu rules
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

---

## 🛡 Cấu Hình Suricata

### Trên máy chạy Suricata (NIDS)

### Bước 1: Cài đặt Suricata (nếu chưa có)

```bash
# Thêm PPA
sudo add-apt-repository ppa:oisf/suricata-stable -y
sudo apt update

# Cài đặt
sudo apt install -y suricata
```

### Bước 2: Cấu hình EVE JSON output

```bash
sudo nano /etc/suricata/suricata.yaml
```

Tìm và sửa phần `outputs`:

```yaml
outputs:
  - eve-log:
      enabled: yes
      filetype: regular
      filename: eve.json
      community-id: true
      types:
        - alert:
            tagged-packets: yes
            metadata: yes
        - flow
        - dns
        - http
        - tls
```

### Bước 3: Tạo script gửi log

```bash
sudo nano /opt/suricata-sender.sh
```

```bash
#!/bin/bash
# Suricata Log Sender to SOC Dashboard
# Thay 10.10.10.20 bằng IP của SOC Dashboard server

SERVER_URL="http://10.10.10.20:3001/api/ingest/suricata"
EVE_LOG="/var/log/suricata/eve.json"
LOG_FILE="/var/log/suricata-sender.log"

echo "[$(date)] Starting Suricata log sender..." >> $LOG_FILE

tail -F "$EVE_LOG" 2>/dev/null | while read line; do
    # Chỉ gửi alerts
    if echo "$line" | grep -q '"event_type":"alert"'; then
        response=$(curl -s -w "%{http_code}" -o /dev/null \
            -X POST "$SERVER_URL" \
            -H "Content-Type: application/json" \
            -H "X-NIDS-Hostname: $(hostname)" \
            -d "$line" \
            --connect-timeout 5 \
            --max-time 10)
        
        if [ "$response" != "200" ]; then
            echo "[$(date)] Failed to send log, HTTP: $response" >> $LOG_FILE
        fi
    fi
done
```

```bash
sudo chmod +x /opt/suricata-sender.sh
```

### Bước 4: Tạo systemd service

```bash
sudo nano /etc/systemd/system/suricata-sender.service
```

```ini
[Unit]
Description=Suricata Log Sender to SOC Dashboard
After=network.target suricata.service
Wants=suricata.service

[Service]
Type=simple
ExecStart=/opt/suricata-sender.sh
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
```

### Bước 5: Kích hoạt service

```bash
sudo systemctl daemon-reload
sudo systemctl enable suricata-sender
sudo systemctl start suricata-sender

# Kiểm tra status
sudo systemctl status suricata-sender
```

---

## 🔍 Cấu Hình Zeek

### Trên máy chạy Zeek (NSM)

### Bước 1: Cài đặt Zeek (nếu chưa có)

```bash
# Ubuntu 24.04
echo 'deb http://download.opensuse.org/repositories/security:/zeek/xUbuntu_24.04/ /' | sudo tee /etc/apt/sources.list.d/security:zeek.list
curl -fsSL https://download.opensuse.org/repositories/security:zeek/xUbuntu_24.04/Release.key | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/security_zeek.gpg > /dev/null

sudo apt update
sudo apt install -y zeek
```

### Bước 2: Cấu hình Zeek JSON output

```bash
sudo nano /opt/zeek/share/zeek/site/local.zeek
```

Thêm vào cuối file:

```zeek
# Enable JSON logging
@load policy/tuning/json-logs

# Enable Community ID
@load policy/protocols/conn/community-id-logging
```

### Bước 3: Tạo script gửi log

```bash
sudo nano /opt/zeek-sender.sh
```

```bash
#!/bin/bash
# Zeek Log Sender to SOC Dashboard
# Thay 10.10.10.20 bằng IP của SOC Dashboard server

SERVER_URL="http://10.10.10.20:3001/api/ingest/zeek"
ZEEK_LOG="/opt/zeek/logs/current/conn.log"
LOG_FILE="/var/log/zeek-sender.log"

echo "[$(date)] Starting Zeek log sender..." >> $LOG_FILE

tail -F "$ZEEK_LOG" 2>/dev/null | while read line; do
    # Bỏ qua comment lines
    [[ "$line" =~ ^# ]] && continue
    
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -X POST "$SERVER_URL" \
        -H "Content-Type: application/json" \
        -H "X-NIDS-Hostname: $(hostname)" \
        -d "$line" \
        --connect-timeout 5 \
        --max-time 10)
    
    if [ "$response" != "200" ]; then
        echo "[$(date)] Failed to send log, HTTP: $response" >> $LOG_FILE
    fi
done
```

```bash
sudo chmod +x /opt/zeek-sender.sh
```

### Bước 4: Tạo systemd service

```bash
sudo nano /etc/systemd/system/zeek-sender.service
```

```ini
[Unit]
Description=Zeek Log Sender to SOC Dashboard
After=network.target zeek.service
Wants=zeek.service

[Service]
Type=simple
ExecStart=/opt/zeek-sender.sh
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
```

### Bước 5: Kích hoạt service

```bash
sudo systemctl daemon-reload
sudo systemctl enable zeek-sender
sudo systemctl start zeek-sender

# Kiểm tra status
sudo systemctl status zeek-sender
```

---

## ✅ Kiểm Tra Hệ Thống

### Test Backend API

```bash
# Health check
curl http://localhost:3001/api/health

# Expected output:
# {"status":"ok","timestamp":"...","connections":0,"version":"2.0.0","mode":"False Positive Reduction System"}
```

### Test AI Engine

```bash
# Health check
curl http://localhost:8000/health

# Status check
curl http://localhost:8000/status
```

### Test Frontend

```bash
# Truy cập từ browser
# http://YOUR_SERVER_IP:8080
```

### Test Log Ingestion

```bash
# Gửi test Suricata alert
curl -X POST http://localhost:3001/api/ingest/suricata \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "event_type": "alert",
    "src_ip": "192.168.1.100",
    "dest_ip": "10.0.0.1",
    "src_port": 54321,
    "dest_port": 80,
    "proto": "TCP",
    "community_id": "1:test123",
    "alert": {
      "signature": "ET SCAN Test Alert",
      "severity": 2
    }
  }'

# Expected: {"success":true,"inserted":1,"status":"pending_zeek_correlation"}
```

### Test Zeek Ingestion

```bash
# Gửi test Zeek flow
curl -X POST http://localhost:3001/api/ingest/zeek \
  -H "Content-Type: application/json" \
  -d '{
    "ts": '$(date +%s.%N)',
    "uid": "CTest123",
    "community_id": "1:test123",
    "id.orig_h": "192.168.1.100",
    "id.resp_h": "10.0.0.1",
    "id.orig_p": 54321,
    "id.resp_p": 80,
    "proto": "tcp",
    "service": "http",
    "duration": 1.5,
    "conn_state": "SF"
  }'

# Expected: {"success":true,"inserted":1}
```

### Kiểm tra Metrics

```bash
curl http://localhost:3001/api/metrics | jq
```

---

## 🔧 Xử Lý Sự Cố

### Container không khởi động

```bash
# Xem logs chi tiết
docker compose logs --tail=100 ai-engine
docker compose logs --tail=100 soc-backend
docker compose logs --tail=100 soc-frontend

# Restart containers
docker compose restart
```

### AI Engine lỗi

```bash
# Kiểm tra models đã load
curl http://localhost:8000/status | jq

# Kiểm tra MegaLLM connection
docker compose logs ai-engine | grep -i megallm
```

### Database bị lỗi

```bash
# Backup database hiện tại
docker compose exec soc-backend cp /app/data/soc_events.db /app/data/soc_events.db.bak

# Reset database
docker compose exec soc-backend rm /app/data/soc_events.db
docker compose restart soc-backend
```

### Không nhận được logs

1. Kiểm tra firewall:
```bash
sudo ufw status
```

2. Kiểm tra kết nối từ NIDS:
```bash
# Trên máy NIDS
curl http://SOC_SERVER_IP:3001/api/health
```

3. Kiểm tra sender service:
```bash
# Trên máy NIDS
sudo systemctl status suricata-sender
sudo journalctl -u suricata-sender -f
```

### Frontend không load

```bash
# Kiểm tra nginx logs
docker compose logs soc-frontend

# Rebuild frontend
docker compose build --no-cache soc-frontend
docker compose up -d soc-frontend
```

---

## 💾 Backup & Restore

### Backup

```bash
# Tạo thư mục backup
sudo mkdir -p /backup/soc-dashboard

# Backup database và volumes
docker compose exec soc-backend cp /app/data/soc_events.db /app/data/backup.db
docker cp soc-backend:/app/data/backup.db /backup/soc-dashboard/soc_events_$(date +%Y%m%d).db

# Backup AI artifacts
docker cp soc-ai-engine:/app/artifacts /backup/soc-dashboard/ai-artifacts_$(date +%Y%m%d)

# Backup config
cp /opt/soc-dashboard/.env /backup/soc-dashboard/.env_$(date +%Y%m%d)
```

### Restore

```bash
# Restore database
docker cp /backup/soc-dashboard/soc_events_YYYYMMDD.db soc-backend:/app/data/soc_events.db
docker compose restart soc-backend

# Restore config
cp /backup/soc-dashboard/.env_YYYYMMDD /opt/soc-dashboard/.env
docker compose up -d
```

### Auto Backup Script

```bash
sudo nano /opt/soc-backup.sh
```

```bash
#!/bin/bash
# SOC Dashboard Auto Backup

BACKUP_DIR="/backup/soc-dashboard"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker cp soc-backend:/app/data/soc_events.db $BACKUP_DIR/soc_events_$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "soc_events_*.db" -mtime +7 -delete

echo "[$(date)] Backup completed: soc_events_$DATE.db"
```

```bash
sudo chmod +x /opt/soc-backup.sh

# Add to crontab (backup hàng ngày lúc 2h sáng)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/soc-backup.sh >> /var/log/soc-backup.log 2>&1") | crontab -
```

---

## 📝 Các Lệnh Hữu Ích

### Quản lý Docker Compose

```bash
# Khởi động tất cả
docker compose up -d

# Dừng tất cả
docker compose down

# Restart tất cả
docker compose restart

# Restart một service
docker compose restart soc-backend

# Rebuild và restart
docker compose up -d --build

# Xem resource usage
docker compose top
docker stats
```

### Xem Logs

```bash
# Logs real-time
docker compose logs -f

# Logs của service cụ thể
docker compose logs -f soc-backend

# Logs 100 dòng cuối
docker compose logs --tail=100 soc-backend
```

### Quản lý Database

```bash
# Truy cập SQLite shell
docker compose exec soc-backend sqlite3 /app/data/soc_events.db

# Đếm events
docker compose exec soc-backend sqlite3 /app/data/soc_events.db "SELECT COUNT(*) FROM events"

# Xem events gần nhất
docker compose exec soc-backend sqlite3 /app/data/soc_events.db "SELECT * FROM events ORDER BY timestamp DESC LIMIT 10"
```

### Monitoring

```bash
# Xem memory/CPU usage
docker stats

# Disk usage của volumes
docker system df -v

# Clean up unused resources
docker system prune -a
```

---

## 📞 Hỗ Trợ

Nếu gặp vấn đề, vui lòng:

1. Kiểm tra logs: `docker compose logs`
2. Đọc lại hướng dẫn này
3. Liên hệ đội ngũ C1NE.03

---

**© 2025 C1NE.03 Team - Cybersecurity K28 - Duy Tan University**
