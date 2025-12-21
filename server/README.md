# SOC Dashboard Backend Server

Backend server để nhận log thật từ Suricata và Zeek.

## Yêu cầu

- Node.js 18+ 
- Ubuntu Server 20.04+

## Cài đặt

```bash
cd server
npm install
```

## Chạy Server

```bash
# Development
npm run dev

# Production
npm start
```

Server sẽ chạy trên:
- **REST API**: `http://0.0.0.0:3001`
- **WebSocket**: `ws://0.0.0.0:3002`

## Cấu hình Suricata

### 1. Chỉnh sửa `/etc/suricata/suricata.yaml`

```yaml
outputs:
  - eve-log:
      enabled: yes
      filetype: regular
      filename: eve.json
      types:
        - alert:
            tagged-packets: yes
```

### 2. Tạo script gửi log đến server

Tạo file `/opt/suricata-sender.sh`:

```bash
#!/bin/bash
SERVER_URL="http://<YOUR_SERVER_IP>:3001/api/ingest/suricata"
EVE_LOG="/var/log/suricata/eve.json"

tail -F "$EVE_LOG" | while read line; do
  curl -s -X POST "$SERVER_URL" \
    -H "Content-Type: application/json" \
    -d "$line" > /dev/null
done
```

### 3. Chạy như systemd service

```bash
sudo nano /etc/systemd/system/suricata-sender.service
```

```ini
[Unit]
Description=Suricata Log Sender
After=suricata.service

[Service]
Type=simple
ExecStart=/opt/suricata-sender.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable suricata-sender
sudo systemctl start suricata-sender
```

## Cấu hình Zeek

### 1. Chỉnh sửa `/opt/zeek/etc/zeekctl.cfg`

```
LogDir = /var/log/zeek
```

### 2. Tạo script gửi log

```bash
#!/bin/bash
SERVER_URL="http://<YOUR_SERVER_IP>:3001/api/ingest/zeek"
ZEEK_LOG="/var/log/zeek/current/conn.log"

tail -F "$ZEEK_LOG" | while read line; do
  [[ "$line" =~ ^# ]] && continue
  curl -s -X POST "$SERVER_URL" \
    -H "Content-Type: text/plain" \
    -d "$line" > /dev/null
done
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Lấy thông tin cấu hình server |
| GET | `/api/events` | Lấy danh sách events |
| GET | `/api/metrics` | Lấy metrics tổng hợp |
| GET | `/api/traffic` | Lấy dữ liệu traffic cho biểu đồ |
| POST | `/api/ingest` | Nhận log generic |
| POST | `/api/ingest/suricata` | Nhận log Suricata EVE JSON |
| POST | `/api/ingest/zeek` | Nhận log Zeek |
| GET | `/api/events/by-ip/:ip` | Lấy tất cả events từ một IP |

## Test với curl

```bash
# Health check
curl http://localhost:3001/api/health

# Gửi test event
curl -X POST http://localhost:3001/api/ingest/suricata \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-01-15T10:30:00Z",
    "event_type": "alert",
    "src_ip": "192.168.1.100",
    "dest_ip": "10.0.0.1",
    "src_port": 54321,
    "dest_port": 80,
    "proto": "TCP",
    "alert": {
      "signature": "ET SCAN Potential SSH Scan",
      "severity": 2
    }
  }'

# Lấy events
curl http://localhost:3001/api/events

# Lấy metrics
curl http://localhost:3001/api/metrics
```

## WebSocket Real-time Updates

```javascript
const ws = new WebSocket('ws://YOUR_SERVER_IP:3002');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'NEW_EVENT') {
    console.log('New event:', data.data);
  }
};
```

## Troubleshooting

### Không nhận được log
1. Kiểm tra Suricata/Zeek đang chạy: `systemctl status suricata`
2. Kiểm tra file log: `tail -f /var/log/suricata/eve.json`
3. Kiểm tra kết nối: `curl http://localhost:3001/api/health`

### Lỗi database
```bash
rm server/soc_events.db
npm start
```

## Author

**Nhóm C1NE.03** - Chuyên ngành An ninh mạng K28 - Đại học Duy Tân
