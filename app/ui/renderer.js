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

// ============ SCAN PAGE ============

// --- Upload Extension ---
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--accent)'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.style.borderColor = ''; if (e.dataTransfer.files.length) analyzeExtension(e.dataTransfer.files[0].path); });
fileInput.addEventListener('change', () => { if (fileInput.files.length) analyzeExtension(fileInput.files[0].path); });

async function analyzeExtension(filePath) {
    const resultSection = document.getElementById('static-result-section');
    const result = document.getElementById('static-result');
    const dynamicSection = document.getElementById('dynamic-test-section');

    resultSection.classList.remove('hidden');
    result.innerHTML = '<div style="text-align: center; padding: 20px;">⏳ Analyzing...</div>';

    const response = await window.api.analyzeExtension(filePath);

    if (response.success) {
        const data = response.data;
        const riskClass = data.riskScore > 70 ? 'risk-high' : data.riskScore > 40 ? 'risk-medium' : 'risk-low';

        result.innerHTML = `
            <div class="result-header">
                <span class="result-name">${escapeHtml(data.name || 'Unknown Extension')}</span>
                <span class="risk-badge ${riskClass}">Risk: ${data.riskScore}/100</span>
            </div>
            <div class="result-details">
                <div class="result-item">
                    <span class="value">${data.permissions?.length || 0}</span>
                    <span class="label">Permissions</span>
                </div>
                <div class="result-item">
                    <span class="value">${data.suspiciousPatterns?.length || 0}</span>
                    <span class="label">Suspicious Patterns</span>
                </div>
                <div class="result-item">
                    <span class="value">${data.version || 'N/A'}</span>
                    <span class="label">Version</span>
                </div>
            </div>
            ${data.permissions?.length > 0 ? `
                <div style="margin-top: 16px;">
                    <strong style="font-size: 12px; color: var(--text-dim);">Permissions:</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                        ${data.permissions.map(p => `<span style="background: var(--bg-hover); padding: 4px 8px; border-radius: 4px; font-size: 11px;">${escapeHtml(p)}</span>`).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        // Show dynamic testing section
        dynamicSection.classList.remove('hidden');
        loadScriptOptions();
    } else {
        result.innerHTML = `<div style="color: var(--danger); padding: 20px;">Error: ${response.error}</div>`;
    }
}

// --- Load script options for dropdown ---
async function loadScriptOptions() {
    const select = document.getElementById('script-select');
    const templates = await window.api.getAutomationTemplates();
    const savedScripts = JSON.parse(localStorage.getItem('customScripts') || '[]');

    select.innerHTML = '<option value="">-- Manual Testing (No Script) --</option>';

    // Add built-in templates
    select.innerHTML += '<optgroup label="Built-in Templates">';
    templates.forEach(t => {
        select.innerHTML += `<option value="builtin:${t.id}">${t.name}</option>`;
    });
    select.innerHTML += '</optgroup>';

    // Add custom scripts
    if (savedScripts.length > 0) {
        select.innerHTML += '<optgroup label="My Custom Scripts">';
        savedScripts.forEach((s, i) => {
            select.innerHTML += `<option value="custom:${i}">${s.name || 'Untitled'}</option>`;
        });
        select.innerHTML += '</optgroup>';
    }
}

// --- Browser Testing ---
const startBtn = document.getElementById('start-test-btn');
const stopBtn = document.getElementById('stop-test-btn');
const exportHarBtn = document.getElementById('export-har-btn');
const realtimeSection = document.getElementById('realtime-section');
let statusInterval = null;
let currentLiveTab = 'network';
let liveData = { network: [], dom: [], api: [], automation: [] };

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    const result = await window.api.startTesting({});

    if (result.success) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        exportHarBtn.classList.remove('hidden');
        realtimeSection.classList.remove('hidden');

        // Reset live data
        liveData = { network: [], dom: [], api: [], automation: [] };
        document.getElementById('live-data-panel').innerHTML = '<div class="live-empty">Waiting for activity...</div>';

        statusInterval = setInterval(updateRealtimeData, 500);

        // Run selected script if any
        const scriptSelect = document.getElementById('script-select');
        const useCredentials = document.getElementById('use-credentials').checked;

        if (scriptSelect.value) {
            runSelectedScript(scriptSelect.value, useCredentials);
        }
    } else {
        alert('Failed to start: ' + result.error);
    }

    startBtn.disabled = false;
    startBtn.textContent = '▶ Start Browser Testing';
});

stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';

    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    const result = await window.api.stopTesting();

    stopBtn.classList.add('hidden');
    exportHarBtn.classList.add('hidden');
    startBtn.classList.remove('hidden');
    stopBtn.disabled = false;
    stopBtn.textContent = '⏹ Stop & Generate Report';

    if (result.success) {
        alert(`Report Generated!\n\nRequests: ${result.data.stats?.totalRequests || 0}\nAPI Calls: ${result.data.stats?.extensionActivities || 0}\nDOM Events: ${result.data.stats?.domEvents || 0}\nThreats: ${result.data.suspiciousActivities?.length || 0}`);
        document.querySelector('[data-tab="reports"]').click();
    }
});

exportHarBtn.addEventListener('click', async () => {
    const result = await window.api.exportHAR();
    if (result.success) alert(`HAR exported to:\n${result.path}`);
});

async function runSelectedScript(value, useCredentials) {
    const [type, id] = value.split(':');
    let script;

    if (type === 'builtin') {
        const templates = await window.api.getAutomationTemplates();
        script = templates.find(t => t.id === id);
    } else {
        const savedScripts = JSON.parse(localStorage.getItem('customScripts') || '[]');
        script = savedScripts[parseInt(id)];
    }

    if (script) {
        await window.api.runAutomation(script, { useTestCredentials: useCredentials });
    }
}

// --- Realtime Data Updates ---
async function updateRealtimeData() {
    const stats = await window.api.getRealTimeStats();
    if (!stats) return;

    // Update stats
    document.getElementById('stat-requests').textContent = stats.requests || 0;
    document.getElementById('stat-activities').textContent = stats.activities || 0;
    document.getElementById('stat-dom').textContent = stats.domEvents || 0;
    document.getElementById('stat-duration').textContent = stats.duration + 's';

    // Threats
    const threats = (stats.criticalEvents || 0) + (stats.highEvents || 0);
    document.getElementById('stat-threats').textContent = threats;

    if (threats > 0) {
        document.getElementById('threat-box').classList.add('threat');
        updateThreatAlerts(stats);
    }

    // Update live data arrays
    if (stats.recentNetworkEvents?.length) {
        stats.recentNetworkEvents.forEach(e => {
            if (!liveData.network.find(n => n.timestamp === e.timestamp)) {
                liveData.network.unshift(e);
            }
        });
        liveData.network = liveData.network.slice(0, 100);
    }

    if (stats.recentDOMEvents?.length) {
        stats.recentDOMEvents.forEach(e => {
            if (!liveData.dom.find(d => d.timestamp === e.timestamp)) {
                liveData.dom.unshift(e);
            }
        });
        liveData.dom = liveData.dom.slice(0, 100);
    }

    renderLivePanel();
}

function updateThreatAlerts(stats) {
    const alertsDiv = document.getElementById('threat-alerts');
    const listDiv = document.getElementById('threat-list');

    if (stats.criticalEvents > 0 || stats.highEvents > 0) {
        alertsDiv.classList.remove('hidden');

        const threats = liveData.dom.filter(e => e.severity === 'critical' || e.severity === 'high');
        listDiv.innerHTML = threats.slice(0, 5).map(t => `
            <div class="threat-item">
                <span class="threat-type">[${t.severity.toUpperCase()}]</span> ${t.type} - ${escapeHtml((t.url || '').substring(0, 50))}
            </div>
        `).join('');
    }
}

function renderLivePanel() {
    const panel = document.getElementById('live-data-panel');
    const data = liveData[currentLiveTab];

    if (!data || data.length === 0) {
        panel.innerHTML = '<div class="live-empty">No data yet...</div>';
        return;
    }

    panel.innerHTML = data.slice(0, 50).map(item => {
        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';

        if (currentLiveTab === 'network') {
            return `<div class="live-item">
                <span class="time">${time}</span>
                <span class="type network">${item.method || 'GET'}</span>
                <span class="detail">${escapeHtml((item.url || '').substring(0, 100))}</span>
            </div>`;
        } else if (currentLiveTab === 'dom') {
            return `<div class="live-item">
                <span class="time">${time}</span>
                <span class="type ${item.severity || ''}">${item.type || 'event'}</span>
                <span class="detail">${escapeHtml((item.url || '').substring(0, 80))}</span>
            </div>`;
        } else if (currentLiveTab === 'automation') {
            return `<div class="live-item">
                <span class="time">${time}</span>
                <span class="type">${item.type || 'log'}</span>
                <span class="detail">${escapeHtml(item.message || '')}</span>
            </div>`;
        }
        return '';
    }).join('');
}

// Live data tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLiveTab = btn.dataset.live;
        renderLivePanel();
    });
});

// Automation logs
window.api.onAutomationLog((entry) => {
    liveData.automation.unshift({ ...entry, timestamp: new Date().toISOString() });
    liveData.automation = liveData.automation.slice(0, 100);
    if (currentLiveTab === 'automation') renderLivePanel();
});

// ============ SCRIPTS PAGE ============
let savedScripts = [];
let currentScriptIndex = null;

function loadScripts() {
    savedScripts = JSON.parse(localStorage.getItem('customScripts') || '[]');
    renderScriptsList();
}

function renderScriptsList() {
    const list = document.getElementById('scripts-list');

    if (savedScripts.length === 0) {
        list.innerHTML = '<div style="color: var(--text-dim); padding: 12px; font-size: 12px;">No scripts yet</div>';
    } else {
        list.innerHTML = savedScripts.map((s, i) => `
            <div class="script-item ${currentScriptIndex === i ? 'active' : ''}" data-index="${i}">
                ${escapeHtml(s.name || 'Untitled')}
            </div>
        `).join('');

        list.querySelectorAll('.script-item').forEach(item => {
            item.addEventListener('click', () => {
                currentScriptIndex = parseInt(item.dataset.index);
                const script = savedScripts[currentScriptIndex];
                document.getElementById('script-name').value = script.name || '';
                document.getElementById('script-editor').value = JSON.stringify(script, null, 2);
                renderScriptsList();
            });
        });
    }
}

document.getElementById('new-script-btn').addEventListener('click', () => {
    currentScriptIndex = null;
    document.getElementById('script-name').value = '';
    document.getElementById('script-editor').value = `{
  "name": "New Script",
  "actions": [
    { "type": "navigate", "url": "https://example.com" },
    { "type": "wait", "duration": 2000 }
  ]
}`;
    renderScriptsList();
});

document.getElementById('save-script-btn').addEventListener('click', () => {
    try {
        const script = JSON.parse(document.getElementById('script-editor').value);
        script.name = document.getElementById('script-name').value || script.name || 'Untitled';

        if (currentScriptIndex !== null) {
            savedScripts[currentScriptIndex] = script;
        } else {
            savedScripts.push(script);
            currentScriptIndex = savedScripts.length - 1;
        }

        localStorage.setItem('customScripts', JSON.stringify(savedScripts));
        renderScriptsList();
        alert('Script saved!');
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
});

document.getElementById('delete-script-btn').addEventListener('click', () => {
    if (currentScriptIndex !== null && confirm('Delete this script?')) {
        savedScripts.splice(currentScriptIndex, 1);
        localStorage.setItem('customScripts', JSON.stringify(savedScripts));
        currentScriptIndex = null;
        document.getElementById('script-name').value = '';
        document.getElementById('script-editor').value = '';
        renderScriptsList();
    }
});

// ============ CREDENTIALS PAGE ============
async function loadCredentials() {
    const creds = await window.api.getCredentials();

    document.getElementById('default-email').value = creds.default?.email || '';
    document.getElementById('default-username').value = creds.default?.username || '';
    document.getElementById('default-password').value = creds.default?.password || '';

    const siteList = document.getElementById('site-list');
    const sites = creds.sites || {};

    if (Object.keys(sites).length === 0) {
        siteList.innerHTML = '<div style="color: var(--text-dim); padding: 12px; font-size: 12px;">No site credentials saved</div>';
    } else {
        siteList.innerHTML = Object.entries(sites).map(([site, data]) => `
            <div class="site-item">
                <div>
                    <span class="site-name">${escapeHtml(site)}</span>
                    <span class="site-email">${escapeHtml(data.email || data.username || '')}</span>
                </div>
                <button class="btn btn-sm btn-danger" onclick="removeSite('${site}')">🗑️</button>
            </div>
        `).join('');
    }
}

document.getElementById('save-default-btn').addEventListener('click', async () => {
    await window.api.setDefaultCredentials({
        email: document.getElementById('default-email').value,
        username: document.getElementById('default-username').value,
        password: document.getElementById('default-password').value
    });
    alert('Default credentials saved!');
});

document.getElementById('add-site-btn').addEventListener('click', async () => {
    const site = document.getElementById('site-name').value.toLowerCase().trim();
    if (!site) { alert('Please enter a site name'); return; }

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

window.removeSite = async function (site) {
    if (confirm(`Remove ${site}?`)) {
        await window.api.removeSiteCredentials(site);
        loadCredentials();
    }
};

document.getElementById('import-creds-btn').addEventListener('click', async () => {
    const result = await window.api.importCredentials();
    if (result.success) { alert(`Imported ${result.count} credentials!`); loadCredentials(); }
});

document.getElementById('export-creds-btn').addEventListener('click', async () => {
    const result = await window.api.exportCredentials();
    if (result.success) alert(`Exported to: ${result.path}`);
});

document.getElementById('clear-creds-btn').addEventListener('click', async () => {
    if (confirm('Clear ALL credentials?')) {
        await window.api.clearCredentials();
        loadCredentials();
    }
});

// ============ REPORTS PAGE ============
async function loadReports() {
    const result = await window.api.getReports();
    const list = document.getElementById('reports-list');
    const detail = document.getElementById('report-detail');

    detail.classList.add('hidden');
    list.classList.remove('hidden');

    if (!result.success || !result.data.length) {
        list.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 40px;">No reports yet. Complete a scan to generate reports.</div>';
        return;
    }

    list.innerHTML = result.data.map(r => `
        <div class="report-card" onclick="openReport('${r.id}')">
            <h4>${escapeHtml(r.name)}</h4>
            <div class="report-meta">${new Date(r.date).toLocaleString()}</div>
            <div class="report-stats">
                <span>📊 ${r.requests || 0}</span>
                <span>🧩 ${r.activities || 0}</span>
                <span>⚠️ ${r.suspicious || 0}</span>
            </div>
        </div>
    `).join('');
}

window.openReport = async function (id) {
    const result = await window.api.openReport(id);
    if (!result.success) return;

    const report = result.data;
    const list = document.getElementById('reports-list');
    const detail = document.getElementById('report-detail');

    list.classList.add('hidden');
    detail.classList.remove('hidden');

    detail.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <div>
                <h2>${escapeHtml(report.name)}</h2>
                <div style="color: var(--text-dim); font-size: 12px;">${new Date(report.startTime).toLocaleString()} • ${Math.round(report.duration)}s</div>
            </div>
            <div>
                <button class="btn btn-secondary" onclick="exportReport('${report.id}')">📤 Export</button>
                <button class="btn btn-secondary" onclick="closeReport()">← Back</button>
            </div>
        </div>
        
        <div class="realtime-stats" style="margin-bottom: 20px;">
            <div class="stat-box"><span class="stat-value">${report.stats?.totalRequests || 0}</span><span class="stat-label">Requests</span></div>
            <div class="stat-box"><span class="stat-value">${report.stats?.extensionActivities || 0}</span><span class="stat-label">API Calls</span></div>
            <div class="stat-box"><span class="stat-value">${report.stats?.domEvents || 0}</span><span class="stat-label">DOM Events</span></div>
            <div class="stat-box threat"><span class="stat-value">${report.suspiciousActivities?.length || 0}</span><span class="stat-label">Threats</span></div>
        </div>
        
        ${report.suspiciousActivities?.length ? `
            <div class="threat-alerts" style="margin-bottom: 16px;">
                <h4>⚠️ Suspicious Activities</h4>
                ${report.suspiciousActivities.map(a => `
                    <div class="threat-item"><span class="threat-type">${a.type}</span> - ${escapeHtml(a.description || a.url || '')}</div>
                `).join('')}
            </div>
        ` : ''}
    `;
};

window.closeReport = function () {
    document.getElementById('report-detail').classList.add('hidden');
    document.getElementById('reports-list').classList.remove('hidden');
};

window.exportReport = async function (id) {
    const result = await window.api.exportReport(id);
    if (result.success) alert(`Exported to: ${result.path}`);
};

// ============ UTILITIES ============
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

// ============ INIT ============
loadScripts();
loadScriptOptions(); // Load script dropdown on page load

