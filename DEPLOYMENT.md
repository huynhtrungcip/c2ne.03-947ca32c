# Hướng dẫn triển khai SOC Dashboard trên Ubuntu Server

## Bước 1: Tải code từ GitHub

### 1.1 Kết nối GitHub trong Lovable
1. Nhấn **GitHub** ở góc trên phải
2. Chọn **Connect to GitHub**
3. Authorize và tạo repository mới

### 1.2 Clone về Ubuntu Server
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

## Bước 2: Cài đặt dependencies

### 2.1 Cài Node.js 18+
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2.2 Cài đặt Frontend
```bash
npm install
npm run build
```

### 2.3 Cài đặt Backend
```bash
cd server
npm install
```

## Bước 3: Cấu hình Frontend

Tạo file `.env`:
```bash
nano .env
```

```env
# Backend Server URL (thay bằng IP của Ubuntu Server)
VITE_API_URL=http://192.168.1.100:3001
VITE_WS_URL=ws://192.168.1.100:3002
```

Build lại:
```bash
npm run build
```

## Bước 4: Chạy Backend Server

```bash
cd server
npm start
```

Hoặc dùng PM2 để chạy như service:
```bash
sudo npm install -g pm2
pm2 start index.js --name soc-backend
pm2 startup
pm2 save
```

## Bước 5: Serve Frontend với Nginx

### 5.1 Cài Nginx
```bash
sudo apt install nginx
```

### 5.2 Cấu hình
```bash
sudo nano /etc/nginx/sites-available/soc-dashboard
```

```nginx
server {
    listen 80;
    server_name _;
    
    root /path/to/YOUR_REPO/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy API requests to backend
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/soc-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Bước 6: Cấu hình Suricata gửi log

### 6.1 Tạo sender script
```bash
sudo nano /opt/suricata-sender.sh
```

```bash
#!/bin/bash
SERVER_URL="http://127.0.0.1:3001/api/ingest/suricata"
EVE_LOG="/var/log/suricata/eve.json"

tail -F "$EVE_LOG" 2>/dev/null | while read line; do
  echo "$line" | curl -s -X POST "$SERVER_URL" \
    -H "Content-Type: application/json" \
    -d @- > /dev/null 2>&1
done
```

```bash
sudo chmod +x /opt/suricata-sender.sh
```

### 6.2 Tạo systemd service
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
```

## Bước 7: Cấu hình Zeek gửi log

```bash
sudo nano /opt/zeek-sender.sh
```

```bash
#!/bin/bash
SERVER_URL="http://127.0.0.1:3001/api/ingest/zeek"

# Watch notice.log for alerts
tail -F /opt/zeek/logs/current/notice.log 2>/dev/null | while read line; do
  [[ "$line" =~ ^# ]] && continue
  echo "$line" | curl -s -X POST "$SERVER_URL" \
    -H "Content-Type: text/plain" \
    -d @- > /dev/null 2>&1
done
```

## Bước 8: Kiểm tra hoạt động

### 8.1 Kiểm tra Backend
```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok","timestamp":"...","connections":0,"version":"1.0.0"}
```

### 8.2 Kiểm tra cấu hình
```bash
curl http://localhost:3001/api/config
```

Output:
```json
{
  "ingest_endpoint": "http://localhost:3001/api/ingest",
  "suricata_endpoint": "http://localhost:3001/api/ingest/suricata",
  "zeek_endpoint": "http://localhost:3001/api/ingest/zeek",
  "websocket": "ws://localhost:3002",
  "port": 3001,
  "ws_port": 3002
}
```

### 8.3 Test gửi log
```bash
curl -X POST http://localhost:3001/api/ingest/suricata \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-01-15T10:30:00Z",
    "event_type": "alert",
    "src_ip": "192.168.1.100",
    "dest_ip": "10.0.0.1",
    "dest_port": 22,
    "proto": "TCP",
    "alert": {
      "signature": "ET SCAN SSH Bruteforce",
      "severity": 1
    }
  }'
```

### 8.4 Truy cập Dashboard
Mở trình duyệt: `http://YOUR_SERVER_IP`

## Kiến trúc mạng

```
┌────────────────────────────────────────────────────────────┐
│                      Ubuntu Server                         │
│  ┌─────────────┐    ┌─────────────┐    ┌───────────────┐  │
│  │  Suricata   │───▶│   Sender    │───▶│  Backend API  │  │
│  │  eve.json   │    │   Script    │    │  :3001        │  │
│  └─────────────┘    └─────────────┘    └───────┬───────┘  │
│                                                 │          │
│  ┌─────────────┐    ┌─────────────┐    ┌───────▼───────┐  │
│  │    Zeek     │───▶│   Sender    │───▶│   SQLite DB   │  │
│  │  notice.log │    │   Script    │    │               │  │
│  └─────────────┘    └─────────────┘    └───────────────┘  │
│                                                 │          │
│  ┌─────────────────────────────────────────────┼────────┐ │
│  │                  Frontend                    │        │ │
│  │                  (Nginx)                     ▼        │ │
│  │                  :80              WebSocket :3002     │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   Browser (Client)      │
              │   http://SERVER_IP      │
              └────────────────────────┘
```

## Ports cần mở

| Port | Service | Description |
|------|---------|-------------|
| 80 | Nginx | Frontend web |
| 3001 | Backend | REST API |
| 3002 | Backend | WebSocket |

```bash
sudo ufw allow 80/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 3002/tcp
```

## Troubleshooting

### Log không hiển thị
1. Kiểm tra Suricata: `systemctl status suricata`
2. Kiểm tra sender: `systemctl status suricata-sender`
3. Kiểm tra log: `journalctl -u suricata-sender -f`

### WebSocket không kết nối
1. Kiểm tra port 3002 đang mở
2. Kiểm tra firewall: `sudo ufw status`

### Database lỗi
```bash
rm server/soc_events.db
pm2 restart soc-backend
```

---

**Author: Nhóm C1NE.03 - An ninh mạng K28 - Đại học Duy Tân**
