// Tab navigation
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');

        if (tab === 'reports') loadReports();
        if (tab === 'automation') loadAutomationTemplates();
    });
});

// ============ ANALYZE TAB ============

const uploadArea = document.getElementById('upload-area');
const browseBtn = document.getElementById('browse-btn');
const analysisResult = document.getElementById('analysis-result');

browseBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const filePath = await window.api.selectFile();
    if (filePath) analyzeFile(filePath);
});

uploadArea.addEventListener('click', async () => {
    const filePath = await window.api.selectFile();
    if (filePath) analyzeFile(filePath);
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        analyzeFile(e.dataTransfer.files[0].path);
    }
});

async function analyzeFile(filePath) {
    uploadArea.innerHTML = `<div class="upload-icon">⏳</div><h3>Analyzing...</h3>`;

    const result = await window.api.analyzeExtension(filePath);

    uploadArea.innerHTML = `
        <div class="upload-icon">📂</div>
        <h3>Drop CRX or ZIP file here</h3>
        <p>or click to browse</p>
        <button class="btn btn-primary" id="browse-btn">Browse Files</button>
    `;
    document.getElementById('browse-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const fp = await window.api.selectFile();
        if (fp) analyzeFile(fp);
    });

    if (result.success) {
        displayAnalysisResult(result.data);
    } else {
        alert('Analysis failed: ' + result.error);
    }
}

function displayAnalysisResult(data) {
    analysisResult.classList.remove('hidden');
    const highRiskPerms = data.permissions.filter(p => p.risk === 'high');
    const lowRiskPerms = data.permissions.filter(p => p.risk === 'low');

    analysisResult.innerHTML = `
        <div class="result-header">
            <div class="ext-info">
                <h2>${escapeHtml(data.name)}</h2>
                <p>Version ${data.version} • Manifest V${data.manifestVersion}</p>
            </div>
            <div class="risk-badge risk-${data.riskLevel}">Risk Score: ${data.riskScore}</div>
        </div>
        <div class="result-body">
            ${data.description ? `<div class="result-section"><h3>Description</h3><p>${escapeHtml(data.description)}</p></div>` : ''}
            <div class="result-section">
                <h3>Permissions (${data.permissions.length})</h3>
                <div class="permission-list">
                    ${highRiskPerms.map(p => `<span class="permission-tag high" title="${escapeHtml(p.description)}">${escapeHtml(p.name)}</span>`).join('')}
                    ${lowRiskPerms.map(p => `<span class="permission-tag low">${escapeHtml(p.name)}</span>`).join('')}
                </div>
            </div>
            ${data.codeAnalysis.length > 0 ? `
                <div class="result-section">
                    <h3>⚠️ Suspicious Patterns (${data.codeAnalysis.length})</h3>
                    <div class="finding-list">
                        ${data.codeAnalysis.slice(0, 10).map(f => `
                            <div class="finding-item">
                                <span class="finding-file">${escapeHtml(f.file)}</span>
                                <span class="finding-pattern">${escapeHtml(f.pattern)} (${f.count}x)</span>
                                <span class="finding-risk">+${f.risk}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// ============ TEST TAB ============

const startBtn = document.getElementById('start-test-btn');
const stopBtn = document.getElementById('stop-test-btn');
const exportHarBtn = document.getElementById('export-har-btn');
const sessionStatus = document.getElementById('session-status');
const threatIndicators = document.getElementById('threat-indicators');
const liveFeedCard = document.getElementById('live-feed-card');
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
        liveFeedCard.classList.remove('hidden');
        sessionStatus.innerHTML = `<div class="status-indicator active"></div><span>🔴 Recording Extension Activity</span>`;
        liveFeed.innerHTML = '<div class="feed-empty">Waiting for activity...</div>';
        lastEventCount = 0;
        statusInterval = setInterval(updateRealTimeStats, 500);
    } else {
        alert('Failed to start: ' + result.error);
        startBtn.disabled = false;
        startBtn.textContent = '▶ Start Testing';
    }
});

stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    stopBtn.textContent = 'Generating Report...';

    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    const result = await window.api.stopTesting();

    stopBtn.classList.add('hidden');
    exportHarBtn.classList.add('hidden');
    startBtn.classList.remove('hidden');
    startBtn.disabled = false;
    startBtn.textContent = '▶ Start Testing';
    stopBtn.disabled = false;
    stopBtn.textContent = '⏹ Stop & Generate Report';

    sessionStatus.innerHTML = `<div class="status-indicator inactive"></div><span>Not Running</span>`;
    threatIndicators.classList.add('hidden');
    liveFeedCard.classList.add('hidden');

    // Reset stats
    document.getElementById('stat-requests').textContent = '0';
    document.getElementById('stat-activities').textContent = '0';
    document.getElementById('stat-dom').textContent = '0';
    document.getElementById('stat-duration').textContent = '0s';

    if (result.success) {
        const data = result.data;
        const screenshotCount = data.screenshots?.length || 0;
        alert(`Report Generated!\n\n📊 Requests: ${data.stats.totalRequests}\n🧩 API Calls: ${data.stats.extensionActivities}\n🎭 DOM Events: ${data.stats.domEvents}\n📸 Screenshots: ${screenshotCount}\n⚠️ Suspicious: ${data.suspiciousActivities?.length || 0}`);
        document.querySelector('[data-tab="reports"]').click();
    } else {
        alert('Error: ' + result.error);
    }
});

// HAR Export Button
exportHarBtn.addEventListener('click', async () => {
    const result = await window.api.exportHAR();
    if (result.success) {
        alert(`HAR file exported to:\n${result.path}`);
    } else if (result.error) {
        alert('Export failed: ' + result.error);
    }
});

// Real-time stats update with live feed
async function updateRealTimeStats() {
    const stats = await window.api.getRealTimeStats();
    if (!stats) return;

    // Update basic stats
    document.getElementById('stat-requests').textContent = stats.requests || 0;
    document.getElementById('stat-activities').textContent = stats.activities || 0;
    document.getElementById('stat-dom').textContent = stats.domEvents || 0;
    document.getElementById('stat-duration').textContent = stats.duration + 's';

    // Update threat indicators
    document.getElementById('critical-count').textContent = stats.criticalEvents || 0;
    document.getElementById('high-count').textContent = stats.highEvents || 0;
    document.getElementById('ext-count').textContent = stats.extensionRequests || 0;
    document.getElementById('screenshot-count').textContent = stats.screenshots || 0;

    // Highlight if critical events detected
    if (stats.criticalEvents > 0) {
        document.getElementById('threat-critical').style.background = 'rgba(255, 107, 107, 0.2)';
    }
    if (stats.highEvents > 0) {
        document.getElementById('threat-high').style.background = 'rgba(255, 169, 77, 0.2)';
    }

    // Update live feed with new events
    const totalEvents = stats.requests + stats.domEvents;
    if (totalEvents > lastEventCount) {
        updateLiveFeed(stats);
        lastEventCount = totalEvents;
    }
}

function updateLiveFeed(stats) {
    // Clear empty message
    if (liveFeed.querySelector('.feed-empty')) {
        liveFeed.innerHTML = '';
    }

    // Add recent network events
    if (stats.recentNetworkEvents && stats.recentNetworkEvents.length > 0) {
        const latest = stats.recentNetworkEvents[0];
        addFeedItem('network', latest.method || 'REQ', latest.url, latest.timestamp);
    }

    // Add recent DOM events
    if (stats.recentDOMEvents && stats.recentDOMEvents.length > 0) {
        const latest = stats.recentDOMEvents[0];
        addFeedItem(latest.severity || 'dom', latest.type, latest.url, latest.timestamp);
    }

    // Limit feed to 50 items
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
        <span class="feed-type ${type}">${label}</span>
        <span class="feed-url">${escapeHtml(url || '')}</span>
    `;
    liveFeed.insertBefore(item, liveFeed.firstChild);
}

// ============ AUTOMATION TAB ============

const automationStatus = document.getElementById('automation-status');
const automationLogs = document.getElementById('automation-logs');
const stopAutomationBtn = document.getElementById('stop-automation-btn');

async function loadAutomationTemplates() {
    const templates = await window.api.getAutomationTemplates();
    const grid = document.getElementById('templates-grid');

    if (templates.length === 0) {
        grid.innerHTML = '<p class="no-templates">No templates available. Start browser testing first.</p>';
        return;
    }

    grid.innerHTML = templates.map(t => `
        <div class="template-card ${t.supportsCredentials ? 'supports-credentials' : ''}" data-id="${t.id}">
            <div class="template-icon">${getTemplateIcon(t.id)}</div>
            <div class="template-info">
                <h4>${escapeHtml(t.name)}</h4>
                <p>${escapeHtml(t.description)}</p>
            </div>
            <div class="template-meta">
                <span class="action-count">${t.actions.length} actions</span>
                ${t.supportsCredentials ? '<span class="cred-badge">🔐 Login</span>' : ''}
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', () => runTemplate(card.dataset.id, templates));
    });
}

function getTemplateIcon(id) {
    const icons = {
        'browse-sites': '🌐',
        'shopping-flow': '🛒',
        'login-test': '🔐',
        'banking-test': '🏦',
        'crypto-test': '💰',
        'google-login': '📧',
        'amazon-login': '🛒',
        'full-security-test': '🛡️'
    };
    return icons[id] || '🤖';
}

async function runTemplate(id, templates) {
    const template = templates.find(t => t.id === id);
    if (!template) return;

    // Check if browser is running
    const status = await window.api.getStatus();
    if (!status.isRunning) {
        alert('Please start Browser Testing first before running automation.');
        document.querySelector('[data-tab="test"]').click();
        return;
    }

    // Get credentials checkbox state
    const useTestCredentials = document.getElementById('use-test-credentials').checked;

    // Warn if template needs credentials but they're not enabled
    if (template.supportsCredentials && !useTestCredentials) {
        const proceed = confirm(
            '⚠️ This template has login actions but "Use Test Credentials" is disabled.\n\n' +
            'Enable test credentials to auto-fill fake login data.\n\n' +
            'Click OK to run anyway (logins will be skipped)\n' +
            'Click Cancel to go back and enable credentials'
        );
        if (!proceed) return;
    }

    // Notify if credentials are enabled
    if (useTestCredentials) {
        addLog({ message: '🔐 Test credentials enabled - will auto-fill fake login data', type: 'info' });
    }

    automationStatus.classList.remove('hidden');
    automationLogs.innerHTML = '';

    const result = await window.api.runAutomation(template, { useTestCredentials });

    automationStatus.classList.add('hidden');

    if (!result.success) {
        addLog({ message: 'Error: ' + result.error, type: 'error' });
    }
}

stopAutomationBtn.addEventListener('click', async () => {
    await window.api.stopAutomation();
    automationStatus.classList.add('hidden');
    addLog({ message: 'Automation stopped by user', type: 'warning' });
});

// Listen for real-time automation logs
window.api.onAutomationLog((entry) => {
    addLog(entry);
});

function addLog(entry) {
    if (automationLogs.querySelector('.empty-log')) {
        automationLogs.innerHTML = '';
    }

    const div = document.createElement('div');
    div.className = `log-entry log-${entry.type || 'info'}`;
    div.innerHTML = `
        <span class="log-time">${new Date(entry.timestamp || Date.now()).toLocaleTimeString()}</span>
        <span class="log-message">${escapeHtml(entry.message)}</span>
    `;
    automationLogs.appendChild(div);
    automationLogs.scrollTop = automationLogs.scrollHeight;
}

// ============ CREDENTIALS MANAGEMENT ============

const credentialsModal = document.getElementById('credentials-modal');
const credStatus = document.getElementById('cred-status');

// Load credentials status on page load
async function loadCredentialsStatus() {
    const creds = await window.api.getCredentials();
    const siteCount = creds.sites?.length || 0;
    const hasDefault = creds.default?.email || creds.default?.password;

    if (siteCount > 0 || hasDefault) {
        credStatus.textContent = `✓ ${siteCount} site(s) configured${hasDefault ? ' + default' : ''}`;
        credStatus.classList.add('has-creds');
    } else {
        credStatus.textContent = 'No credentials configured';
        credStatus.classList.remove('has-creds');
    }
}

// Open credentials modal
document.getElementById('manage-credentials-btn').addEventListener('click', async () => {
    credentialsModal.classList.remove('hidden');
    await loadCredentialsModal();
});

// Close modal
document.getElementById('close-modal-btn').addEventListener('click', () => {
    credentialsModal.classList.add('hidden');
});

// Close modal on backdrop click
credentialsModal.addEventListener('click', (e) => {
    if (e.target === credentialsModal) {
        credentialsModal.classList.add('hidden');
    }
});

// Load credentials into modal
async function loadCredentialsModal() {
    const creds = await window.api.getCredentials();

    // Fill default credentials
    document.getElementById('default-email').value = creds.default?.email || '';
    document.getElementById('default-username').value = creds.default?.username || '';
    document.getElementById('default-password').value = creds.default?.password || '';

    // Show sites list
    const sitesList = document.getElementById('sites-list');
    if (creds.sites && creds.sites.length > 0) {
        sitesList.innerHTML = creds.sites.map(s => `
            <div class="site-item" data-site="${escapeHtml(s.site)}">
                <span class="site-name">${escapeHtml(s.site)}</span>
                <span class="site-email">${escapeHtml(s.email || s.username || '')}</span>
                <span>${s.hasPassword ? '🔑' : ''}</span>
                <button class="remove-btn" title="Remove">✕</button>
            </div>
        `).join('');

        // Add remove handlers
        sitesList.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const site = e.target.closest('.site-item').dataset.site;
                await window.api.removeSiteCredentials(site);
                await loadCredentialsModal();
                await loadCredentialsStatus();
            });
        });
    } else {
        sitesList.innerHTML = '<div class="empty-sites">No site-specific credentials added</div>';
    }
}

// Save default credentials
document.getElementById('save-default-btn').addEventListener('click', async () => {
    const email = document.getElementById('default-email').value;
    const username = document.getElementById('default-username').value;
    const password = document.getElementById('default-password').value;

    await window.api.setDefaultCredentials({ email, username, password });
    alert('Default credentials saved!');
    await loadCredentialsStatus();
});

// Add site credentials
document.getElementById('add-site-btn').addEventListener('click', async () => {
    const site = document.getElementById('site-name').value.trim().toLowerCase();
    const email = document.getElementById('site-email').value;
    const password = document.getElementById('site-password').value;

    if (!site) {
        alert('Please enter a site name (e.g., facebook, google)');
        return;
    }

    await window.api.setSiteCredentials({ site, email, username: email, password });

    // Clear inputs
    document.getElementById('site-name').value = '';
    document.getElementById('site-email').value = '';
    document.getElementById('site-password').value = '';

    await loadCredentialsModal();
    await loadCredentialsStatus();
});

// Import credentials
document.getElementById('import-creds-btn').addEventListener('click', async () => {
    const result = await window.api.importCredentials();
    if (result.success) {
        alert(`Imported ${result.count} site credentials!`);
        await loadCredentialsModal();
        await loadCredentialsStatus();
    } else if (result.error) {
        alert('Import failed: ' + result.error);
    }
});

// Export credentials
document.getElementById('export-creds-btn').addEventListener('click', async () => {
    const result = await window.api.exportCredentials();
    if (result.success) {
        alert('Credentials exported to: ' + result.path);
    }
});

// Clear all credentials
document.getElementById('clear-creds-btn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear ALL credentials?')) {
        await window.api.clearCredentials();
        await loadCredentialsModal();
        await loadCredentialsStatus();
    }
});

// Load credentials status on init
loadCredentialsStatus();

// ============ REPORTS TAB ============

async function loadReports() {
    const reports = await window.api.getReports();
    const container = document.getElementById('reports-list');

    if (reports.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">📋</span><h3>No reports yet</h3><p>Complete a testing session</p></div>`;
        return;
    }

    container.innerHTML = reports.map(r => `
        <div class="report-card" data-id="${r.id}">
            <div class="report-info">
                <h4>${escapeHtml(r.name)}</h4>
                <p>${new Date(r.date).toLocaleString()}</p>
            </div>
            <div class="report-stats">
                <span><strong>${r.stats?.totalRequests || 0}</strong> requests</span>
                <span><strong>${r.stats?.extensionActivities || 0}</strong> activities</span>
                <span><strong>${r.stats?.automationActions || 0}</strong> auto</span>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.report-card').forEach(card => {
        card.addEventListener('click', () => openReport(card.dataset.id));
    });
}

async function openReport(id) {
    const result = await window.api.openReport(id);
    if (!result.success) return alert('Failed to open report');

    const data = result.data;
    const viewer = document.getElementById('report-viewer');
    viewer.classList.remove('hidden');

    // Get requests with payload
    const requestsWithBody = data.networkEvents?.filter(e => e.type === 'request' && e.postData) || [];
    const responsesWithBody = data.networkEvents?.filter(e => e.type === 'response' && e.body) || [];
    const extensionRequests = data.extensionRequests || [];

    viewer.innerHTML = `
        <div class="report-header">
            <div>
                <h3>${escapeHtml(data.name)}</h3>
                <p style="color:var(--text-dim);font-size:13px">${new Date(data.startTime).toLocaleString()} - ${Math.round(data.duration)}s</p>
            </div>
            <div>
                <button class="btn btn-secondary" onclick="exportReport('${id}')">📥 Export</button>
                <button class="btn btn-secondary" onclick="closeReport()">✕</button>
            </div>
        </div>
        <div class="report-content">
            <div class="result-section">
                <h3>📊 Summary</h3>
                <div class="stats-grid six-cols">
                    <div class="stat"><span class="stat-value">${data.stats.totalRequests}</span><span class="stat-label">Requests</span></div>
                    <div class="stat"><span class="stat-value">${data.stats.requestsWithBody || requestsWithBody.length}</span><span class="stat-label">With Body</span></div>
                    <div class="stat"><span class="stat-value">${data.stats.extensionRequests || 0}</span><span class="stat-label">Ext Requests</span></div>
                    <div class="stat"><span class="stat-value">${data.stats.extensionActivities || 0}</span><span class="stat-label">API Calls</span></div>
                    <div class="stat"><span class="stat-value">${data.stats.sensitiveDataTransfers || 0}</span><span class="stat-label">Sensitive</span></div>
                    <div class="stat"><span class="stat-value">${data.stats.uniqueDomains}</span><span class="stat-label">Domains</span></div>
                </div>
            </div>
            
            ${data.suspiciousActivities?.length > 0 ? `
                <div class="result-section warning-section">
                    <h3>⚠️ Suspicious Activities (${data.suspiciousActivities.length})</h3>
                    <div class="suspicious-list">
                        ${data.suspiciousActivities.slice(0, 20).map(s => `
                            <div class="suspicious-item">
                                <span class="severity ${s.severity}">${s.severity}</span>
                                <span class="reason">${escapeHtml(s.reason)}</span>
                                ${s.url ? `<span class="url">${escapeHtml(truncateUrl(s.url))}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${extensionRequests.length > 0 ? `
                <div class="result-section">
                    <h3>🧩 Extension Network Requests (${extensionRequests.length})</h3>
                    <div class="network-list">
                        ${extensionRequests.slice(0, 15).map(r => `
                            <div class="network-item ${r.postData ? 'has-body' : ''}">
                                <span class="method ${r.method}">${r.method}</span>
                                <span class="url">${escapeHtml(truncateUrl(r.url))}</span>
                                ${r.postData ? `
                                    <details class="body-details">
                                        <summary>📤 Request Body (${r.postData.length} bytes)</summary>
                                        <pre class="body-content">${escapeHtml(r.postData.substring(0, 500))}${r.postData.length > 500 ? '...' : ''}</pre>
                                    </details>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${requestsWithBody.length > 0 ? `
                <div class="result-section">
                    <h3>📤 Requests with Payload (${requestsWithBody.length})</h3>
                    <div class="network-list">
                        ${requestsWithBody.slice(0, 10).map(r => `
                            <div class="network-item has-body">
                                <span class="method ${r.method}">${r.method}</span>
                                <span class="url">${escapeHtml(truncateUrl(r.url))}</span>
                                <details class="body-details">
                                    <summary>View Body (${r.postData?.length || 0} bytes)</summary>
                                    <pre class="body-content">${escapeHtml((r.postData || '').substring(0, 1000))}</pre>
                                </details>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${responsesWithBody.length > 0 ? `
                <div class="result-section">
                    <h3>📥 Responses with Body (${responsesWithBody.length})</h3>
                    <div class="network-list">
                        ${responsesWithBody.slice(0, 10).map(r => `
                            <div class="network-item">
                                <span class="status status-${Math.floor(r.status / 100)}xx">${r.status}</span>
                                <span class="url">${escapeHtml(truncateUrl(r.url))}</span>
                                <span class="mime">${escapeHtml(r.mimeType || '')}</span>
                                ${r.containsSensitiveData ? '<span class="sensitive-badge">⚠️ SENSITIVE</span>' : ''}
                                <details class="body-details">
                                    <summary>View Response (${r.body?.length || 0} chars)</summary>
                                    <pre class="body-content">${escapeHtml((r.body || '').substring(0, 1000))}</pre>
                                </details>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${data.automationLogs?.length > 0 ? `
                <div class="result-section">
                    <h3>🤖 Automation Log (${data.automationLogs.length})</h3>
                    <div class="automation-logs compact">
                        ${data.automationLogs.map(l => `<div class="log-entry log-${l.type}">${escapeHtml(l.message)}</div>`).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${data.domEvents?.length > 0 ? `
                <div class="result-section">
                    <h3>🎭 DOM Events (${data.domEvents.length})</h3>
                    <div class="dom-events-list">
                        ${data.domEvents.filter(e => e.severity === 'critical' || e.severity === 'high').slice(0, 20).map(e => `
                            <div class="dom-event-item ${e.severity}">
                                <span class="dom-type">${escapeHtml(e.type)}</span>
                                <span class="dom-url">${escapeHtml(truncateUrl(e.url))}</span>
                                ${e.src ? `<span class="dom-detail">${escapeHtml(truncateUrl(e.src))}</span>` : ''}
                                ${e.action ? `<span class="dom-detail">${escapeHtml(e.action)}</span>` : ''}
                            </div>
                        `).join('')}
                        ${data.domEvents.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0 ?
                '<p class="no-events">No critical/high DOM events detected</p>' : ''}
                    </div>
                </div>
            ` : ''}
            
            <div class="result-section">
                <h3>🌐 Domains Contacted (${data.domains.length})</h3>
                <div class="domain-list">${data.domains.map(d => `<span class="domain-tag">${escapeHtml(d)}</span>`).join('')}</div>
            </div>
        </div>
    `;
}

function truncateUrl(url) {
    if (!url) return '';
    if (url.length <= 60) return url;
    return url.substring(0, 57) + '...';
}

function closeReport() {
    document.getElementById('report-viewer').classList.add('hidden');
}

async function exportReport(id) {
    const result = await window.api.exportReport(id);
    if (result.success) alert('Exported: ' + result.path);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
