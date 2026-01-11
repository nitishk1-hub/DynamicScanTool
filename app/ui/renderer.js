// ============ TAB NAVIGATION ============
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`${tab}-tab`).classList.add('active');

        // Load data for specific tabs
        if (tab === 'reports') loadReports();
        if (tab === 'settings') {
            loadCredentials();
            loadSavedScripts();
        }
    });
});

// ============ EXTENSION ANALYSIS ============
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const analysisResult = document.getElementById('analysis-result');

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--accent)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '';
});

uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    if (e.dataTransfer.files.length > 0) {
        analyzeFile(e.dataTransfer.files[0].path);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        analyzeFile(fileInput.files[0].path);
    }
});

async function analyzeFile(filePath) {
    analysisResult.classList.remove('hidden');
    analysisResult.innerHTML = '<div class="spinner"></div> Analyzing...';

    const result = await window.api.analyzeExtension(filePath);

    if (result.success) {
        displayAnalysisResult(result.data);
    } else {
        analysisResult.innerHTML = `<div style="color: var(--danger)">Error: ${result.error}</div>`;
    }
}

function displayAnalysisResult(data) {
    const riskColor = data.riskScore > 70 ? 'var(--danger)' : data.riskScore > 40 ? 'var(--warning)' : 'var(--success)';

    analysisResult.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong>${data.name || 'Unknown Extension'}</strong>
            <span style="background: ${riskColor}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px;">
                Risk: ${data.riskScore}/100
            </span>
        </div>
        <div style="font-size: 12px; color: var(--text-dim);">
            <div>Version: ${data.version || 'N/A'}</div>
            <div>Permissions: ${data.permissions?.length || 0}</div>
            <div>Suspicious Patterns: ${data.suspiciousPatterns?.length || 0}</div>
        </div>
    `;
}

// ============ BROWSER TESTING ============
const startBtn = document.getElementById('start-test-btn');
const stopBtn = document.getElementById('stop-test-btn');
const exportHarBtn = document.getElementById('export-har-btn');
const sessionStatus = document.getElementById('session-status');
const threatIndicators = document.getElementById('threat-indicators');
const liveFeed = document.getElementById('live-feed');
let statusInterval = null;
let lastEventCount = 0;

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    const result = await window.api.startTesting({});

    if (result.success) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        exportHarBtn.classList.remove('hidden');
        threatIndicators.classList.remove('hidden');
        sessionStatus.innerHTML = `<div class="status-indicator active"></div><span>🔴 Recording Activity</span>`;
        liveFeed.innerHTML = '<div class="feed-empty">Waiting for activity...</div>';
        lastEventCount = 0;
        statusInterval = setInterval(updateRealTimeStats, 500);
    } else {
        alert('Failed to start: ' + result.error);
        startBtn.disabled = false;
        startBtn.textContent = '▶ Start';
    }
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
    startBtn.disabled = false;
    startBtn.textContent = '▶ Start';
    stopBtn.disabled = false;
    stopBtn.textContent = '⏹ Stop';

    sessionStatus.innerHTML = `<div class="status-indicator inactive"></div><span>Not Running</span>`;
    threatIndicators.classList.add('hidden');

    document.getElementById('stat-requests').textContent = '0';
    document.getElementById('stat-activities').textContent = '0';
    document.getElementById('stat-dom').textContent = '0';
    document.getElementById('stat-duration').textContent = '0s';

    if (result.success) {
        const data = result.data;
        alert(`Report Generated!\n\n📊 Requests: ${data.stats.totalRequests}\n🧩 API Calls: ${data.stats.extensionActivities}\n🎭 DOM: ${data.stats.domEvents || 0}\n📸 Screenshots: ${data.stats.screenshots || 0}`);
        document.querySelector('[data-tab="reports"]').click();
    }
});

exportHarBtn.addEventListener('click', async () => {
    const result = await window.api.exportHAR();
    if (result.success) {
        alert(`HAR exported to:\n${result.path}`);
    }
});

async function updateRealTimeStats() {
    const stats = await window.api.getRealTimeStats();
    if (!stats) return;

    document.getElementById('stat-requests').textContent = stats.requests || 0;
    document.getElementById('stat-activities').textContent = stats.activities || 0;
    document.getElementById('stat-dom').textContent = stats.domEvents || 0;
    document.getElementById('stat-duration').textContent = stats.duration + 's';

    document.getElementById('critical-count').textContent = stats.criticalEvents || 0;
    document.getElementById('high-count').textContent = stats.highEvents || 0;
    document.getElementById('ext-count').textContent = stats.extensionRequests || 0;
    document.getElementById('screenshot-count').textContent = stats.screenshots || 0;

    if (stats.criticalEvents > 0) {
        document.getElementById('threat-critical').style.background = 'rgba(255, 107, 107, 0.2)';
    }
    if (stats.highEvents > 0) {
        document.getElementById('threat-high').style.background = 'rgba(255, 169, 77, 0.2)';
    }

    const totalEvents = stats.requests + stats.domEvents;
    if (totalEvents > lastEventCount) {
        updateLiveFeed(stats);
        lastEventCount = totalEvents;
    }
}

function updateLiveFeed(stats) {
    if (liveFeed.querySelector('.feed-empty')) {
        liveFeed.innerHTML = '';
    }

    if (stats.recentNetworkEvents?.length > 0) {
        const latest = stats.recentNetworkEvents[0];
        addFeedItem('network', latest.method || 'REQ', latest.url, latest.timestamp);
    }

    if (stats.recentDOMEvents?.length > 0) {
        const latest = stats.recentDOMEvents[0];
        addFeedItem(latest.severity || 'dom', latest.type, latest.url, latest.timestamp);
    }

    while (liveFeed.children.length > 50) {
        liveFeed.removeChild(liveFeed.lastChild);
    }
}

function addFeedItem(type, label, url, timestamp) {
    const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
        <span class="feed-time">${time}</span>
        <span class="feed-type ${type}">${escapeHtml(label || '')}</span>
        <span class="feed-url">${escapeHtml(url || '')}</span>
    `;
    liveFeed.insertBefore(item, liveFeed.firstChild);
}

// ============ AUTOMATION TEMPLATES ============
const templateList = document.getElementById('template-list');
const automationStatus = document.getElementById('automation-status');
const automationLogs = document.getElementById('automation-logs');
const stopAutomationBtn = document.getElementById('stop-automation-btn');

async function loadAutomationTemplates() {
    const templates = await window.api.getAutomationTemplates();

    templateList.innerHTML = templates.map(t => `
        <div class="template-item" data-id="${t.id}">
            <span class="template-icon">${getTemplateIcon(t.id)}</span>
            ${t.name.split(' ').slice(0, 2).join(' ')}
        </div>
    `).join('');

    templateList.querySelectorAll('.template-item').forEach(item => {
        item.addEventListener('click', () => runTemplate(item.dataset.id, templates));
    });
}

function getTemplateIcon(id) {
    const icons = {
        'browse-popular': '🌐',
        'shopping': '🛒',
        'login-test': '🔐',
        'banking': '🏦',
        'crypto': '💰',
        'google-login': '📧',
        'amazon-login': '🛒',
        'full-security': '🛡️'
    };
    return icons[id] || '🤖';
}

async function runTemplate(id, templates) {
    const template = templates.find(t => t.id === id);
    if (!template) return;

    automationStatus.classList.remove('hidden');
    automationLogs.innerHTML = '';

    const result = await window.api.runAutomation(template, { useTestCredentials: true });

    automationStatus.classList.add('hidden');

    if (!result.success) {
        addAutomationLog('Error: ' + result.error, 'error');
    }
}

stopAutomationBtn.addEventListener('click', async () => {
    await window.api.stopAutomation();
    automationStatus.classList.add('hidden');
    addAutomationLog('Automation stopped by user', 'warning');
});

window.api.onAutomationLog((entry) => {
    addAutomationLog(entry.message, entry.type);
});

function addAutomationLog(message, type = 'info') {
    if (automationLogs.querySelector('.log-empty')) {
        automationLogs.innerHTML = '';
    }

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    automationLogs.appendChild(entry);
    automationLogs.scrollTop = automationLogs.scrollHeight;
}

// ============ CUSTOM SCRIPTS ============
let savedScripts = [];
let currentScriptId = null;

async function loadSavedScripts() {
    try {
        const result = await window.api.getCredentials();
        savedScripts = result.scripts || [];
    } catch (e) {
        savedScripts = JSON.parse(localStorage.getItem('customScripts') || '[]');
    }
    renderScriptList();
}

function renderScriptList() {
    const list = document.getElementById('script-list');
    list.innerHTML = `
        <div class="script-item new-script" id="new-script-btn">
            <span>➕ New Script</span>
        </div>
        ${savedScripts.map((s, i) => `
            <div class="script-item ${currentScriptId === i ? 'active' : ''}" data-index="${i}">
                ${s.name || 'Untitled'}
            </div>
        `).join('')}
    `;

    document.getElementById('new-script-btn').addEventListener('click', () => {
        currentScriptId = null;
        document.getElementById('script-name').value = '';
        document.getElementById('script-editor').value = `{
  "name": "My Script",
  "description": "",
  "actions": [
    { "type": "navigate", "url": "https://example.com" },
    { "type": "wait", "duration": 2000 }
  ]
}`;
        renderScriptList();
    });

    list.querySelectorAll('.script-item:not(.new-script)').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            currentScriptId = index;
            const script = savedScripts[index];
            document.getElementById('script-name').value = script.name || '';
            document.getElementById('script-editor').value = JSON.stringify(script, null, 2);
            renderScriptList();
        });
    });
}

document.getElementById('save-script-btn').addEventListener('click', () => {
    try {
        const script = JSON.parse(document.getElementById('script-editor').value);
        script.name = document.getElementById('script-name').value || script.name || 'Untitled';

        if (currentScriptId !== null) {
            savedScripts[currentScriptId] = script;
        } else {
            savedScripts.push(script);
            currentScriptId = savedScripts.length - 1;
        }

        localStorage.setItem('customScripts', JSON.stringify(savedScripts));
        renderScriptList();
        alert('Script saved!');
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
});

document.getElementById('run-script-btn').addEventListener('click', async () => {
    try {
        const script = JSON.parse(document.getElementById('script-editor').value);
        automationStatus.classList.remove('hidden');
        automationLogs.innerHTML = '';

        const result = await window.api.runAutomation(script, { useTestCredentials: true });

        automationStatus.classList.add('hidden');
        if (!result.success) {
            alert('Error: ' + result.error);
        }
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
});

document.getElementById('delete-script-btn').addEventListener('click', () => {
    if (currentScriptId !== null && confirm('Delete this script?')) {
        savedScripts.splice(currentScriptId, 1);
        currentScriptId = null;
        localStorage.setItem('customScripts', JSON.stringify(savedScripts));
        document.getElementById('script-name').value = '';
        document.getElementById('script-editor').value = '';
        renderScriptList();
    }
});

// ============ CREDENTIALS MANAGEMENT ============
async function loadCredentials() {
    const creds = await window.api.getCredentials();

    // Default credentials
    document.getElementById('default-email').value = creds.default?.email || '';
    document.getElementById('default-username').value = creds.default?.username || '';
    document.getElementById('default-password').value = creds.default?.password || '';

    // Site credentials
    const siteList = document.getElementById('site-cred-list');
    const sites = creds.sites || {};

    if (Object.keys(sites).length === 0) {
        siteList.innerHTML = '<div style="color: var(--text-dim); padding: 10px; font-size: 12px;">No site credentials saved</div>';
    } else {
        siteList.innerHTML = Object.entries(sites).map(([site, data]) => `
            <div class="site-cred-item">
                <div>
                    <span class="site-name">${site}</span>
                    <span class="site-email">${data.email || data.username || ''}</span>
                </div>
                <button class="btn btn-sm btn-danger" onclick="removeSiteCred('${site}')">🗑️</button>
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
    const email = document.getElementById('site-email').value;
    const password = document.getElementById('site-password').value;

    if (!site) {
        alert('Please enter a site name');
        return;
    }

    await window.api.setSiteCredentials({ site, email, password });

    document.getElementById('site-name').value = '';
    document.getElementById('site-email').value = '';
    document.getElementById('site-password').value = '';

    loadCredentials();
    alert(`Credentials for ${site} saved!`);
});

window.removeSiteCred = async function (site) {
    if (confirm(`Remove credentials for ${site}?`)) {
        await window.api.removeSiteCredentials(site);
        loadCredentials();
    }
};

document.getElementById('import-creds-btn').addEventListener('click', async () => {
    const result = await window.api.importCredentials();
    if (result.success) {
        alert(`Imported ${result.count} site credentials!`);
        loadCredentials();
    }
});

document.getElementById('export-creds-btn').addEventListener('click', async () => {
    const result = await window.api.exportCredentials();
    if (result.success) {
        alert(`Exported to: ${result.path}`);
    }
});

document.getElementById('clear-creds-btn').addEventListener('click', async () => {
    if (confirm('Clear ALL credentials? This cannot be undone.')) {
        await window.api.clearCredentials();
        loadCredentials();
        alert('All credentials cleared.');
    }
});

// ============ REPORTS ============
async function loadReports() {
    const result = await window.api.getReports();
    const reportsList = document.getElementById('reports-list');
    const reportDetail = document.getElementById('report-detail');

    reportDetail.classList.add('hidden');

    if (!result.success || result.data.length === 0) {
        reportsList.innerHTML = '<div style="color: var(--text-dim); padding: 20px; text-align: center;">No reports yet. Start a testing session to generate reports.</div>';
        return;
    }

    reportsList.innerHTML = result.data.map(report => `
        <div class="report-card" onclick="openReport('${report.id}')">
            <h4>${report.name}</h4>
            <div class="report-meta">${new Date(report.date).toLocaleString()}</div>
            <div class="report-stats">
                <span>📊 ${report.requests || 0} requests</span>
                <span>🧩 ${report.activities || 0} API</span>
                <span>⚠️ ${report.suspicious || 0} alerts</span>
            </div>
        </div>
    `).join('');
}

window.openReport = async function (id) {
    const result = await window.api.openReport(id);
    if (!result.success) return;

    const report = result.data;
    const reportDetail = document.getElementById('report-detail');
    const reportsList = document.getElementById('reports-list');

    reportsList.classList.add('hidden');
    reportDetail.classList.remove('hidden');

    reportDetail.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div>
                <h2>${report.name}</h2>
                <div style="color: var(--text-dim); font-size: 13px;">
                    ${new Date(report.startTime).toLocaleString()} - Duration: ${Math.round(report.duration)}s
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary" onclick="exportReport('${report.id}')">📤 Export</button>
                <button class="btn btn-secondary" onclick="closeReport()">← Back</button>
            </div>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 20px;">
            <div class="stat"><span class="stat-value">${report.stats?.totalRequests || 0}</span><span class="stat-label">Requests</span></div>
            <div class="stat"><span class="stat-value">${report.stats?.extensionActivities || 0}</span><span class="stat-label">API Calls</span></div>
            <div class="stat"><span class="stat-value">${report.stats?.domEvents || 0}</span><span class="stat-label">DOM Events</span></div>
            <div class="stat"><span class="stat-value">${report.suspiciousActivities?.length || 0}</span><span class="stat-label">Suspicious</span></div>
        </div>
        
        ${report.suspiciousActivities?.length > 0 ? `
            <div class="card" style="margin-bottom: 16px; border-color: var(--danger);">
                <h3 style="color: var(--danger);">⚠️ Suspicious Activities</h3>
                ${report.suspiciousActivities.map(a => `
                    <div style="padding: 8px; margin: 8px 0; background: var(--bg-dark); border-radius: 6px; font-size: 12px;">
                        <strong>${a.type}</strong>: ${a.description || a.url || 'Unknown'}
                    </div>
                `).join('')}
            </div>
        ` : ''}
        
        <details style="margin-bottom: 16px;">
            <summary style="cursor: pointer; padding: 10px; background: var(--bg-dark); border-radius: 6px;">Network Events (${report.networkEvents?.length || 0})</summary>
            <div style="max-height: 300px; overflow-y: auto; padding: 10px; font-size: 11px; font-family: monospace;">
                ${(report.networkEvents || []).slice(0, 100).map(e => `
                    <div style="padding: 4px 0; border-bottom: 1px solid var(--border);">
                        ${e.method || 'GET'} ${(e.url || '').substring(0, 80)}
                    </div>
                `).join('')}
            </div>
        </details>
        
        <details style="margin-bottom: 16px;">
            <summary style="cursor: pointer; padding: 10px; background: var(--bg-dark); border-radius: 6px;">DOM Events (${report.domEvents?.length || 0})</summary>
            <div style="max-height: 300px; overflow-y: auto; padding: 10px; font-size: 11px; font-family: monospace;">
                ${(report.domEvents || []).map(e => `
                    <div style="padding: 4px 0; border-bottom: 1px solid var(--border); color: ${e.severity === 'critical' ? 'var(--danger)' : e.severity === 'high' ? 'var(--warning)' : 'inherit'};">
                        [${e.severity}] ${e.type}: ${(e.url || '').substring(0, 60)}
                    </div>
                `).join('')}
            </div>
        </details>
    `;
};

window.closeReport = function () {
    document.getElementById('report-detail').classList.add('hidden');
    document.getElementById('reports-list').classList.remove('hidden');
};

window.exportReport = async function (id) {
    const result = await window.api.exportReport(id);
    if (result.success) {
        alert(`Report exported to: ${result.path}`);
    }
};

// ============ UTILITIES ============
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

// ============ INIT ============
loadAutomationTemplates();
loadSavedScripts();
