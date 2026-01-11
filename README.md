# Chrome Monitor 🔍

A standalone desktop application for analyzing Chrome extensions, monitoring browser activity, and detecting malicious behavior.

---

## 🚀 Quick Start

### Windows
```
Double-click start.bat
```

### Linux
```bash
./start.sh
```

---

## 📱 Features

### 1️⃣ Analyze Extension
- Upload `.crx` or `.zip` files
- See risk score and security analysis
- View permissions and suspicious code patterns

### 2️⃣ Browser Testing  
- Click **Start Testing** to launch Chrome with activity logging
- All extension API calls and network requests are recorded
- Real-time stats: Network, API Calls, DOM Events, Duration
- Click **Stop** to generate a detailed report

### 3️⃣ Automation 🤖

**Templates Available:**

| Template | Purpose |
|----------|---------|
| 🌐 **Browse Popular Sites** | Google, GitHub, Amazon, Facebook, Twitter |
| 🛒 **Shopping Flow** | Amazon, eBay product searches |
| 🔐 **Login Pages Test** | Facebook, GitHub, Twitter, Instagram logins |
| 🏦 **Banking Sites Test** | PayPal, Chase, Bank of America |
| 💰 **Crypto Sites Test** | Coinbase, Binance, MetaMask |
| 📧 **Google Login Test** | Google step-by-step login |
| 🛒 **Amazon Login Test** | Amazon login flow |
| 🛡️ **Full Security Test** | Complete: social + banking + crypto |

### 4️⃣ Test Credentials 🔐

Use your own test accounts for security testing:

1. Click **⚙️ Manage** to open credentials manager
2. Add site-specific credentials (facebook, google, etc.)
3. Or **Import JSON** with your credentials file
4. Enable **"Use Test Credentials"** checkbox
5. Run login automation templates

**Credentials File Format:**
```json
{
  "default": {
    "email": "default@email.com",
    "password": "password"
  },
  "sites": {
    "facebook": { "email": "fb@email.com", "password": "fbpass" },
    "google": { "email": "google@email.com", "password": "gpass" }
  }
}
```

Edit: `app/data/test-credentials.json`

### 5️⃣ DOM Monitoring 🎭

Detects malicious DOM manipulations:

| Event | Severity | Description |
|-------|----------|-------------|
| `script_injected` | 🔴 Critical | Script tags added to page |
| `form_action_changed` | 🔴 Critical | Form action URL modified |
| `keylogger_suspect` | 🔴 Critical | Keydown/keyup listeners added |
| `iframe_injected` | 🟠 High | iFrame tags added |
| `cookie_read/write` | 🟠 High | Cookie access detected |
| `form_submit_listener` | 🟠 High | Submit event intercepted |
| `storage_write` | 🟡 Medium | localStorage modified |
| `link_href_changed` | 🟡 Medium | Link URLs changed |

### 6️⃣ Reports 📊
- View network requests with bodies
- See extension API activities
- DOM events and manipulations
- Suspicious activities highlighted
- Export reports as JSON

---

## 🔧 How It Works

### Extension Activity Capture
```
Chrome launched with --enable-extension-activity-logging
         ↓
Activity stored in SQLite database
         ↓
App polls database every 2 seconds
         ↓
All API calls captured in report
```

### Network Monitoring (CDP)
```
Puppeteer connects to Chrome
         ↓
Network.enable + Fetch.enable
         ↓
Captures requests with bodies
         ↓
Captures responses with bodies
         ↓
Detects sensitive data transfers
```

### DOM Monitoring
```
dom-monitor.js injected into pages
         ↓
MutationObserver watches DOM
         ↓
API hooks (addEventListener, fetch, cookies)
         ↓
Events sent to main process
         ↓
Suspicious patterns detected
```

---

## 📁 Project Structure

```
chromeMonitoring/
├── start.sh / start.bat
├── README.md
├── credentials-template.json    # Sample credentials
└── app/
    ├── package.json
    ├── main.js             # Electron main process
    ├── preload.js          # IPC bridge
    ├── analyzer.js         # CRX static analysis
    ├── monitor.js          # Browser monitoring
    ├── automation.js       # Automation engine
    ├── activity-reader.js  # SQLite reader
    ├── dom-monitor.js      # DOM change detector
    ├── test-credentials.js # Credentials manager
    ├── data/
    │   └── test-credentials.json  # Your credentials
    └── ui/
        ├── index.html
        ├── styles.css
        └── renderer.js
```

---

## 📋 Requirements

- **Node.js 18+**
- **Google Chrome**

---

## 🔧 Build Executable

```bash
cd app
npm install
npm run build:linux   # .AppImage / .deb
npm run build:win     # .exe installer
```

---

## 🛡️ Detection Capabilities

| Threat Type | Detection Method |
|-------------|------------------|
| Credential Stealers | Form hijacking, keylogger detection |
| Data Exfiltration | Network requests with sensitive data |
| Cookie Thieves | Cookie access monitoring |
| Crypto Stealers | Suspicious crypto site activity |
| Search Hijackers | Form action changes |
| Ad Injectors | Script/iframe injection |
| Redirectors | Link href modifications |
| Phishing Overlays | Overlay element detection |

---

## License

MIT
