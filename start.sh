#!/bin/bash
# Chrome Monitor - Desktop Application Launcher
# Auto-installs Node.js and Chrome if needed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║        Chrome Monitor - Starting       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if running as root/sudo
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        echo "[!] This script needs admin rights to install dependencies."
        echo "[!] Please run with: sudo ./start.sh"
        echo ""
        exit 1
    fi
}

# Install Node.js
install_nodejs() {
    echo "[*] Installing Node.js 20..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        apt-get update
        apt-get install -y ca-certificates curl gnupg
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
        apt-get update
        apt-get install -y nodejs
    elif command -v dnf &> /dev/null; then
        # Fedora/RHEL
        dnf install -y nodejs
    elif command -v yum &> /dev/null; then
        # CentOS
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    elif command -v pacman &> /dev/null; then
        # Arch
        pacman -Sy --noconfirm nodejs npm
    else
        echo "[!] Could not detect package manager. Please install Node.js manually."
        exit 1
    fi
}

# Install Chrome
install_chrome() {
    echo "[*] Installing Google Chrome..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
        apt-get install -y /tmp/chrome.deb || apt-get install -f -y
        rm -f /tmp/chrome.deb
    elif command -v dnf &> /dev/null; then
        # Fedora
        dnf install -y https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
    elif command -v yum &> /dev/null; then
        # CentOS
        wget -q -O /tmp/chrome.rpm https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
        yum install -y /tmp/chrome.rpm
        rm -f /tmp/chrome.rpm
    elif command -v pacman &> /dev/null; then
        # Arch - use chromium
        pacman -Sy --noconfirm chromium
    else
        echo "[!] Could not install Chrome. Please install manually."
        exit 1
    fi
}

# Check Node.js
if ! command -v node &> /dev/null; then
    check_sudo
    install_nodejs
fi

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "[OK] Node.js $NODE_VERSION"
else
    echo "[!] Node.js installation failed"
    exit 1
fi

# Check Chrome
CHROME_OK=false
for cmd in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v $cmd &> /dev/null; then
        CHROME_OK=true
        CHROME_CMD=$cmd
        break
    fi
done

if [ "$CHROME_OK" = false ]; then
    check_sudo
    install_chrome
    
    # Check again
    for cmd in google-chrome google-chrome-stable chromium chromium-browser; do
        if command -v $cmd &> /dev/null; then
            CHROME_OK=true
            CHROME_CMD=$cmd
            break
        fi
    done
fi

if [ "$CHROME_OK" = true ]; then
    echo "[OK] Chrome ($CHROME_CMD)"
else
    echo "[!] Chrome installation failed"
    exit 1
fi

# Install app dependencies
echo "[*] Installing app dependencies..."
cd "$APP_DIR"

# Run npm install as regular user if we're root
if [ "$EUID" -eq 0 ] && [ -n "$SUDO_USER" ]; then
    sudo -u "$SUDO_USER" npm install
else
    npm install
fi

echo "[OK] Dependencies installed"
echo ""
echo "Starting Chrome Monitor..."
echo ""

# Run the app as regular user if we're root
if [ "$EUID" -eq 0 ] && [ -n "$SUDO_USER" ]; then
    sudo -u "$SUDO_USER" npm start
else
    npm start
fi
