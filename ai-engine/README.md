# AI-SOC False Positive Reduction Engine

Hệ thống AI phân tích log Suricata + Zeek để giảm thiểu cảnh báo giả (False Positive).

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SOC Dashboard System                          │
├──────────────────────┬──────────────────────┬──────────────────────┤
│   Suricata Alerts    │    Zeek Conn Logs    │   Zeek HTTP Logs     │
│   (eve.json)         │    (conn.log)        │   (http.log)         │
└──────────┬───────────┴──────────┬───────────┴──────────┬───────────┘
           │                      │                      │
           ▼                      ▼                      ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                   Node.js Backend (:3001)                     │
    │   - Nhận log từ Suricata/Zeek                                │
    │   - Lưu vào SQLite                                           │
    │   - Correlation engine (community_id / 5-tuple)              │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                   AI Engine (:8000)                           │
    │   ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
    │   │ Rule Matcher    │ │ L1 Autoencoder  │ │ L2 Classifier  │ │
    │   │ (Signatures)    │ │ (Anomaly Det.)  │ │ (Attack Type)  │ │
    │   └────────┬────────┘ └────────┬────────┘ └───────┬────────┘ │
    │            │                   │                  │          │
    │            └───────────────────┼──────────────────┘          │
    │                                ▼                              │
    │                    ┌───────────────────────┐                  │
    │                    │   Verdict Decision    │                  │
    │                    │ ALERT/SUSPICIOUS/FP   │                  │
    │                    └───────────┬───────────┘                  │
    └────────────────────────────────┼─────────────────────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │   pfSense Auto-Block           │
                    │   (nếu ALERT + confidence≥0.8) │
                    └────────────────────────────────┘
```

## Cài đặt

### Với Docker (Khuyến nghị)

```bash
docker build -t ai-soc-engine .
docker run -d \
  --name ai-engine \
  -p 8000:8000 \
  -v ./artifacts:/app/artifacts \
  -v ./database:/app/database \
  -e PFSENSE_HOST=10.10.10.254 \
  -e PFSENSE_PORT=8080 \
  -e PFSENSE_API_KEY=your_api_key \
  ai-soc-engine
```

### Manual Installation

```bash
cd ai-engine
pip install -r requirements.txt
python main.py
```

## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/health` | Health check |
| GET | `/status` | Trạng thái hệ thống |
| POST | `/analyze/flow` | Phân tích 1 flow |
| POST | `/analyze/ip` | Phân tích tất cả flows từ 1 IP |
| POST | `/block` | Block IP trên pfSense |
| POST | `/unblock` | Unblock IP |
| GET | `/auto-block` | Lấy trạng thái auto-block |
| POST | `/auto-block` | Bật/tắt auto-block |
| POST | `/reload-models` | Reload AI models |

## Quy trình phân tích

1. **Rule Matching**: Kiểm tra signature với danh sách CRITICAL/SUSPICIOUS/BENIGN
2. **Zeek Correlation**: Tìm log Zeek tương ứng qua community_id hoặc 5-tuple
3. **ML Analysis** (nếu có models):
   - L1 Autoencoder: Phát hiện anomaly
   - L2 Classifier: Phân loại attack type
4. **Verdict Decision**: Tổng hợp kết quả → ALERT/SUSPICIOUS/FALSE_POSITIVE
5. **Auto-Block**: Block IP nếu verdict=ALERT và confidence≥0.8

## AI Models

Đặt các file model vào thư mục `/app/artifacts/`:

- `L1_AnomalyGate.keras` - Autoencoder model
- `L1_scaler_anomaly.joblib` - Scaler cho L1
- `L2_BenignVerifier_Final.joblib` - Classifier model
- `L2_scaler_classifier.joblib` - Scaler cho L2
- `L2_optimal_threshold.joblib` - Threshold
- `L2_top_features.joblib` - Feature list

## Cấu hình

Các biến môi trường:

| Variable | Mặc định | Mô tả |
|----------|---------|-------|
| `PFSENSE_HOST` | 10.10.10.254 | IP của pfSense |
| `PFSENSE_PORT` | 8080 | Port REST API pfSense |
| `PFSENSE_API_KEY` | - | API key cho pfSense |
| `PFSENSE_ALIAS` | AI_Blocked_IP | Tên alias firewall |
| `WHITELIST_IPS` | - | Danh sách IP không được block (comma-separated) |
| `NODEJS_BACKEND_URL` | http://soc-backend:3001 | URL của Node.js backend |

## Test API

```bash
# Health check
curl http://localhost:8000/health

# Analyze flow
curl -X POST http://localhost:8000/analyze/flow \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "test-123",
    "suricata_alert": {
      "src_ip": "192.168.1.100",
      "dst_ip": "10.0.0.1",
      "attack_type": "ET SCAN Potential SSH Scan"
    },
    "zeek_flows": [{
      "community_id": "1:abc123",
      "conn_state": "REJ",
      "duration": 0.1
    }]
  }'

# Block IP
curl -X POST http://localhost:8000/block \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.1.100"}'

# Toggle auto-block
curl -X POST http://localhost:8000/auto-block \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

## Author

**Nhóm C1NE.03** - Chuyên ngành An ninh mạng K28 - Đại học Duy Tân
