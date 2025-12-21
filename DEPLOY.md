# SOC Dashboard - Hướng Dẫn Deploy Ubuntu 24.04 LTS

## 📋 Mục Lục

1. [Cài đặt nhanh (1 lệnh)](#-cài-đặt-nhanh-1-lệnh)
2. [Script install.sh chi tiết](#-script-installsh-chi-tiết)
3. [Cài đặt thủ công](#-cài-đặt-thủ-công)
4. [Cấu hình Firewall](#-cấu-hình-firewall)
5. [Cấu hình NIDS (Suricata/Zeek)](#-cấu-hình-nids)
6. [Troubleshooting](#-troubleshooting)
7. [Quản lý Docker](#-quản-lý-docker)

---

## 🚀 Cài Đặt Nhanh (1 Lệnh)

```bash
# Tải và chạy script cài đặt
curl -fsSL https://raw.githubusercontent.com/huynhtrungcip/insight-dashboard/main/install.sh -o install.sh && chmod +x install.sh && ./install.sh
```

**Hoặc clone trước rồi chạy:**

```bash
git clone https://github.com/huynhtrungcip/insight-dashboard.git
cd insight-dashboard
chmod +x install.sh
./install.sh
```

---

## 📖 Script install.sh Chi Tiết

### Tính Năng

| Tính năng | Mô tả |
|-----------|-------|
| ✅ **Auto-detect packages** | Kiểm tra Docker, Git, curl - CHỈ cài nếu chưa có |
| ✅ **Auto-detect cài đặt cũ** | Phát hiện nếu đã cài SOC Dashboard trước đó |
| ✅ **Reinstall an toàn** | Xóa FILES cũ, KHÔNG xóa packages hệ thống |
| ✅ **Auto-detect IP** | Tự động phát hiện IP server để cấu hình .env |
| ✅ **Fix common issues** | Tự động sửa NODE_ENV, port mapping, v.v. |

### Các Tùy Chọn

```bash
./install.sh              # Cài mới (hoặc reinstall nếu đã có)
./install.sh --status     # Kiểm tra trạng thái hệ thống
./install.sh --uninstall  # Gỡ cài đặt (chỉ xóa files)
./install.sh --help       # Hiển thị help
```

### Quy Trình Cài Đặt

```
┌─────────────────────────────────────────────────────────────┐
│                    INSTALL.SH WORKFLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. KIỂM TRA PACKAGES                                        │
│     ├── curl  → Có? SKIP : Cài mới                          │
│     ├── git   → Có? SKIP : Cài mới                          │
│     └── docker → Có? SKIP : Cài mới                         │
│                                                              │
│  2. KIỂM TRA CÀI ĐẶT CŨ                                      │
│     ├── Thư mục /opt/soc-dashboard tồn tại?                 │
│     ├── Docker containers soc-* đang chạy?                  │
│     └── Docker images soc-* tồn tại?                        │
│         │                                                    │
│         ├── CÓ → Hỏi xác nhận → Xóa FILES (giữ packages)   │
│         └── KHÔNG → Tiếp tục cài mới                        │
│                                                              │
│  3. CÀI ĐẶT                                                  │
│     ├── Clone repository                                     │
│     ├── Tạo .env với IP tự detect                           │
│     ├── Fix environment files                                │
│     └── Docker compose build & up                           │
│                                                              │
│  4. KIỂM TRA                                                 │
│     ├── Health check các services                           │
│     └── Hiển thị thông tin truy cập                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Khi Reinstall - Script Sẽ Làm Gì?

**XÓA (files/containers):**
- ❌ Docker containers: `soc-frontend`, `soc-backend`, `ai-engine`
- ❌ Docker images của SOC Dashboard
- ❌ Docker volumes (database sẽ mất!)
- ❌ Docker networks
- ❌ Thư mục `/opt/soc-dashboard`

**GIỮ LẠI (packages hệ thống):**
- ✅ Docker & Docker Compose
- ✅ Git
- ✅ curl
- ✅ Các packages khác của hệ thống

### Kiểm Tra Trạng Thái

```bash
./install.sh --status
```

Output mẫu:
```
=== PACKAGES ĐÃ CÀI ===
  Docker:          ✓ Đã cài (v24.0.7)
  Docker Compose:  ✓ Đã cài (v2.21.0)
  Git:             ✓ Đã cài (v2.43.0)
  curl:            ✓ Đã cài

=== SOC DASHBOARD ===
  Thư mục cài đặt: ✓ Có (/opt/soc-dashboard/insight-dashboard)
  Containers:      ✓ Đang chạy
    soc-frontend: Up 2 hours (healthy)
    soc-backend: Up 2 hours (healthy)
    ai-engine: Up 2 hours (healthy)

=== SERVICES HEALTH ===
  Frontend (8080):  ✓ OK
  Backend (3001):   ✓ OK
  AI Engine (8000): ✓ OK
```

---

## 🔧 Cài Đặt Thủ Công

### Yêu Cầu Hệ Thống

| Thành phần | Yêu cầu |
|------------|---------|
| OS | Ubuntu 24.04 LTS (hoặc 22.04) |
| RAM | 4 GB (khuyến nghị 8 GB) |
| CPU | 2 cores |
| Disk | 20 GB |

### Bước 1: Cài Docker

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Docker
sudo apt install -y docker.io docker-compose-plugin

# Thêm user vào group docker
sudo usermod -aG docker $USER

# QUAN TRỌNG: Đăng xuất và đăng nhập lại
logout
```

Sau khi đăng nhập lại:
```bash
docker --version
docker compose version
```

### Bước 2: Clone Repository

```bash
sudo mkdir -p /opt/soc-dashboard
sudo chown $USER:$USER /opt/soc-dashboard
cd /opt/soc-dashboard

git clone https://github.com/huynhtrungcip/insight-dashboard.git
cd insight-dashboard
```

### Bước 3: Tạo File .env

```bash
nano .env
```

**Nội dung (thay `YOUR_SERVER_IP`):**

```env
# Frontend Port
FRONTEND_PORT=8080

# API URLs - THAY YOUR_SERVER_IP BẰNG IP THỰC
VITE_API_URL=http://YOUR_SERVER_IP:3001
VITE_WS_URL=ws://YOUR_SERVER_IP:3002
VITE_AI_URL=http://YOUR_SERVER_IP:8000

# MegaLLM
MEGALLM_API_KEY=sk-your-api-key
MEGALLM_BASE_URL=https://ai.megallm.io/v1
MEGALLM_DEFAULT_MODEL=deepseek-r1-distill-llama-70b

# pfSense
PFSENSE_HOST=10.10.10.254
PFSENSE_PORT=8080
PFSENSE_API_KEY=your-pfsense-api-key
PFSENSE_ALIAS=AI_Blocked_IP

# Whitelist
WHITELIST_IPS=YOUR_SERVER_IP,10.10.10.254

# Timezone
TZ=Asia/Ho_Chi_Minh
```

### Bước 4: Build & Deploy

```bash
# Build (lần đầu ~5-10 phút)
docker compose build --no-cache

# Khởi động
docker compose up -d

# Kiểm tra
docker compose ps
```

### Bước 5: Kiểm Tra

```bash
# Health check
curl http://localhost:3001/api/health
curl http://localhost:8000/health
curl -I http://localhost:8080/
```

---

## 🔥 Cấu Hình Firewall

### UFW (Khuyến nghị)

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 8080/tcp    # Frontend
sudo ufw allow 3001/tcp    # Backend API
sudo ufw allow 3002/tcp    # WebSocket
sudo ufw allow 8000/tcp    # AI Engine

sudo ufw enable
sudo ufw status
```

### iptables

```bash
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3002 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8000 -j ACCEPT

# Lưu rules
sudo iptables-save | sudo tee /etc/iptables.rules
```

---

## 📡 Cấu Hình NIDS

### Suricata → SOC Dashboard

**1. Tạo script gửi log:**

```bash
sudo nano /opt/suricata-sender.sh
```

```bash
#!/bin/bash
# ============================================
# Suricata Log Sender
# Thay SOC_SERVER_IP bằng IP của SOC Dashboard
# ============================================

SOC_URL="http://SOC_SERVER_IP:3001/api/ingest/suricata"
LOG_FILE="/var/log/suricata/eve.json"
HOSTNAME=$(hostname)

echo "Starting Suricata sender to $SOC_URL"

tail -F "$LOG_FILE" 2>/dev/null | while read line; do
    # Chỉ gửi alert events
    if echo "$line" | grep -q '"event_type":"alert"'; then
        curl -sS -X POST "$SOC_URL" \
            -H "Content-Type: application/json" \
            -H "X-NIDS-Hostname: $HOSTNAME" \
            -d "$line" > /dev/null 2>&1
    fi
done
```

```bash
sudo chmod +x /opt/suricata-sender.sh
```

**2. Tạo systemd service:**

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
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable suricata-sender
sudo systemctl start suricata-sender
sudo systemctl status suricata-sender
```

### Zeek → SOC Dashboard

**1. Tạo script:**

```bash
sudo nano /opt/zeek-sender.sh
```

```bash
#!/bin/bash
# ============================================
# Zeek Log Sender
# Thay SOC_SERVER_IP bằng IP của SOC Dashboard
# ============================================

SOC_URL="http://SOC_SERVER_IP:3001/api/ingest/zeek"
ZEEK_LOG="/opt/zeek/logs/current/conn.log"
HOSTNAME=$(hostname)

echo "Starting Zeek sender to $SOC_URL"

tail -F "$ZEEK_LOG" 2>/dev/null | while read line; do
    # Skip comment lines
    [[ "$line" == \#* ]] && continue
    
    curl -sS -X POST "$SOC_URL" \
        -H "Content-Type: text/plain" \
        -H "X-NIDS-Hostname: $HOSTNAME" \
        -d "$line" > /dev/null 2>&1
done
```

```bash
sudo chmod +x /opt/zeek-sender.sh
```

**2. Tạo service tương tự Suricata.**

---

## 🔍 Troubleshooting

### Container Không Khởi Động

```bash
# Xem logs
docker compose logs -f

# Xem từng service
docker compose logs -f soc-backend
docker compose logs -f ai-engine
docker compose logs -f soc-frontend

# Kiểm tra config
docker compose config
```

### Lỗi WebSocket

1. Kiểm tra port 3002:
   ```bash
   sudo ufw status | grep 3002
   ```

2. Kiểm tra VITE_WS_URL trong .env

3. Rebuild frontend:
   ```bash
   docker compose up -d --build soc-frontend
   ```

### Lỗi AI Engine

```bash
# Health check
curl http://localhost:8000/health
curl http://localhost:8000/status

# Kiểm tra API key
docker compose exec ai-engine env | grep MEGALLM
```

### Lỗi "Failed to fetch"

1. Kiểm tra backend:
   ```bash
   curl http://localhost:3001/api/health
   ```

2. Kiểm tra VITE_API_URL trong .env đúng IP chưa

3. Kiểm tra firewall

### Reset Database

```bash
# CẢNH BÁO: Mất toàn bộ data!
docker compose down -v
docker compose up -d --build
```

### Reinstall Hoàn Toàn

```bash
# Gỡ cài đặt (giữ packages)
./install.sh --uninstall

# Cài lại
./install.sh
```

---

## 🐳 Quản Lý Docker

### Các Lệnh Thường Dùng

| Lệnh | Mô tả |
|------|-------|
| `docker compose ps` | Xem status |
| `docker compose logs -f` | Xem logs realtime |
| `docker compose restart` | Restart tất cả |
| `docker compose down` | Stop và remove |
| `docker compose up -d --build` | Rebuild và start |

### Rebuild Sau Khi Đổi .env

```bash
# Chỉ rebuild frontend (vì Vite bake URL vào build)
docker compose up -d --build soc-frontend
```

### Backup Database

```bash
# Backup SQLite
docker compose exec soc-backend cat /app/data/soc_events.db > backup_$(date +%Y%m%d).db
```

### Restore Database

```bash
docker cp backup.db soc-backend:/app/data/soc_events.db
docker compose restart soc-backend
```

### Cập Nhật Phiên Bản Mới

```bash
cd /opt/soc-dashboard/insight-dashboard

# Dừng services
docker compose down

# Pull code mới
git pull origin main

# Rebuild
docker compose up -d --build
```

---

## 📊 Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SOC Dashboard System                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
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

### Ports

| Port | Service | Mô tả |
|------|---------|-------|
| 8080 | Frontend | Dashboard web |
| 3001 | Backend | REST API |
| 3002 | Backend | WebSocket |
| 8000 | AI Engine | AI Analysis API |

---

## 📞 Hỗ Trợ

- **Team:** C1NE.03 - An ninh mạng K28
- **University:** Đại học Duy Tân
- **GitHub:** https://github.com/huynhtrungcip/insight-dashboard

---

## 📝 Quick Commands

```bash
# ===== Thư mục làm việc =====
cd /opt/soc-dashboard/insight-dashboard

# ===== Xem logs =====
docker compose logs -f

# ===== Restart =====
docker compose restart

# ===== Stop =====
docker compose down

# ===== Rebuild =====
docker compose up -d --build

# ===== Status =====
./install.sh --status
```
