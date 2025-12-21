# SOC Dashboard - Hướng dẫn Deploy với Docker

Cách đơn giản nhất để deploy trên Ubuntu Server.

## Yêu cầu

- Ubuntu Server 20.04+
- Docker & Docker Compose

## Cài đặt Docker (nếu chưa có)

```bash
# Cài Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Cài Docker Compose
sudo apt install docker-compose-plugin
```

## Clone và Deploy

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Build và chạy
docker compose up -d --build

# Kiểm tra logs
docker compose logs -f
```

## Ports sử dụng

| Port | Service | Description |
|------|---------|-------------|
| **8080** | Frontend | Dashboard web interface |
| **3001** | Backend | REST API |
| **3002** | Backend | WebSocket (real-time) |

## Truy cập Dashboard

```
http://YOUR_SERVER_IP:8080
```

## Cấu hình Suricata gửi log

### 1. Trên máy NIDS (có Suricata)

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

### 2. Chạy như service

```bash
sudo chmod +x /opt/suricata-sender.sh

# Tạo systemd service
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

Tương tự, tạo script cho Zeek:

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

## Kiểm tra hoạt động

```bash
# Health check
curl http://localhost:3001/api/health

# Xem máy NIDS đang kết nối
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
```

## Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────────┐
│                    Ubuntu Server (SOC)                       │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   Frontend      │    │         Backend                  │ │
│  │   (Nginx)       │    │                                  │ │
│  │   :8080         │───▶│   REST API :3001                 │ │
│  │                 │    │   WebSocket :3002                │ │
│  └─────────────────┘    │                                  │ │
│                         │   ┌─────────────────────────┐    │ │
│                         │   │  Correlation Engine     │    │ │
│                         │   │  Suricata + Zeek Flow   │    │ │
│                         │   └─────────────────────────┘    │ │
│                         │                                  │ │
│                         │   ┌─────────────────────────┐    │ │
│                         │   │  SQLite Database        │    │ │
│                         │   │  (events, zeek_flows)   │    │ │
│                         │   └─────────────────────────┘    │ │
│                         └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                    ▲                           ▲
                    │                           │
        ┌───────────┴───────────┐   ┌──────────┴───────────┐
        │   NIDS Machine #1     │   │   NIDS Machine #2    │
        │   192.168.1.10        │   │   192.168.1.11       │
        │                       │   │                      │
        │   ┌─────────────┐     │   │   ┌─────────────┐    │
        │   │  Suricata   │─────┼───┼──▶│  Backend    │    │
        │   │  eve.json   │     │   │   │  :3001      │    │
        │   └─────────────┘     │   │   └─────────────┘    │
        │                       │   │                      │
        │   ┌─────────────┐     │   │   ┌─────────────┐    │
        │   │    Zeek     │─────┼───┼──▶│  Backend    │    │
        │   │  conn.log   │     │   │   │  :3001      │    │
        │   └─────────────┘     │   │   └─────────────┘    │
        └───────────────────────┘   └──────────────────────┘
```

## Quy trình xử lý (False Positive Reduction)

```
1. Suricata Alert → Backend nhận → Lưu với status "PENDING"
                                        │
                                        ▼
2. Zeek Flow → Backend nhận → Lưu vào zeek_flows table
                                        │
                                        ▼
3. Correlation Engine (mỗi 5 giây):
   - Tìm PENDING alerts
   - Match với Zeek flows (community_id hoặc 5-tuple)
   - Cập nhật verdict: ALERT / SUSPICIOUS / BENIGN
                                        │
                                        ▼
4. AI Analysis (khi user click):
   - Lấy full context (Suricata + Zeek data)
   - Gửi cho AI phân tích
   - Cập nhật final_verdict
```

## Troubleshooting

### Container không khởi động
```bash
docker compose logs backend
docker compose logs frontend
```

### Database lỗi
```bash
docker compose down
rm -rf server/data
docker compose up -d
```

### Không nhận được log
1. Kiểm tra firewall: `sudo ufw allow 3001/tcp`
2. Kiểm tra script sender: `systemctl status suricata-sender`
3. Test kết nối: `curl http://SOC_SERVER:3001/api/health`

---

**Author: Nhóm C1NE.03 - An ninh mạng K28 - Đại học Duy Tân**
