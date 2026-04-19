#!/bin/bash

# ============================================================
# SOC Dashboard - One-Click Installation Script
# Author: C1NE.03 Team - Cybersecurity K28 - Duy Tan University
# Version: 2.0
# ============================================================
#
# TÍNH NĂNG:
# - Kiểm tra hệ thống đã cài đặt chưa
# - Chỉ xóa FILES, KHÔNG xóa packages (Docker, Git, curl)
# - Kiểm tra packages đã có thì SKIP, chưa có thì cài
# - Hỗ trợ reinstall (gỡ cài đặt cũ + cài mới)
# - Tự động detect IP server
#
# CÁCH SỬ DỤNG:
#   chmod +x install.sh
#   ./install.sh              # Cài đặt mới hoặc reinstall
#   ./install.sh --uninstall  # Gỡ cài đặt (chỉ xóa files)
#   ./install.sh --status     # Kiểm tra trạng thái
#   ./install.sh --help       # Hiển thị help
#
# ============================================================

set -e

# ==================== CONFIGURATION ====================
INSTALL_DIR="/opt/soc-dashboard"
REPO_URL="https://github.com/huynhtrungcip/c2ne.03-947ca32c.git"
PROJECT_DIR="c2ne.03-947ca32c"
SCRIPT_VERSION="2.1"

# ==================== COLORS ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# ==================== PRINT FUNCTIONS ====================
print_banner() {
    clear
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║       SOC Dashboard - False Positive Reduction System         ║"
    echo "║       One-Click Installation Script v${SCRIPT_VERSION}                      ║"
    echo "║       C1NE.03 Team - Cybersecurity K28 - Duy Tan University   ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}[STEP]${NC} $1"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error()   { echo -e "${RED}[✗]${NC} $1"; }
print_info()    { echo -e "${CYAN}[i]${NC} $1"; }
print_check()   { echo -e "${MAGENTA}[?]${NC} $1"; }

# ==================== UTILITY FUNCTIONS ====================

# Kiểm tra có chạy với root không
check_not_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "KHÔNG chạy script với root/sudo!"
        print_info "Chạy với user thường, script sẽ tự dùng sudo khi cần."
        exit 1
    fi
}

# Detect IP của server
detect_server_ip() {
    local ip=""
    
    # Cách 1: Lấy từ default route
    ip=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
    
    # Cách 2: Lấy IP đầu tiên không phải loopback
    if [[ -z "$ip" ]]; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    
    # Cách 3: Fallback
    if [[ -z "$ip" ]]; then
        ip="localhost"
    fi
    
    echo "$ip"
}

# ==================== CHECK FUNCTIONS ====================

# Kiểm tra package đã cài chưa
is_package_installed() {
    local package="$1"
    command -v "$package" &> /dev/null
}

# Kiểm tra hệ thống đã cài SOC Dashboard chưa
check_existing_installation() {
    local status=0
    
    # Check 1: Thư mục cài đặt
    if [[ -d "$INSTALL_DIR/$PROJECT_DIR" ]]; then
        status=1
    fi
    
    # Check 2: Docker containers
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qE 'soc-|ai-engine'; then
        status=1
    fi
    
    # Check 3: Docker images
    if docker images --format '{{.Repository}}' 2>/dev/null | grep -qE 'soc-|c2ne'; then
        status=1
    fi
    
    return $status
}

# Hiển thị trạng thái hệ thống
show_system_status() {
    print_step "KIỂM TRA TRẠNG THÁI HỆ THỐNG"
    
    echo ""
    echo -e "${CYAN}=== PACKAGES ĐÃ CÀI ===${NC}"
    echo ""
    
    # Check Docker
    echo -n "  Docker:          "
    if is_package_installed docker; then
        local docker_ver=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
        echo -e "${GREEN}✓ Đã cài (v${docker_ver})${NC}"
    else
        echo -e "${RED}✗ Chưa cài${NC}"
    fi
    
    # Check Docker Compose
    echo -n "  Docker Compose:  "
    if docker compose version &> /dev/null; then
        local compose_ver=$(docker compose version --short 2>/dev/null)
        echo -e "${GREEN}✓ Đã cài (v${compose_ver})${NC}"
    else
        echo -e "${RED}✗ Chưa cài${NC}"
    fi
    
    # Check Git
    echo -n "  Git:             "
    if is_package_installed git; then
        local git_ver=$(git --version 2>/dev/null | awk '{print $3}')
        echo -e "${GREEN}✓ Đã cài (v${git_ver})${NC}"
    else
        echo -e "${RED}✗ Chưa cài${NC}"
    fi
    
    # Check curl
    echo -n "  curl:            "
    if is_package_installed curl; then
        echo -e "${GREEN}✓ Đã cài${NC}"
    else
        echo -e "${RED}✗ Chưa cài${NC}"
    fi
    
    # Check jq
    echo -n "  jq:              "
    if is_package_installed jq; then
        echo -e "${GREEN}✓ Đã cài${NC}"
    else
        echo -e "${YELLOW}○ Chưa cài (tùy chọn)${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}=== SOC DASHBOARD ===${NC}"
    echo ""
    
    # Check installation directory
    echo -n "  Thư mục cài đặt: "
    if [[ -d "$INSTALL_DIR/$PROJECT_DIR" ]]; then
        echo -e "${GREEN}✓ Có ($INSTALL_DIR/$PROJECT_DIR)${NC}"
    else
        echo -e "${YELLOW}○ Chưa có${NC}"
    fi
    
    # Check Docker containers
    echo ""
    echo -n "  Containers:      "
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE 'soc-|ai-engine'; then
        echo -e "${GREEN}✓ Đang chạy${NC}"
        echo ""
        docker ps --format "    {{.Names}}: {{.Status}}" 2>/dev/null | grep -E 'soc-|ai-engine' || true
    elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qE 'soc-|ai-engine'; then
        echo -e "${YELLOW}○ Đã dừng${NC}"
    else
        echo -e "${YELLOW}○ Chưa có${NC}"
    fi
    
    # Check services health
    echo ""
    echo -e "${CYAN}=== SERVICES HEALTH ===${NC}"
    echo ""
    
    echo -n "  Frontend (8080):  "
    if curl -sS --max-time 3 "http://localhost:8080/" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ Không phản hồi${NC}"
    fi
    
    echo -n "  Backend (3001):   "
    if curl -sS --max-time 3 "http://localhost:3001/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ Không phản hồi${NC}"
    fi
    
    echo -n "  AI Engine (8000): "
    if curl -sS --max-time 3 "http://localhost:8000/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ Không phản hồi${NC}"
    fi
    
    echo ""
}

# ==================== INSTALL PACKAGES ====================

# Cài curl (nếu chưa có)
ensure_curl() {
    print_step "KIỂM TRA CURL"
    
    if is_package_installed curl; then
        print_success "curl đã được cài đặt → SKIP"
    else
        print_warning "curl chưa có → Đang cài đặt..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq curl
        print_success "curl đã cài xong"
    fi
}

# Cài Git (nếu chưa có)
ensure_git() {
    print_step "KIỂM TRA GIT"
    
    if is_package_installed git; then
        local ver=$(git --version | awk '{print $3}')
        print_success "Git đã được cài đặt (v${ver}) → SKIP"
    else
        print_warning "Git chưa có → Đang cài đặt..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq git
        print_success "Git đã cài xong"
    fi
}

# Cài Docker (nếu chưa có)
ensure_docker() {
    print_step "KIỂM TRA DOCKER"
    
    if is_package_installed docker; then
        local ver=$(docker --version | awk '{print $3}' | tr -d ',')
        print_success "Docker đã được cài đặt (v${ver}) → SKIP"
    else
        print_warning "Docker chưa có → Đang cài đặt..."
        
        # Cài dependencies
        sudo apt-get update -qq
        sudo apt-get install -y -qq \
            apt-transport-https \
            ca-certificates \
            gnupg \
            lsb-release
        
        # Thêm Docker GPG key
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        
        # Thêm Docker repository
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
            $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
            sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Cài Docker
        sudo apt-get update -qq
        sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        print_success "Docker đã cài xong"
    fi
    
    # Check Docker Compose plugin
    if docker compose version &> /dev/null; then
        local compose_ver=$(docker compose version --short 2>/dev/null)
        print_success "Docker Compose plugin: v${compose_ver}"
    else
        print_error "Docker Compose plugin không có!"
        print_info "Thử: sudo apt install docker-compose-plugin"
        exit 1
    fi
    
    # Thêm user vào docker group (nếu chưa)
    if ! groups | grep -q docker; then
        print_warning "Thêm user vào group docker..."
        sudo usermod -aG docker $USER
        print_info "Bạn cần đăng xuất/đăng nhập lại để áp dụng group docker"
    fi
    
    # Khởi động Docker service
    if ! systemctl is-active --quiet docker; then
        print_warning "Khởi động Docker service..."
        sudo systemctl start docker
        sudo systemctl enable docker
    fi
    
    print_success "Docker service đang chạy"
}

# ==================== UNINSTALL (CHỈ XÓA FILES) ====================

uninstall_files_only() {
    print_step "GỠ CÀI ĐẶT SOC DASHBOARD (CHỈ XÓA FILES)"
    
    print_warning "CẢNH BÁO: Thao tác này sẽ:"
    echo "  • Dừng và xóa Docker containers (soc-frontend, soc-backend, ai-engine)"
    echo "  • Xóa Docker images của SOC Dashboard"
    echo "  • Xóa Docker volumes (DATABASE SẼ MẤT!)"
    echo "  • Xóa thư mục $INSTALL_DIR"
    echo ""
    echo -e "  ${GREEN}KHÔNG XÓA:${NC} Docker, Git, curl và các packages hệ thống"
    echo ""
    
    read -p "Bạn có chắc muốn tiếp tục? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        print_info "Đã hủy gỡ cài đặt"
        exit 0
    fi
    
    echo ""
    
    # 1. Dừng containers
    print_info "Bước 1/5: Dừng Docker containers..."
    if [[ -d "$INSTALL_DIR/$PROJECT_DIR" ]]; then
        cd "$INSTALL_DIR/$PROJECT_DIR" 2>/dev/null || true
        docker compose down --remove-orphans 2>/dev/null || true
    fi
    
    # Dừng containers bằng tên (phòng trường hợp không có docker-compose.yml)
    docker stop soc-frontend soc-backend ai-engine soc-ai-engine 2>/dev/null || true
    docker rm soc-frontend soc-backend ai-engine soc-ai-engine 2>/dev/null || true
    print_success "Đã dừng containers"
    
    # 2. Xóa Docker images
    print_info "Bước 2/5: Xóa Docker images..."
    docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | \
        grep -E 'c2ne|soc-' | awk '{print $2}' | \
        xargs -r docker rmi -f 2>/dev/null || true
    print_success "Đã xóa images"
    
    # 3. Xóa Docker volumes
    print_info "Bước 3/5: Xóa Docker volumes..."
    docker volume ls --format '{{.Name}}' 2>/dev/null | \
        grep -E 'c2ne|soc-' | \
        xargs -r docker volume rm 2>/dev/null || true
    print_success "Đã xóa volumes"
    
    # 4. Xóa Docker networks
    print_info "Bước 4/5: Xóa Docker networks..."
    docker network ls --format '{{.Name}}' 2>/dev/null | \
        grep -E 'c2ne|soc-' | \
        xargs -r docker network rm 2>/dev/null || true
    print_success "Đã xóa networks"
    
    # 5. Xóa thư mục cài đặt
    print_info "Bước 5/5: Xóa thư mục cài đặt..."
    if [[ -d "$INSTALL_DIR" ]]; then
        sudo rm -rf "$INSTALL_DIR"
        print_success "Đã xóa $INSTALL_DIR"
    else
        print_info "Thư mục $INSTALL_DIR không tồn tại"
    fi
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              GỠ CÀI ĐẶT HOÀN TẤT!                              ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    print_info "Các packages (Docker, Git, curl) vẫn được giữ lại."
    print_info "Để cài lại, chạy: ./install.sh"
    echo ""
}

# ==================== CLEAN FOR REINSTALL ====================

clean_for_reinstall() {
    print_step "DỌN DẸP CÀI ĐẶT CŨ ĐỂ CÀI LẠI"
    
    local has_existing=false
    
    # Check existing installation
    if [[ -d "$INSTALL_DIR" ]]; then
        has_existing=true
    fi
    
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qE 'soc-|ai-engine'; then
        has_existing=true
    fi
    
    if [[ "$has_existing" == false ]]; then
        print_success "Không có cài đặt cũ → Tiếp tục cài mới"
        return 0
    fi
    
    print_warning "Phát hiện cài đặt cũ!"
    echo ""
    echo "  Sẽ xóa:"
    echo "  • Docker containers: soc-frontend, soc-backend, ai-engine"
    echo "  • Docker volumes (database)"
    echo "  • Thư mục: $INSTALL_DIR"
    echo ""
    echo -e "  ${GREEN}Giữ lại:${NC} Docker, Git, curl, jq"
    echo ""
    
    read -p "Tiếp tục xóa cài đặt cũ và cài lại? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        print_info "Đã hủy cài đặt"
        exit 0
    fi
    
    echo ""
    
    # Dừng và xóa containers
    print_info "Dừng containers cũ..."
    if [[ -d "$INSTALL_DIR/$PROJECT_DIR" ]]; then
        cd "$INSTALL_DIR/$PROJECT_DIR" 2>/dev/null || true
        docker compose down --remove-orphans -v 2>/dev/null || true
    fi
    docker stop soc-frontend soc-backend ai-engine soc-ai-engine 2>/dev/null || true
    docker rm soc-frontend soc-backend ai-engine soc-ai-engine 2>/dev/null || true
    
    # Xóa images
    print_info "Xóa images cũ..."
    docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | \
        grep -E 'c2ne|soc-' | awk '{print $2}' | \
        xargs -r docker rmi -f 2>/dev/null || true
    
    # Xóa volumes
    print_info "Xóa volumes cũ..."
    docker volume ls --format '{{.Name}}' 2>/dev/null | \
        grep -E 'c2ne|soc-' | \
        xargs -r docker volume rm 2>/dev/null || true
    
    # Xóa networks
    print_info "Xóa networks cũ..."
    docker network ls --format '{{.Name}}' 2>/dev/null | \
        grep -E 'c2ne|soc-' | \
        xargs -r docker network rm 2>/dev/null || true
    
    # Xóa thư mục
    print_info "Xóa thư mục cài đặt cũ..."
    if [[ -d "$INSTALL_DIR" ]]; then
        sudo rm -rf "$INSTALL_DIR"
    fi
    
    print_success "Đã dọn dẹp cài đặt cũ"
}

# ==================== INSTALL APPLICATION ====================

clone_repository() {
    print_step "TẢI SOURCE CODE"
    
    # Tạo thư mục
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown $USER:$USER "$INSTALL_DIR"
    
    cd "$INSTALL_DIR"
    
    # Clone repository
    print_info "Đang clone từ: $REPO_URL"
    git clone "$REPO_URL"
    
    if [[ -d "$PROJECT_DIR" ]]; then
        print_success "Clone thành công"
        cd "$PROJECT_DIR"
    else
        print_error "Clone thất bại!"
        exit 1
    fi
}

configure_environment() {
    print_step "CẤU HÌNH ENVIRONMENT"
    
    local server_ip=$(detect_server_ip)
    print_info "Detected server IP: $server_ip"
    
    # Tạo file .env
    cat > .env << EOF
# ============================================================
# SOC Dashboard Configuration
# Generated by install.sh v${SCRIPT_VERSION}
# Date: $(date)
# Server IP: ${server_ip}
# ============================================================

# === Frontend Port ===
FRONTEND_PORT=8080

# === API URLs ===
# Các URL này được bake vào frontend khi build
VITE_API_URL=http://${server_ip}:3001
VITE_WS_URL=ws://${server_ip}:3002
VITE_AI_URL=http://${server_ip}:8000

# === MegaLLM Configuration ===
# Lấy API key tại: https://megallm.io
MEGALLM_API_KEY=sk-your-megallm-api-key-here
MEGALLM_BASE_URL=https://ai.megallm.io/v1
MEGALLM_DEFAULT_MODEL=deepseek-r1-distill-llama-70b

# === pfSense Configuration ===
PFSENSE_HOST=10.10.10.254
PFSENSE_PORT=8080
PFSENSE_API_KEY=your-pfsense-api-key
PFSENSE_ALIAS=AI_Blocked_IP

# === Whitelist IPs ===
WHITELIST_IPS=${server_ip},10.10.10.254,172.16.16.20

# === Telegram Bot (Optional) ===
# TELEGRAM_BOT_TOKEN=your-bot-token
# TELEGRAM_CHAT_ID=your-chat-id

# === Timezone ===
TZ=Asia/Ho_Chi_Minh
EOF

    print_success "File .env đã được tạo"
    print_warning "Nhớ cập nhật API keys trong file .env sau khi cài xong!"
}

fix_env_files() {
    print_step "SỬA CÁC FILE ENVIRONMENT"
    
    # Xóa NODE_ENV từ các file .env (Vite không cần)
    for envfile in .env .env.local .env.production .env.development .env.example; do
        if [[ -f "$envfile" ]]; then
            if grep -q "^NODE_ENV" "$envfile" 2>/dev/null; then
                sed -i '/^NODE_ENV/d' "$envfile"
                print_info "Đã xóa NODE_ENV khỏi $envfile"
            fi
        fi
    done
    
    print_success "Đã fix environment files"
}

build_and_start() {
    print_step "BUILD VÀ KHỞI ĐỘNG"
    
    print_info "Đang build Docker images... (có thể mất 5-10 phút)"
    docker compose build --no-cache
    print_success "Build thành công"
    
    print_info "Đang khởi động containers..."
    docker compose up -d
    
    print_info "Đợi services khởi động..."
    sleep 15
    
    print_success "Containers đã khởi động"
}

check_health() {
    print_step "KIỂM TRA SERVICES"
    
    local all_ok=true
    
    echo -n "  Frontend (8080):  "
    if curl -sS --max-time 5 "http://localhost:8080/" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}○ Đang khởi động...${NC}"
        all_ok=false
    fi
    
    echo -n "  Backend (3001):   "
    if curl -sS --max-time 5 "http://localhost:3001/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}○ Đang khởi động...${NC}"
        all_ok=false
    fi
    
    echo -n "  AI Engine (8000): "
    if curl -sS --max-time 5 "http://localhost:8000/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${YELLOW}○ Đang khởi động...${NC}"
        all_ok=false
    fi
    
    if [[ "$all_ok" == true ]]; then
        print_success "Tất cả services đang hoạt động"
    else
        print_warning "Một số services đang khởi động, đợi 30s rồi kiểm tra lại"
    fi
}

show_firewall_info() {
    print_step "THÔNG TIN FIREWALL"
    
    if ! command -v ufw &> /dev/null; then
        print_info "UFW không được cài đặt"
        return
    fi
    
    local status=$(sudo ufw status 2>/dev/null | head -1)
    
    if [[ "$status" == *"inactive"* ]]; then
        print_info "UFW đang inactive. Để mở firewall:"
        echo ""
        echo "  sudo ufw allow 22/tcp    # SSH"
        echo "  sudo ufw allow 8080/tcp  # Frontend"
        echo "  sudo ufw allow 3001/tcp  # Backend API"
        echo "  sudo ufw allow 3002/tcp  # WebSocket"
        echo "  sudo ufw allow 8000/tcp  # AI Engine"
        echo "  sudo ufw enable"
    else
        print_info "UFW đang active"
    fi
}

print_completion() {
    local server_ip=$(detect_server_ip)
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              CÀI ĐẶT HOÀN TẤT THÀNH CÔNG!                     ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}📍 TRUY CẬP:${NC}"
    echo -e "   Dashboard:   ${GREEN}http://${server_ip}:8080${NC}"
    echo -e "   Backend:     ${GREEN}http://${server_ip}:3001${NC}"
    echo -e "   AI Engine:   ${GREEN}http://${server_ip}:8000${NC}"
    echo ""
    echo -e "${CYAN}📁 THƯ MỤC CÀI ĐẶT:${NC}"
    echo -e "   ${YELLOW}$INSTALL_DIR/$PROJECT_DIR${NC}"
    echo ""
    echo -e "${CYAN}⚙️  CẤU HÌNH:${NC}"
    echo -e "   File .env:   ${YELLOW}$INSTALL_DIR/$PROJECT_DIR/.env${NC}"
    echo ""
    echo -e "${CYAN}🔧 CÁC LỆNH THƯỜNG DÙNG:${NC}"
    echo -e "   Xem logs:    ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose logs -f${NC}"
    echo -e "   Restart:     ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose restart${NC}"
    echo -e "   Stop:        ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose down${NC}"
    echo -e "   Status:      ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose ps${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  QUAN TRỌNG:${NC}"
    echo -e "   1. Cập nhật API keys trong file .env:"
    echo -e "      ${YELLOW}nano $INSTALL_DIR/$PROJECT_DIR/.env${NC}"
    echo ""
    echo -e "   2. Sau khi đổi .env, rebuild frontend:"
    echo -e "      ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose up -d --build soc-frontend${NC}"
    echo ""
}

# ==================== HELP ====================

show_help() {
    echo ""
    echo "SOC Dashboard Installation Script v${SCRIPT_VERSION}"
    echo ""
    echo "Cách sử dụng:"
    echo "  ./install.sh              Cài đặt mới (hoặc reinstall nếu đã có)"
    echo "  ./install.sh --uninstall  Gỡ cài đặt (chỉ xóa files, giữ packages)"
    echo "  ./install.sh --status     Kiểm tra trạng thái hệ thống"
    echo "  ./install.sh --help       Hiển thị help này"
    echo ""
    echo "Tính năng:"
    echo "  • Kiểm tra packages (Docker, Git, curl) - cài nếu chưa có, skip nếu có rồi"
    echo "  • Kiểm tra cài đặt cũ - hỏi xác nhận trước khi xóa"
    echo "  • Chỉ xóa FILES khi reinstall/uninstall, KHÔNG xóa packages"
    echo "  • Tự động detect IP server"
    echo "  • Tự động tạo file .env với cấu hình chuẩn"
    echo ""
    echo "Thư mục cài đặt: $INSTALL_DIR/$PROJECT_DIR"
    echo ""
}

# ==================== MAIN ====================

main() {
    print_banner
    
    check_not_root
    
    print_info "Bắt đầu cài đặt SOC Dashboard..."
    print_info "Thư mục cài đặt: $INSTALL_DIR"
    echo ""
    
    # Prerequisites (chỉ cài nếu chưa có)
    ensure_curl
    ensure_git
    ensure_docker
    
    # Dọn dẹp cài đặt cũ nếu có
    clean_for_reinstall
    
    # Cài đặt mới
    clone_repository
    configure_environment
    fix_env_files
    build_and_start
    
    # Kiểm tra
    check_health
    show_firewall_info
    
    # Hoàn tất
    print_completion
}

# ==================== ENTRY POINT ====================

case "${1:-}" in
    --help|-h)
        show_help
        ;;
    --status|-s)
        print_banner
        show_system_status
        ;;
    --uninstall|-u)
        print_banner
        check_not_root
        uninstall_files_only
        ;;
    *)
        main
        ;;
esac
