#!/bin/bash
# ============================================================
# SOC Dashboard - Local Quick Deploy
# Author: C1NE.03 Team - Cybersecurity K28 - Duy Tan University
# ------------------------------------------------------------
# Sử dụng khi bạn ĐÃ có source code (git clone hoặc download zip).
# Script này KHÔNG clone repo, chỉ build & start docker compose.
#
#   chmod +x start-local.sh
#   ./start-local.sh            # Build + start
#   ./start-local.sh rebuild    # Rebuild no-cache
#   ./start-local.sh stop       # Dừng
#   ./start-local.sh logs       # Xem logs
#   ./start-local.sh status     # Xem status
# ============================================================

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info(){ echo -e "${CYAN}[i]${NC} $1"; }
ok(){ echo -e "${GREEN}[✓]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }
err(){ echo -e "${RED}[✗]${NC} $1"; }

cd "$(dirname "$0")"

# Detect Docker compose command
if docker compose version &>/dev/null; then
    DC="docker compose"
elif command -v docker-compose &>/dev/null; then
    DC="docker-compose"
else
    err "Docker Compose chưa được cài đặt!"
    exit 1
fi

# Detect IP
detect_ip(){
    local ip
    ip=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
    [[ -z "$ip" ]] && ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [[ -z "$ip" ]] && ip="localhost"
    echo "$ip"
}

ensure_env(){
    if [[ ! -f .env ]]; then
        warn ".env chưa có → tạo từ .env.example"
        local ip=$(detect_ip)
        if [[ -f .env.example ]]; then
            cp .env.example .env
            sed -i "s|YOUR_SERVER_IP|${ip}|g" .env
        else
            cat > .env <<EOF
FRONTEND_PORT=8080
VITE_API_URL=http://${ip}:3001
VITE_WS_URL=ws://${ip}:3002
VITE_AI_URL=http://${ip}:8000
MEGALLM_API_KEY=sk-your-key
MEGALLM_BASE_URL=https://ai.megallm.io/v1
MEGALLM_DEFAULT_MODEL=deepseek-r1-distill-llama-70b
PFSENSE_HOST=10.10.10.254
PFSENSE_PORT=8080
PFSENSE_API_KEY=your-pfsense-key
PFSENSE_ALIAS=AI_Blocked_IP
WHITELIST_IPS=${ip},10.10.10.254
TZ=Asia/Ho_Chi_Minh
EOF
        fi
        ok ".env đã tạo (IP=${ip}). Hãy mở và update API keys."
    fi
}

case "${1:-up}" in
    up|start)
        ensure_env
        info "Build & start containers..."
        $DC up -d --build
        sleep 6
        $DC ps
        ip=$(detect_ip)
        echo ""
        ok "Dashboard: http://${ip}:8080"
        ok "Backend:   http://${ip}:3001/api/health"
        ok "AI Engine: http://${ip}:8000/health"
        ;;
    rebuild)
        ensure_env
        info "Rebuild không cache..."
        $DC build --no-cache
        $DC up -d
        $DC ps
        ;;
    stop|down)
        info "Dừng containers..."
        $DC down
        ok "Đã dừng"
        ;;
    logs)
        $DC logs -f --tail=100
        ;;
    status|ps)
        $DC ps
        echo ""
        echo -n "Frontend (8080): "; curl -sS --max-time 3 http://localhost:8080/ >/dev/null && echo "OK" || echo "DOWN"
        echo -n "Backend  (3001): "; curl -sS --max-time 3 http://localhost:3001/api/health >/dev/null && echo "OK" || echo "DOWN"
        echo -n "AI Engine(8000): "; curl -sS --max-time 3 http://localhost:8000/health >/dev/null && echo "OK" || echo "DOWN"
        ;;
    restart)
        $DC restart
        ;;
    *)
        echo "Usage: $0 [up|rebuild|stop|logs|status|restart]"
        exit 1
        ;;
esac
