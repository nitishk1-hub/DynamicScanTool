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
let statusInterval = null;
let currentLiveTab = 'network';
let liveData = { network: [], dom: [], api: [], automation: [] };

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

        // Run selected script
        const script = document.getElementById('script-select').value;
        const useCreds = document.getElementById('use-credentials').checked;
        if (script) runScript(script, useCreds);
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

    // Update live feed
    if (stats.recentNetworkEvents?.length) {
        stats.recentNetworkEvents.forEach(e => {
            if (!liveData.network.find(n => n.timestamp === e.timestamp)) {
                liveData.network.unshift(e);
            }
        });
    }
    if (stats.recentDOMEvents?.length) {
        stats.recentDOMEvents.forEach(e => {
            if (!liveData.dom.find(d => d.timestamp === e.timestamp)) {
                liveData.dom.unshift(e);
            }
        });
    }

    liveData.network = liveData.network.slice(0, 100);
    liveData.dom = liveData.dom.slice(0, 100);
    renderLiveFeed();
}

function renderLiveFeed() {
    const data = liveData[currentLiveTab];
    if (!data?.length) return;

    liveFeed.innerHTML = data.slice(0, 50).map(item => {
        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';
        if (currentLiveTab === 'network') {
            return `<div class="feed-item"><span class="feed-time">${time}</span><span class="feed-type network">${item.method || 'GET'}</span><span class="feed-url">${escapeHtml((item.url || '').substring(0, 80))}</span></div>`;
        } else if (currentLiveTab === 'dom') {
            return `<div class="feed-item"><span class="feed-time">${time}</span><span class="feed-type ${item.severity}">${item.type}</span><span class="feed-url">${escapeHtml((item.url || '').substring(0, 80))}</span></div>`;
        }
        return '';
    }).join('');
}

// Live tabs
document.querySelectorAll('.live-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.live-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentLiveTab = tab.dataset.live;
        renderLiveFeed();
    });
});

// Automation logs
window.api.onAutomationLog?.(entry => {
    liveData.automation.unshift({ ...entry, timestamp: new Date().toISOString() });
});

// ============ LOAD SCRIPTS DROPDOWN ============
async function loadScriptOptions() {
    const select = document.getElementById('script-select');
    const templates = await window.api.getAutomationTemplates();
    const saved = JSON.parse(localStorage.getItem('customScripts') || '[]');

    select.innerHTML = '<option value="">Manual Testing</option>';

    templates.forEach(t => {
        select.innerHTML += `<option value="builtin:${t.id}">${t.name}</option>`;
    });

    saved.forEach((s, i) => {
        select.innerHTML += `<option value="custom:${i}">${s.name || 'Untitled'}</option>`;
    });
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
            <span><strong style="color: var(--primary);">${escapeHtml(site)}</strong> - ${escapeHtml(data.email || '')}</span>
            <button class="btn-danger" style="padding: 6px 10px;" onclick="removeSite('${site}')">🗑️</button>
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
