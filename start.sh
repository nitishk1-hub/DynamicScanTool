#!/bin/bash
# Chrome Monitor - Desktop Application Launcher

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║        Chrome Monitor - Starting       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[*] Installing Node.js..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
        sudo apt-get install -y nodejs >/dev/null 2>&1
    elif command -v dnf &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - >/dev/null 2>&1
        sudo dnf install -y nodejs >/dev/null 2>&1
    fi
fi
echo "[OK] Node.js"

# Check Chrome
CHROME_OK=false
for cmd in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v $cmd &> /dev/null; then
        CHROME_OK=true
        break
    fi
done

if [ "$CHROME_OK" = false ]; then
    echo "[*] Installing Chrome..."
    if command -v apt-get &> /dev/null; then
        wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
        sudo dpkg -i /tmp/chrome.deb >/dev/null 2>&1 || sudo apt-get install -f -y >/dev/null 2>&1
        rm /tmp/chrome.deb
    fi
fi
echo "[OK] Chrome"

# Install app dependencies
echo "[*] Installing dependencies..."
cd "$APP_DIR"
npm install --silent 2>/dev/null

echo "[OK] Ready"
echo ""
echo "Starting Chrome Monitor..."
echo ""

# Run the app
npm start
