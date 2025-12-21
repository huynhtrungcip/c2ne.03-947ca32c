#!/bin/bash

# ============================================================
# SOC Dashboard - One-Click Installation Script
# Author: C1NE.03 Team - Cybersecurity K28 - Duy Tan University
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/soc-dashboard"
REPO_URL="https://github.com/huynhtrungcip/insight-dashboard.git"
PROJECT_DIR="insight-dashboard"

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║     SOC Dashboard - False Positive Reduction System          ║"
    echo "║     One-Click Installation Script v1.0                       ║"
    echo "║     C1NE.03 Team - Cybersecurity K28 - Duy Tan University    ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Print step
print_step() {
    echo -e "\n${BLUE}[STEP]${NC} $1"
}

# Print success
print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

# Print warning
print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Print error
print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Print info
print_info() {
    echo -e "${CYAN}[i]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "Do not run this script as root!"
        print_info "Run as normal user, script will use sudo when needed."
        exit 1
    fi
}

# Detect server IP
detect_server_ip() {
    # Try to get IP from default route interface
    SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
    
    # Fallback: get first non-loopback IP
    if [[ -z "$SERVER_IP" ]]; then
        SERVER_IP=$(hostname -I | awk '{print $1}')
    fi
    
    # Last fallback
    if [[ -z "$SERVER_IP" ]]; then
        SERVER_IP="localhost"
    fi
    
    echo "$SERVER_IP"
}

# Check and install Docker
install_docker() {
    print_step "Checking Docker installation..."
    
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
        print_success "Docker already installed: v${DOCKER_VERSION}"
    else
        print_warning "Docker not found. Installing..."
        
        # Update package list
        sudo apt-get update -qq
        
        # Install dependencies
        sudo apt-get install -y -qq \
            apt-transport-https \
            ca-certificates \
            curl \
            gnupg \
            lsb-release
        
        # Add Docker GPG key
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        
        # Add Docker repository
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
            $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
            sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Install Docker
        sudo apt-get update -qq
        sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        print_success "Docker installed successfully"
    fi
    
    # Check Docker Compose plugin
    if docker compose version &> /dev/null; then
        COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "v2.x")
        print_success "Docker Compose plugin: ${COMPOSE_VERSION}"
    else
        print_error "Docker Compose plugin not found!"
        exit 1
    fi
    
    # Add user to docker group
    if ! groups | grep -q docker; then
        print_warning "Adding user to docker group..."
        sudo usermod -aG docker $USER
        print_info "You may need to log out and back in for group changes to take effect"
    fi
    
    # Start Docker service
    if ! systemctl is-active --quiet docker; then
        print_warning "Starting Docker service..."
        sudo systemctl start docker
        sudo systemctl enable docker
    fi
    print_success "Docker service is running"
}

# Check and install Git
install_git() {
    print_step "Checking Git installation..."
    
    if command -v git &> /dev/null; then
        GIT_VERSION=$(git --version | awk '{print $3}')
        print_success "Git already installed: v${GIT_VERSION}"
    else
        print_warning "Git not found. Installing..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq git
        print_success "Git installed successfully"
    fi
}

# Check and install curl
install_curl() {
    print_step "Checking curl installation..."
    
    if command -v curl &> /dev/null; then
        print_success "curl already installed"
    else
        print_warning "curl not found. Installing..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq curl
        print_success "curl installed successfully"
    fi
}

# Clean existing installation
clean_installation() {
    print_step "Checking existing installation..."
    
    if [[ -d "$INSTALL_DIR" ]]; then
        print_warning "Found existing installation at $INSTALL_DIR"
        
        # Stop running containers if any
        if [[ -d "$INSTALL_DIR/$PROJECT_DIR" ]]; then
            cd "$INSTALL_DIR/$PROJECT_DIR" 2>/dev/null || true
            if [[ -f "docker-compose.yml" ]]; then
                print_info "Stopping existing containers..."
                docker compose down --remove-orphans 2>/dev/null || true
            fi
        fi
        
        # Remove directory
        print_info "Removing existing directory..."
        sudo rm -rf "$INSTALL_DIR"
        print_success "Cleaned existing installation"
    else
        print_success "No existing installation found"
    fi
}

# Clone repository
clone_repository() {
    print_step "Cloning repository..."
    
    # Create installation directory
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown $USER:$USER "$INSTALL_DIR"
    
    cd "$INSTALL_DIR"
    
    # Clone repository
    git clone "$REPO_URL"
    
    if [[ -d "$PROJECT_DIR" ]]; then
        print_success "Repository cloned successfully"
        cd "$PROJECT_DIR"
    else
        print_error "Failed to clone repository!"
        exit 1
    fi
}

# Configure environment
configure_environment() {
    print_step "Configuring environment..."
    
    SERVER_IP=$(detect_server_ip)
    print_info "Detected server IP: $SERVER_IP"
    
    # Create .env file
    cat > .env << EOF
# ============================================================
# SOC Dashboard Configuration
# Generated by install.sh on $(date)
# Server IP: $SERVER_IP
# ============================================================

# === Frontend Access Port ===
FRONTEND_PORT=8080

# === API URLs (using server IP) ===
VITE_API_URL=http://${SERVER_IP}:3001
VITE_WS_URL=ws://${SERVER_IP}:3002
VITE_AI_URL=http://${SERVER_IP}:8000

# === MegaLLM Configuration ===
# Get API key from: https://megallm.io
MEGALLM_API_KEY=sk-your-megallm-api-key-here
MEGALLM_BASE_URL=https://ai.megallm.io/v1
MEGALLM_DEFAULT_MODEL=deepseek-r1-distill-llama-70b

# === pfSense Configuration ===
PFSENSE_HOST=10.10.10.254
PFSENSE_PORT=8080
PFSENSE_API_KEY=your-pfsense-api-key
PFSENSE_ALIAS=AI_Blocked_IP

# === Whitelist IPs (comma-separated) ===
WHITELIST_IPS=${SERVER_IP},10.10.10.254,172.16.16.20

# === Telegram Bot (Optional) ===
# TELEGRAM_BOT_TOKEN=your-bot-token
# TELEGRAM_CHAT_ID=your-chat-id

# === Timezone ===
TZ=Asia/Ho_Chi_Minh
EOF

    print_success "Environment file created: .env"
    print_warning "Remember to update API keys in .env file!"
}

# Remove NODE_ENV from any .env files (Vite doesn't need it)
fix_env_files() {
    print_step "Fixing environment files..."
    
    # Remove NODE_ENV from all .env* files
    for envfile in .env .env.local .env.production .env.development .env.example; do
        if [[ -f "$envfile" ]]; then
            if grep -q "^NODE_ENV" "$envfile" 2>/dev/null; then
                sed -i '/^NODE_ENV/d' "$envfile"
                print_info "Removed NODE_ENV from $envfile"
            fi
        fi
    done
    
    print_success "Environment files fixed"
}

# Build and start containers
build_and_start() {
    print_step "Building Docker images (this may take 5-10 minutes)..."
    
    # Build images
    docker compose build --no-cache
    
    print_success "Docker images built successfully"
    
    print_step "Starting containers..."
    
    # Start containers
    docker compose up -d
    
    # Wait for services to be ready
    print_info "Waiting for services to start..."
    sleep 10
    
    print_success "Containers started"
}

# Check services health
check_health() {
    print_step "Checking services health..."
    
    SERVER_IP=$(detect_server_ip)
    local all_healthy=true
    
    # Check Frontend
    echo -n "  Frontend (8080): "
    if curl -sS --max-time 5 "http://localhost:8080/" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${YELLOW}Starting...${NC}"
        all_healthy=false
    fi
    
    # Check Backend
    echo -n "  Backend (3001):  "
    if curl -sS --max-time 5 "http://localhost:3001/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${YELLOW}Starting...${NC}"
        all_healthy=false
    fi
    
    # Check AI Engine
    echo -n "  AI Engine (8000): "
    if curl -sS --max-time 5 "http://localhost:8000/health" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${YELLOW}Starting...${NC}"
        all_healthy=false
    fi
    
    if $all_healthy; then
        print_success "All services are healthy"
    else
        print_warning "Some services are still starting. Wait a moment and check again."
    fi
}

# Configure firewall
configure_firewall() {
    print_step "Configuring firewall (optional)..."
    
    # Check if ufw is installed
    if ! command -v ufw &> /dev/null; then
        print_info "UFW not installed, skipping firewall configuration"
        return
    fi
    
    # Check UFW status
    UFW_STATUS=$(sudo ufw status | head -1)
    
    if [[ "$UFW_STATUS" == *"inactive"* ]]; then
        print_info "UFW is inactive. To enable firewall, run:"
        echo ""
        echo "  sudo ufw allow 22/tcp    # SSH"
        echo "  sudo ufw allow 8080/tcp  # Frontend"
        echo "  sudo ufw allow 3001/tcp  # Backend API"
        echo "  sudo ufw allow 3002/tcp  # WebSocket"
        echo "  sudo ufw allow 8000/tcp  # AI Engine"
        echo "  sudo ufw enable"
        echo ""
    else
        print_success "UFW is active"
    fi
}

# Print completion message
print_completion() {
    SERVER_IP=$(detect_server_ip)
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              INSTALLATION COMPLETED SUCCESSFULLY!             ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Access URLs:${NC}"
    echo -e "  Dashboard:    ${GREEN}http://${SERVER_IP}:8080${NC}"
    echo -e "  Backend API:  ${GREEN}http://${SERVER_IP}:3001${NC}"
    echo -e "  AI Engine:    ${GREEN}http://${SERVER_IP}:8000${NC}"
    echo -e "  WebSocket:    ${GREEN}ws://${SERVER_IP}:3002${NC}"
    echo ""
    echo -e "${CYAN}Useful Commands:${NC}"
    echo -e "  View logs:        ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose logs -f${NC}"
    echo -e "  Restart:          ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose restart${NC}"
    echo -e "  Stop:             ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose down${NC}"
    echo -e "  Container status: ${YELLOW}docker compose ps${NC}"
    echo ""
    echo -e "${CYAN}Configuration:${NC}"
    echo -e "  Config file:  ${YELLOW}$INSTALL_DIR/$PROJECT_DIR/.env${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT:${NC} Update API keys in .env file:"
    echo -e "  ${YELLOW}nano $INSTALL_DIR/$PROJECT_DIR/.env${NC}"
    echo ""
    echo -e "${CYAN}After updating .env, rebuild frontend:${NC}"
    echo -e "  ${YELLOW}cd $INSTALL_DIR/$PROJECT_DIR && docker compose up -d --build soc-frontend${NC}"
    echo ""
}

# Main installation flow
main() {
    print_banner
    
    check_root
    
    print_info "Starting installation..."
    print_info "Installation directory: $INSTALL_DIR"
    echo ""
    
    # Prerequisites
    install_curl
    install_git
    install_docker
    
    # Clean and clone
    clean_installation
    clone_repository
    
    # Configure
    configure_environment
    fix_env_files
    
    # Build and run
    build_and_start
    
    # Verify
    check_health
    configure_firewall
    
    # Done
    print_completion
}

# Run main
main "$@"
