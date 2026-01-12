// ============ TAB NAVIGATION ============
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${tab}-tab`).classList.add('active');

        if (tab === 'reports') loadReports();
        if (tab === 'credentials') loadCredentials();
        if (tab === 'scripts') loadScripts();
    });
});

// ============ UPLOAD & ANALYSIS ============
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const analysisResult = document.getElementById('analysis-result');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.style.borderColor = ''; if (e.dataTransfer.files.length) analyzeExtension(e.dataTransfer.files[0].path); });
fileInput.addEventListener('change', () => { if (fileInput.files.length) analyzeExtension(fileInput.files[0].path); });

async function analyzeExtension(filePath) {
    analysisResult.innerHTML = '<div class="result-placeholder">⏳ Analyzing...</div>';

    const response = await window.api.analyzeExtension(filePath);

    if (response.success) {
        const data = response.data;
        const riskColor = data.riskScore > 70 ? 'var(--danger)' : data.riskScore > 40 ? 'var(--warning)' : 'var(--success)';

        analysisResult.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <strong style="font-size: 16px;">${escapeHtml(data.name || 'Unknown')}</strong>
                <span style="background: ${riskColor}; padding: 6px 14px; border-radius: 20px; color: white; font-size: 12px; font-weight: 600;">
                    Risk: ${data.riskScore}/100
                </span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                <div style="background: var(--bg-input); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 700; color: var(--primary);">${data.permissions?.length || 0}</div>
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Permissions</div>
                </div>
                <div style="background: var(--bg-input); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 700; color: var(--warning);">${data.suspiciousPatterns?.length || 0}</div>
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Suspicious</div>
                </div>
                <div style="background: var(--bg-input); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--text);">${data.version || 'N/A'}</div>
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Version</div>
                </div>
            </div>
        `;
    } else {
        analysisResult.innerHTML = `<div class="result-placeholder" style="color: var(--danger);">Error: ${response.error}</div>`;
    }
}

// ============ TESTING CONTROLS ============
const startBtn = document.getElementById('start-test-btn');
const stopBtn = document.getElementById('stop-test-btn');
const exportHarBtn = document.getElementById('export-har-btn');
const statsBar = document.getElementById('stats-bar');
const livePanel = document.getElementById('live-panel');
const liveFeed = document.getElementById('live-feed');
const testStatusBadge = document.getElementById('test-status-badge');
const appStatus = document.getElementById('app-status');
const useAutomation = document.getElementById('use-automation');
const automationSettings = document.getElementById('automation-settings');
let statusInterval = null;
let currentLiveTab = 'network';
let liveData = { network: [], dom: [], api: [], automation: [] };
let allCredentials = { default: {}, sites: {} };

// Toggle automation checkbox
useAutomation?.addEventListener('change', () => {
    if (useAutomation.checked) {
        automationSettings?.classList.remove('hidden');
    } else {
        automationSettings?.classList.add('hidden');
    }
});

// Load credentials for quick copy
async function loadCredentialsForCopy() {
    allCredentials = await window.api.getCredentials();
    const select = document.getElementById('cred-site-select');
    if (!select) return;

    select.innerHTML = '<option value="default">Default</option>';
    Object.keys(allCredentials.sites || {}).forEach(site => {
        select.innerHTML += `<option value="${site}">${site}</option>`;
    });
}

// Copy email button
document.getElementById('copy-email-btn')?.addEventListener('click', async () => {
    const site = document.getElementById('cred-site-select').value;
    const creds = site === 'default' ? allCredentials.default : allCredentials.sites[site];
    const email = creds?.email || creds?.username || '';

    if (email) {
        await navigator.clipboard.writeText(email);
        alert(`Email copied: ${email}`);
    } else {
        alert('No email/username found. Set credentials in Credentials page.');
    }
});

// Copy password button
document.getElementById('copy-pass-btn')?.addEventListener('click', async () => {
    const site = document.getElementById('cred-site-select').value;
    const creds = site === 'default' ? allCredentials.default : allCredentials.sites[site];
    const pass = creds?.password || '';

    if (pass) {
        await navigator.clipboard.writeText(pass);
        alert('Password copied to clipboard!');
    } else {
        alert('No password found. Set credentials in Credentials page.');
    }
});

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Starting...</span>';

    const result = await window.api.startTesting({});

    if (result.success) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        exportHarBtn.classList.remove('hidden');
        statsBar.classList.remove('hidden');
        livePanel.classList.remove('hidden');

        testStatusBadge.textContent = 'Recording';
        testStatusBadge.classList.add('badge-primary');
        appStatus.innerHTML = '<span class="status-dot" style="background: var(--danger);"></span><span>Recording</span>';

        liveData = { network: [], dom: [], api: [], automation: [] };
        liveFeed.innerHTML = '<div class="feed-empty">Waiting for activity...</div>';

        statusInterval = setInterval(updateStats, 500);

        // Run automation if enabled
        if (useAutomation?.checked) {
            const script = document.getElementById('script-select').value;
            if (script) runScript(script, true);
        }
    } else {
        alert('Failed: ' + result.error);
    }

    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶</span><span>Start Testing</span>';
});

stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    if (statusInterval) clearInterval(statusInterval);

    const result = await window.api.stopTesting();

    stopBtn.classList.add('hidden');
    exportHarBtn.classList.add('hidden');
    startBtn.classList.remove('hidden');
    stopBtn.disabled = false;

    testStatusBadge.textContent = 'Ready';
    appStatus.innerHTML = '<span class="status-dot"></span><span>Ready</span>';

    if (result.success) {
        alert(`Report Generated!\n\nRequests: ${result.data.stats?.totalRequests || 0}\nAPI Calls: ${result.data.stats?.extensionActivities || 0}\nThreats: ${result.data.suspiciousActivities?.length || 0}`);
        document.querySelector('[data-tab="reports"]').click();
    }
});

exportHarBtn.addEventListener('click', async () => {
    const result = await window.api.exportHAR();
    if (result.success) alert('HAR exported: ' + result.path);
});

async function runScript(value, useCreds) {
    const [type, id] = value.split(':');
    let script;

    if (type === 'builtin') {
        const templates = await window.api.getAutomationTemplates();
        script = templates.find(t => t.id === id);
    } else {
        const saved = JSON.parse(localStorage.getItem('customScripts') || '[]');
        script = saved[parseInt(id)];
    }

    if (script) await window.api.runAutomation(script, { useTestCredentials: useCreds });
}

async function updateStats() {
    const stats = await window.api.getRealTimeStats();
    if (!stats) return;

    document.getElementById('stat-requests').textContent = stats.requests || 0;
    document.getElementById('stat-activities').textContent = stats.activities || 0;
    document.getElementById('stat-dom').textContent = stats.domEvents || 0;
    document.getElementById('stat-threats').textContent = (stats.criticalEvents || 0) + (stats.highEvents || 0);
    document.getElementById('stat-duration').textContent = stats.duration + 's';

    // Update live feed - Network
    if (stats.recentNetworkEvents?.length) {
        stats.recentNetworkEvents.forEach(e => {
            if (!liveData.network.find(n => n.timestamp === e.timestamp)) {
                liveData.network.unshift(e);
            }
        });
    }

    // Update live feed - DOM
    if (stats.recentDOMEvents?.length) {
        stats.recentDOMEvents.forEach(e => {
            if (!liveData.dom.find(d => d.timestamp === e.timestamp)) {
                liveData.dom.unshift(e);
            }
        });
    }

    // Update live feed - Extension API calls
    if (stats.recentExtensionEvents?.length) {
        stats.recentExtensionEvents.forEach(e => {
            if (!liveData.api.find(a => a.timestamp === e.timestamp && a.apiName === e.apiName)) {
                liveData.api.unshift(e);
            }
        });
    }

    liveData.network = liveData.network.slice(0, 200);
    liveData.dom = liveData.dom.slice(0, 100);
    liveData.api = liveData.api.slice(0, 100);
    renderRequestList();
}

// Store full request/response data
let fullRequestData = new Map();
let selectedRequestId = null;

function renderRequestList() {
    const requestList = document.getElementById('request-list');
    if (!requestList) return;

    // For network tab, show Burp-style list
    if (currentLiveTab === 'network') {
        const data = liveData.network;
        if (!data?.length) {
            requestList.innerHTML = '<div class="feed-empty">Waiting for requests...</div>';
            return;
        }

        requestList.innerHTML = data.slice(0, 100).map((item, index) => {
            const statusClass = item.status >= 400 ? 'error' : item.status >= 300 ? 'redirect' : 'ok';
            const size = item.bodyLength ? formatSize(item.bodyLength) : '-';
            const id = item.id || `req-${index}`;

            // Store full data
            fullRequestData.set(id, item);

            return `
                <div class="request-row ${selectedRequestId === id ? 'selected' : ''}" data-id="${id}">
                    <span class="method ${item.method || 'GET'}">${item.method || 'GET'}</span>
                    <span class="url">${escapeHtml((item.url || '').substring(0, 80))}</span>
                    <span class="status ${statusClass}">${item.status || '-'}</span>
                    <span class="size">${size}</span>
                </div>
            `;
        }).join('');

        // Add click handlers
        requestList.querySelectorAll('.request-row').forEach(row => {
            row.addEventListener('click', () => {
                selectedRequestId = row.dataset.id;
                requestList.querySelectorAll('.request-row').forEach(r => r.classList.remove('selected'));
                row.classList.add('selected');
                showRequestDetail(fullRequestData.get(selectedRequestId));
            });
        });
    } else {
        // For other tabs, show simple list
        const data = liveData[currentLiveTab];
        if (!data?.length) {
            requestList.innerHTML = '<div class="feed-empty">No activity yet...</div>';
            return;
        }

        requestList.innerHTML = data.slice(0, 50).map(item => {
            const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';

            if (currentLiveTab === 'dom') {
                return `<div class="request-row"><span class="method ${item.severity}">${item.type}</span><span class="url">${escapeHtml((item.url || '').substring(0, 80))}</span><span class="status">${item.severity}</span><span class="size">${time}</span></div>`;
            } else if (currentLiveTab === 'api') {
                return `<div class="request-row"><span class="method api">${escapeHtml((item.apiName || 'API').substring(0, 20))}</span><span class="url">${escapeHtml((item.pageUrl || item.details || '').substring(0, 60))}</span><span class="status">-</span><span class="size">${time}</span></div>`;
            } else if (currentLiveTab === 'automation') {
                return `<div class="request-row"><span class="method">${item.type || 'log'}</span><span class="url">${escapeHtml(item.message || '')}</span><span class="status">-</span><span class="size">${time}</span></div>`;
            }
            return '';
        }).join('');
    }
}

function showRequestDetail(item) {
    if (!item) return;

    const requestDetail = document.getElementById('request-detail');
    const responseDetail = document.getElementById('response-detail');

    // Request Details
    let requestHeaders = '';
    if (item.headers) {
        requestHeaders = Object.entries(item.headers)
            .map(([k, v]) => `<div class="header-item"><span class="header-name">${escapeHtml(k)}:</span><span class="header-val">${escapeHtml(String(v))}</span></div>`)
            .join('');
    }

    const postData = item.postData || '';
    const postDataFormatted = tryFormatJson(postData);

    requestDetail.innerHTML = `
        <div class="detail-block">
            <div class="detail-label">Request Line</div>
            <div class="detail-value">${item.method || 'GET'} ${escapeHtml(item.url || '')} HTTP/1.1</div>
        </div>
        ${requestHeaders ? `
        <div class="detail-block">
            <div class="detail-label">Headers</div>
            <div class="detail-value">${requestHeaders}</div>
        </div>` : ''}
        ${postData ? `
        <div class="detail-block">
            <div class="detail-label">Request Body</div>
            <div class="detail-value ${postDataFormatted.isJson ? 'json' : ''}">${escapeHtml(postDataFormatted.text)}</div>
        </div>` : '<div class="detail-block"><div class="detail-label">Request Body</div><div class="detail-value">(No body)</div></div>'}
    `;

    // Response Details
    let responseHeaders = '';
    if (item.responseHeaders) {
        responseHeaders = Object.entries(item.responseHeaders)
            .map(([k, v]) => `<div class="header-item"><span class="header-name">${escapeHtml(k)}:</span><span class="header-val">${escapeHtml(String(v))}</span></div>`)
            .join('');
    }

    const responseBody = item.body || '';
    const responseFormatted = tryFormatJson(responseBody);

    responseDetail.innerHTML = `
        <div class="detail-block">
            <div class="detail-label">Status</div>
            <div class="detail-value ${item.status >= 400 ? 'error' : ''}">${item.status || '-'} ${item.statusText || ''}</div>
        </div>
        ${responseHeaders ? `
        <div class="detail-block">
            <div class="detail-label">Response Headers</div>
            <div class="detail-value">${responseHeaders}</div>
        </div>` : ''}
        ${responseBody ? `
        <div class="detail-block">
            <div class="detail-label">Response Body</div>
            <div class="detail-value ${responseFormatted.isJson ? 'json' : ''}">${escapeHtml(responseFormatted.text.substring(0, 5000))}</div>
        </div>` : '<div class="detail-block"><div class="detail-label">Response Body</div><div class="detail-value">(No body captured)</div></div>'}
    `;
}

function tryFormatJson(text) {
    if (!text) return { text: '', isJson: false };
    try {
        const parsed = JSON.parse(text);
        return { text: JSON.stringify(parsed, null, 2), isJson: true };
    } catch (e) {
        return { text: String(text), isJson: false };
    }
}

function formatSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

// Live tabs
document.querySelectorAll('.live-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.live-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentLiveTab = tab.dataset.live;
        selectedRequestId = null;
        document.getElementById('request-detail').innerHTML = '<div class="detail-empty">Select a request to view details</div>';
        document.getElementById('response-detail').innerHTML = '<div class="detail-empty">Select a request to view response</div>';
        renderRequestList();
    });
});

// Detail tabs (Request/Response toggle)
document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.detail-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.detail}-detail`).classList.add('active');
    });
});

// Clear history
document.getElementById('clear-history-btn')?.addEventListener('click', () => {
    liveData = { network: [], dom: [], api: [], automation: [] };
    fullRequestData.clear();
    selectedRequestId = null;
    renderRequestList();
    document.getElementById('request-detail').innerHTML = '<div class="detail-empty">Select a request to view details</div>';
    document.getElementById('response-detail').innerHTML = '<div class="detail-empty">Select a request to view response</div>';
});

// Automation logs
window.api.onAutomationLog?.(entry => {
    liveData.automation.unshift({ ...entry, timestamp: new Date().toISOString() });
});

// ============ LOAD SCRIPTS DROPDOWN ============
async function loadScriptOptions() {
    const select = document.getElementById('script-select');
    if (!select) return;

    const templates = await window.api.getAutomationTemplates();
    const saved = JSON.parse(localStorage.getItem('customScripts') || '[]');

    // Start with placeholder
    select.innerHTML = '<option value="">Select a script...</option>';

    // My Scripts first (priority)
    if (saved.length > 0) {
        select.innerHTML += '<optgroup label="✨ My Scripts">';
        saved.forEach((s, i) => {
            select.innerHTML += `<option value="custom:${i}">${s.name || 'Untitled'}</option>`;
        });
        select.innerHTML += '</optgroup>';
    }

    // Only 2 essential built-in templates
    const essentialTemplates = ['browse-sites', 'login-test'];
    select.innerHTML += '<optgroup label="📦 Built-in">';
    templates.filter(t => essentialTemplates.includes(t.id)).forEach(t => {
        select.innerHTML += `<option value="builtin:${t.id}">${t.name}</option>`;
    });
    select.innerHTML += '</optgroup>';
}

// ============ SCRIPTS PAGE ============
let savedScripts = [];
let currentScriptIndex = null;

function loadScripts() {
    savedScripts = JSON.parse(localStorage.getItem('customScripts') || '[]');
    const list = document.getElementById('scripts-list');

    list.innerHTML = savedScripts.length ? savedScripts.map((s, i) => `
        <div class="script-item ${currentScriptIndex === i ? 'active' : ''}" data-index="${i}">${escapeHtml(s.name || 'Untitled')}</div>
    `).join('') : '<div style="color: var(--text-muted); padding: 20px; text-align: center;">No scripts yet</div>';

    list.querySelectorAll('.script-item').forEach(item => {
        item.addEventListener('click', () => {
            currentScriptIndex = parseInt(item.dataset.index);
            const script = savedScripts[currentScriptIndex];
            document.getElementById('script-name').value = script.name || '';
            document.getElementById('script-editor').value = JSON.stringify(script, null, 2);
            loadScripts();
        });
    });
}

document.getElementById('new-script-btn')?.addEventListener('click', () => {
    currentScriptIndex = null;
    document.getElementById('script-name').value = '';
    document.getElementById('script-editor').value = '{\n  "name": "New Script",\n  "actions": []\n}';
    loadScripts();
});

document.getElementById('save-script-btn')?.addEventListener('click', () => {
    try {
        const script = JSON.parse(document.getElementById('script-editor').value);
        script.name = document.getElementById('script-name').value || script.name || 'Untitled';

        if (currentScriptIndex !== null) savedScripts[currentScriptIndex] = script;
        else { savedScripts.push(script); currentScriptIndex = savedScripts.length - 1; }

        localStorage.setItem('customScripts', JSON.stringify(savedScripts));
        loadScripts();
        loadScriptOptions();
        alert('Saved!');
    } catch (e) { alert('Invalid JSON: ' + e.message); }
});

document.getElementById('delete-script-btn')?.addEventListener('click', () => {
    if (currentScriptIndex !== null && confirm('Delete?')) {
        savedScripts.splice(currentScriptIndex, 1);
        localStorage.setItem('customScripts', JSON.stringify(savedScripts));
        currentScriptIndex = null;
        document.getElementById('script-name').value = '';
        document.getElementById('script-editor').value = '';
        loadScripts();
        loadScriptOptions();
    }
});

// Example scripts
const EXAMPLE_SCRIPTS = {
    login: {
        name: "Login Test",
        description: "Test login on Facebook",
        actions: [
            { type: "navigate", url: "https://www.facebook.com/login" },
            { type: "wait", duration: 2000 },
            { type: "login", description: "Fill login form with saved credentials" },
            { type: "wait", duration: 3000 }
        ]
    },
    browse: {
        name: "Browse Sites",
        description: "Visit popular sites to trigger extension",
        actions: [
            { type: "navigate", url: "https://www.google.com" },
            { type: "wait", duration: 2000 },
            { type: "type", selector: "textarea[name='q']", text: "test search" },
            { type: "press", key: "Enter" },
            { type: "wait", duration: 3000 },
            { type: "navigate", url: "https://www.github.com" },
            { type: "wait", duration: 2000 },
            { type: "scroll", distance: 500 }
        ]
    },
    form: {
        name: "Fill Form Test",
        description: "Fill out a test form",
        actions: [
            { type: "navigate", url: "https://example.com/form" },
            { type: "wait", duration: 2000 },
            { type: "type", selector: "#name", text: "Test User" },
            { type: "type", selector: "#email", text: "test@example.com" },
            { type: "type", selector: "#message", text: "This is a test message" },
            { type: "click", selector: "#submit" },
            { type: "wait", duration: 2000 }
        ]
    }
};

document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const example = EXAMPLE_SCRIPTS[btn.dataset.example];
        if (example) {
            currentScriptIndex = null;
            document.getElementById('script-name').value = example.name;
            document.getElementById('script-editor').value = JSON.stringify(example, null, 2);
            loadScripts();
        }
    });
});

// ============ CREDENTIALS ============
async function loadCredentials() {
    const creds = await window.api.getCredentials();

    document.getElementById('default-email').value = creds.default?.email || '';
    document.getElementById('default-username').value = creds.default?.username || '';
    document.getElementById('default-password').value = creds.default?.password || '';

    const list = document.getElementById('site-list');
    const sites = creds.sites || {};

    list.innerHTML = Object.keys(sites).length ? Object.entries(sites).map(([site, data]) => `
        <div class="site-item">
            <span><strong style="color: var(--primary);">${escapeHtml(site)}</strong> <span style="color: var(--text-muted); margin-left: 8px;">${escapeHtml(data.email || '')}</span></span>
            <div style="display: flex; gap: 6px;">
                <button class="btn-outline" style="padding: 6px 10px; font-size: 11px;" onclick="editSite('${site}', '${escapeHtml(data.email || '')}', '${escapeHtml(data.password || '')}')">✏️ Edit</button>
                <button class="btn-danger" style="padding: 6px 10px; font-size: 11px;" onclick="removeSite('${site}')">🗑️</button>
            </div>
        </div>
    `).join('') : '<div style="color: var(--text-muted); padding: 12px;">No sites saved</div>';
}

document.getElementById('save-default-btn')?.addEventListener('click', async () => {
    await window.api.setDefaultCredentials({
        email: document.getElementById('default-email').value,
        username: document.getElementById('default-username').value,
        password: document.getElementById('default-password').value
    });
    alert('Saved!');
});

document.getElementById('add-site-btn')?.addEventListener('click', async () => {
    const site = document.getElementById('site-name').value.toLowerCase().trim();
    if (!site) return alert('Enter site name');

    await window.api.setSiteCredentials({
        site,
        email: document.getElementById('site-email').value,
        password: document.getElementById('site-password').value
    });

    document.getElementById('site-name').value = '';
    document.getElementById('site-email').value = '';
    document.getElementById('site-password').value = '';
    loadCredentials();
});

window.removeSite = async site => {
    if (confirm(`Remove ${site}?`)) {
        await window.api.removeSiteCredentials(site);
        loadCredentials();
    }
};

window.editSite = (site, email, password) => {
    // Fill the add form with existing values for editing
    document.getElementById('site-name').value = site;
    document.getElementById('site-email').value = email;
    document.getElementById('site-password').value = password;

    // Scroll to the add form
    document.querySelector('.add-site-row')?.scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('import-creds-btn')?.addEventListener('click', async () => {
    const r = await window.api.importCredentials();
    if (r.success) { alert(`Imported ${r.count}`); loadCredentials(); }
});

document.getElementById('export-creds-btn')?.addEventListener('click', async () => {
    const r = await window.api.exportCredentials();
    if (r.success) alert('Exported: ' + r.path);
});

document.getElementById('clear-creds-btn')?.addEventListener('click', async () => {
    if (confirm('Clear ALL?')) { await window.api.clearCredentials(); loadCredentials(); }
});

// ============ REPORTS ============
async function loadReports() {
    const result = await window.api.getReports();
    const list = document.getElementById('reports-list');

    list.innerHTML = result.success && result.data.length ? result.data.map(r => `
        <div class="report-card" onclick="openReport('${r.id}')">
            <h4>${escapeHtml(r.name)}</h4>
            <div style="font-size: 12px; color: var(--text-muted);">${new Date(r.date).toLocaleString()}</div>
            <div style="display: flex; gap: 8px; margin-top: 12px; font-size: 11px;">
                <span style="background: var(--bg-input); padding: 4px 8px; border-radius: 4px;">📊 ${r.requests || 0}</span>
                <span style="background: var(--bg-input); padding: 4px 8px; border-radius: 4px;">⚠️ ${r.suspicious || 0}</span>
            </div>
        </div>
    `).join('') : '<div style="color: var(--text-muted); padding: 40px; text-align: center;">No reports yet</div>';
}

window.openReport = async id => {
    const r = await window.api.openReport(id);
    if (!r.success) return;

    const report = r.data;
    document.getElementById('reports-list').classList.add('hidden');
    const detail = document.getElementById('report-detail');
    detail.classList.remove('hidden');

    detail.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
            <div>
                <h2>${escapeHtml(report.name)}</h2>
                <div style="color: var(--text-muted);">${new Date(report.startTime).toLocaleString()} • ${Math.round(report.duration)}s</div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-outline" onclick="document.getElementById('report-detail').classList.add('hidden'); document.getElementById('reports-list').classList.remove('hidden');">← Back</button>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
            <div class="stat-item" style="background: var(--bg-panel); padding: 20px; border-radius: 8px; text-align: center;">
                <div class="stat-num">${report.stats?.totalRequests || 0}</div><div class="stat-name">Requests</div>
            </div>
            <div class="stat-item" style="background: var(--bg-panel); padding: 20px; border-radius: 8px; text-align: center;">
                <div class="stat-num">${report.stats?.extensionActivities || 0}</div><div class="stat-name">API Calls</div>
            </div>
            <div class="stat-item" style="background: var(--bg-panel); padding: 20px; border-radius: 8px; text-align: center;">
                <div class="stat-num">${report.stats?.domEvents || 0}</div><div class="stat-name">DOM</div>
            </div>
            <div class="stat-item stat-danger" style="background: var(--bg-panel); padding: 20px; border-radius: 8px; text-align: center;">
                <div class="stat-num">${report.suspiciousActivities?.length || 0}</div><div class="stat-name">Threats</div>
            </div>
        </div>
    `;
};

// ============ UTILS ============
function escapeHtml(s) { return s ? String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]) : ''; }

// ============ INIT ============
loadScriptOptions();
loadScripts();
loadCredentialsForCopy();

