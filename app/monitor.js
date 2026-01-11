const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

// Import modules
let ActivityLogReader, Automation, CredentialsManager;
try {
    ActivityLogReader = require('./activity-reader');
} catch (e) {
    ActivityLogReader = null;
}
try {
    Automation = require('./automation');
} catch (e) {
    Automation = null;
}
try {
    CredentialsManager = require('./test-credentials');
} catch (e) {
    CredentialsManager = null;
}

class BrowserMonitor {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.reportsDir = path.join(dataDir, 'reports');
        this.screenshotsDir = path.join(dataDir, 'screenshots');
        this.isRunning = false;
        this.browser = null;
        this.sessionId = null;
        this.startTime = null;
        this.networkEvents = [];
        this.activityEvents = [];
        this.domEvents = [];
        this.automationLogs = [];
        this.screenshots = [];
        this.chromeProcess = null;
        this.activityReader = null;
        this.automation = null;
        this.currentPage = null;

        // Load DOM monitor script
        this.domMonitorScript = this.loadDomMonitorScript();

        // Store request/response pairs
        this.requestMap = new Map();

        // Custom profile path for monitoring
        this.chromeProfilePath = path.join(dataDir, 'chrome-profile');

        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
        if (!fs.existsSync(this.screenshotsDir)) {
            fs.mkdirSync(this.screenshotsDir, { recursive: true });
        }
    }

    async start(options = {}) {
        if (this.isRunning) {
            throw new Error('Monitoring already running');
        }

        const chromePath = this.findChrome();
        if (!chromePath) {
            throw new Error('Chrome not found. Please install Google Chrome.');
        }

        this.sessionId = uuidv4();
        this.startTime = new Date();
        this.networkEvents = [];
        this.activityEvents = [];
        this.domEvents = [];
        this.automationLogs = [];
        this.requestMap.clear();

        // Create profile directory
        if (!fs.existsSync(this.chromeProfilePath)) {
            fs.mkdirSync(this.chromeProfilePath, { recursive: true });
        }

        // Build Chrome arguments
        const args = [
            '--remote-debugging-port=9222',
            `--user-data-dir=${this.chromeProfilePath}`,
            '--no-first-run',
            '--disable-default-apps',
            '--enable-extension-activity-logging',
            '--enable-logging',
            '--v=1'
        ];

        if (options.extensionPath) {
            args.push(`--load-extension=${options.extensionPath}`);
        }

        console.log('Starting Chrome with full network capture...');

        // Start Chrome process
        this.chromeProcess = spawn(chromePath, args, {
            detached: false,
            stdio: 'pipe'
        });

        // Capture Chrome logs
        this.chromeProcess.stderr.on('data', (data) => {
            const log = data.toString();
            if (log.includes('extension') || log.includes('Extension') || log.includes('API')) {
                this.activityEvents.push({
                    timestamp: new Date().toISOString(),
                    type: 'chrome_log',
                    message: log.trim().substring(0, 500)
                });
            }
        });

        // Wait for Chrome to start
        await this.sleep(3000);

        // Start activity log reader
        if (ActivityLogReader) {
            this.activityReader = new ActivityLogReader(this.chromeProfilePath);
            this.activityReader.startPolling(2000, (newActivities) => {
                this.activityEvents.push(...newActivities.map(a => ({
                    ...a,
                    type: 'extension_activity'
                })));
            });
        }

        // Connect via Puppeteer
        try {
            this.browser = await puppeteer.connect({
                browserURL: 'http://localhost:9222',
                defaultViewport: null
            });

            // Initialize automation with credentials manager
            if (Automation) {
                let credManager = null;
                if (CredentialsManager) {
                    credManager = new CredentialsManager(this.dataDir);
                }
                this.automation = new Automation(this.browser, credManager);
            }

            // Set up monitoring on all pages
            const pages = await this.browser.pages();
            for (const page of pages) {
                await this.attachToPage(page);
            }

            // Monitor new pages
            this.browser.on('targetcreated', async (target) => {
                if (target.type() === 'page') {
                    const page = await target.page();
                    if (page) {
                        await this.attachToPage(page);
                    }
                }
            });

            this.isRunning = true;
            console.log('Browser monitoring started with FULL body capture');

        } catch (error) {
            this.cleanup();
            throw new Error(`Failed to connect to Chrome: ${error.message}`);
        }
    }

    async attachToPage(page) {
        try {
            const client = await page.target().createCDPSession();

            // Enable Network domain with full request/response capture
            await client.send('Network.enable', {
                maxResourceBufferSize: 10 * 1024 * 1024,  // 10MB buffer
                maxTotalBufferSize: 50 * 1024 * 1024     // 50MB total
            });

            // Enable Fetch domain to intercept requests with bodies
            await client.send('Fetch.enable', {
                patterns: [{ urlPattern: '*', requestStage: 'Request' }],
                handleAuthRequests: false
            });

            // ========== INTERCEPT REQUESTS (with body) ==========
            client.on('Fetch.requestPaused', async (params) => {
                const { requestId, request, resourceType } = params;

                // Capture the full request
                const requestData = {
                    id: requestId,
                    timestamp: new Date().toISOString(),
                    type: 'request',
                    url: request.url,
                    method: request.method,
                    resourceType: resourceType,
                    headers: request.headers,
                    postData: request.postData || null,  // ✅ REQUEST BODY!
                    hasPostData: !!request.postData
                };

                // Check if from extension
                if (request.url.includes('chrome-extension://') ||
                    params.initiator?.url?.includes('chrome-extension://')) {
                    requestData.fromExtension = true;
                    requestData.extensionId = this.extractExtensionId(params.initiator?.url || request.url);
                }

                this.networkEvents.push(requestData);
                this.requestMap.set(requestId, requestData);

                // Log interesting requests
                if (requestData.postData && requestData.postData.length > 0) {
                    console.log(`[CAPTURE] POST to ${request.url} - Body: ${requestData.postData.substring(0, 100)}...`);
                }

                // Continue the request (don't block it)
                try {
                    await client.send('Fetch.continueRequest', { requestId });
                } catch (e) {
                    // Request may have been handled
                }
            });

            // ========== CAPTURE RESPONSES (with body) ==========
            client.on('Network.responseReceived', async (params) => {
                const { requestId, response, type } = params;

                // Get the original request data
                const originalRequest = this.requestMap.get(requestId);

                const responseData = {
                    id: requestId,
                    timestamp: new Date().toISOString(),
                    type: 'response',
                    url: response.url,
                    status: response.status,
                    statusText: response.statusText,
                    mimeType: response.mimeType,
                    headers: response.headers,
                    fromExtension: originalRequest?.fromExtension || false,
                    body: null  // Will try to get below
                };

                this.networkEvents.push(responseData);
            });

            // ========== GET RESPONSE BODY ==========
            client.on('Network.loadingFinished', async (params) => {
                const { requestId } = params;

                try {
                    // Get response body
                    const { body, base64Encoded } = await client.send('Network.getResponseBody', { requestId });

                    // Find the response event and add body
                    const responseEvent = this.networkEvents.find(
                        e => e.id === requestId && e.type === 'response'
                    );

                    if (responseEvent) {
                        if (base64Encoded) {
                            // Binary content - store as base64
                            responseEvent.body = `[BASE64] ${body.substring(0, 200)}...`;
                            responseEvent.bodyBase64 = true;
                        } else {
                            // Text content - store directly
                            responseEvent.body = body.substring(0, 10000);  // Limit size
                            responseEvent.bodyTruncated = body.length > 10000;
                        }

                        // Check for suspicious data in response
                        if (body && this.containsSensitiveData(body)) {
                            responseEvent.containsSensitiveData = true;
                        }
                    }
                } catch (e) {
                    // Some responses don't have accessible body
                }
            });

            // Monitor console
            page.on('console', (msg) => {
                const text = msg.text();
                if (text.includes('extension') || text.includes('chrome.') || text.includes('Chrome Monitor')) {
                    this.activityEvents.push({
                        timestamp: new Date().toISOString(),
                        type: 'console',
                        message: text.substring(0, 500)
                    });
                }
            });

            // ========== INJECT DOM MONITOR ==========
            if (this.domMonitorScript) {
                try {
                    // Expose function first (before injecting script)
                    await page.exposeFunction('__chromemonitor_dom_event__', async (event) => {
                        this.domEvents.push(event);

                        if (event.severity === 'critical' || event.severity === 'high') {
                            console.log(`[DOM] ${event.severity.toUpperCase()}: ${event.type} on ${event.url}`);

                            // Capture screenshot on critical/high events
                            await this.captureScreenshot(page, `dom_${event.type}`, event.url);
                        }
                    }).catch(() => { });

                    // Inject into new documents (before page load)
                    await page.evaluateOnNewDocument(this.domMonitorScript);

                    // Also inject into current page (if already loaded)
                    await page.evaluate(this.domMonitorScript).catch(() => { });

                } catch (e) {
                    // Page may not support script injection
                    console.log('DOM monitor injection skipped:', e.message);
                }
            }

            // Setup listener for postMessage fallback (via CDP Runtime binding)
            try {
                const cdpSession = await page.target().createCDPSession();
                await cdpSession.send('Runtime.enable');

                cdpSession.on('Runtime.bindingCalled', (event) => {
                    if (event.name === '__chromemonitor_dom_event__') {
                        try {
                            const payload = JSON.parse(event.payload);
                            this.domEvents.push(payload);
                        } catch (e) { }
                    }
                });
            } catch (e) { }

        } catch (error) {
            console.error('Failed to attach to page:', error.message);
        }
    }

    /**
     * Check if data contains sensitive information
     */
    containsSensitiveData(data) {
        const patterns = [
            /password/i,
            /passwd/i,
            /secret/i,
            /api.?key/i,
            /token/i,
            /cookie/i,
            /session/i,
            /credit.?card/i,
            /ssn/i,
            /social.?security/i,
            /private.?key/i,
            /wallet/i
        ];

        return patterns.some(p => p.test(data));
    }

    /**
     * Extract extension ID from URL
     */
    extractExtensionId(url) {
        if (!url) return null;
        const match = url.match(/chrome-extension:\/\/([a-z]+)/i);
        return match ? match[1] : null;
    }

    /**
     * Run automation script
     */
    async runAutomation(script, onLog = null, options = {}) {
        if (!this.automation) {
            throw new Error('Automation not available');
        }

        if (!this.isRunning) {
            throw new Error('Browser not running');
        }

        const logs = await this.automation.execute(script, (entry) => {
            this.automationLogs.push(entry);
            if (onLog) onLog(entry);
        }, options);

        return logs;
    }

    stopAutomation() {
        if (this.automation) {
            this.automation.stop();
        }
    }

    getAutomationTemplates() {
        if (Automation) {
            return Automation.getTemplates();
        }
        return [];
    }

    async stop() {
        if (!this.isRunning) {
            return null;
        }

        const endTime = new Date();
        this.stopAutomation();

        if (this.activityReader) {
            this.activityReader.stopPolling();
            const activities = this.activityReader.getAllActivities();
            for (const act of activities) {
                if (!this.activityEvents.find(e => e.timestamp === act.timestamp && e.apiName === act.apiName)) {
                    this.activityEvents.push({
                        ...act,
                        type: 'extension_activity'
                    });
                }
            }
            this.activityReader = null;
        }

        // Analyze requests
        const extensionRequests = this.networkEvents.filter(e => e.fromExtension);
        const requestsWithBody = this.networkEvents.filter(e => e.type === 'request' && e.postData);
        const responsesWithBody = this.networkEvents.filter(e => e.type === 'response' && e.body);
        const sensitiveResponses = this.networkEvents.filter(e => e.containsSensitiveData);

        // Generate report
        const report = {
            id: this.sessionId,
            name: `Session ${this.sessionId.slice(0, 8)}`,
            startTime: this.startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: (endTime - this.startTime) / 1000,
            profilePath: this.chromeProfilePath,
            stats: {
                totalRequests: this.networkEvents.filter(e => e.type === 'request').length,
                totalResponses: this.networkEvents.filter(e => e.type === 'response').length,
                requestsWithBody: requestsWithBody.length,
                responsesWithBody: responsesWithBody.length,
                extensionRequests: extensionRequests.length,
                extensionActivities: this.activityEvents.filter(e => e.type === 'extension_activity').length,
                sensitiveDataTransfers: sensitiveResponses.length,
                domEvents: this.domEvents.length,
                domCritical: this.domEvents.filter(e => e.severity === 'critical').length,
                uniqueDomains: this.getUniqueDomains().length,
                automationActions: this.automationLogs.length,
                screenshots: this.screenshots.length
            },
            networkEvents: this.networkEvents,
            activityEvents: this.activityEvents,
            domEvents: this.domEvents,
            automationLogs: this.automationLogs,
            screenshots: this.screenshots,
            extensionRequests,
            requestsWithPayload: requestsWithBody,
            sensitiveDataTransfers: sensitiveResponses,
            domains: this.getUniqueDomains(),
            suspiciousActivities: this.getSuspiciousActivities()
        };

        // Save report
        const reportPath = path.join(this.reportsDir, `${this.sessionId}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log('Report saved:', reportPath);
        console.log(`Captured: ${requestsWithBody.length} requests with body, ${responsesWithBody.length} responses with body`);

        this.cleanup();

        return report;
    }

    getSuspiciousActivities() {
        const suspicious = [];

        // Check activity events
        for (const event of this.activityEvents) {
            if (event.apiName?.includes('cookies')) {
                suspicious.push({ ...event, severity: 'high', reason: 'Cookie access detected' });
            }
            if (event.apiName?.includes('webRequest')) {
                suspicious.push({ ...event, severity: 'high', reason: 'Network interception detected' });
            }
            if (event.apiName?.includes('storage')) {
                suspicious.push({ ...event, severity: 'medium', reason: 'Storage access detected' });
            }
        }

        // Check for extension making external requests
        for (const event of this.networkEvents) {
            if (event.fromExtension && event.type === 'request' && !event.url.includes('chrome-extension://')) {
                suspicious.push({
                    ...event,
                    severity: 'high',
                    reason: 'Extension sending data to external server'
                });
            }

            // Check for data exfiltration (POST with body to external)
            if (event.fromExtension && event.postData && event.postData.length > 50) {
                suspicious.push({
                    ...event,
                    severity: 'critical',
                    reason: `Extension sending ${event.postData.length} bytes to ${new URL(event.url).hostname}`
                });
            }

            // Check for sensitive data in response
            if (event.containsSensitiveData) {
                suspicious.push({
                    ...event,
                    severity: 'high',
                    reason: 'Sensitive data detected in response'
                });
            }
        }

        // Check DOM events for malicious activity
        for (const event of this.domEvents) {
            if (event.severity === 'critical') {
                suspicious.push({
                    ...event,
                    reason: `DOM: ${event.type} - ${event.src || event.action || 'unknown'}`
                });
            }

            if (event.type === 'script_injected') {
                suspicious.push({
                    ...event,
                    severity: 'critical',
                    reason: `Script injected: ${event.src || '[inline code]'}`
                });
            }

            if (event.type === 'form_action_changed') {
                suspicious.push({
                    ...event,
                    severity: 'critical',
                    reason: `Form hijacked: action changed to ${event.newValue}`
                });
            }

            if (event.type === 'keylogger_suspect') {
                suspicious.push({
                    ...event,
                    severity: 'critical',
                    reason: `Potential keylogger: ${event.eventType} listener on ${event.targetTag}`
                });
            }

            if (event.type === 'iframe_injected' && event.hidden) {
                suspicious.push({
                    ...event,
                    severity: 'high',
                    reason: `Hidden iframe injected: ${event.src}`
                });
            }

            if (event.type === 'cookie_read' || event.type === 'cookie_write') {
                suspicious.push({
                    ...event,
                    severity: 'high',
                    reason: `Cookie ${event.type === 'cookie_read' ? 'read' : 'written'} by page script`
                });
            }
        }

        return suspicious;
    }

    cleanup() {
        this.isRunning = false;
        this.requestMap.clear();

        if (this.activityReader) {
            this.activityReader.stopPolling();
            this.activityReader = null;
        }

        if (this.browser) {
            try {
                this.browser.disconnect();
            } catch (e) { }
            this.browser = null;
        }

        if (this.chromeProcess) {
            try {
                this.chromeProcess.kill('SIGTERM');
            } catch (e) { }
            this.chromeProcess = null;
        }

        this.automation = null;
        this.killPort(9222);
    }

    killPort(port) {
        try {
            if (process.platform === 'win32') {
                exec(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /F /PID %a`, { shell: true });
            } else {
                exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null`);
            }
        } catch (e) { }
    }

    getStats() {
        return {
            sessionId: this.sessionId,
            running: this.isRunning,
            duration: this.startTime ? (new Date() - this.startTime) / 1000 : 0,
            requests: this.networkEvents.filter(e => e.type === 'request').length,
            requestsWithBody: this.networkEvents.filter(e => e.postData).length,
            activities: this.activityEvents.length,
            domEvents: this.domEvents.length,
            domains: this.getUniqueDomains().length,
            automationRunning: this.automation?.isRunning || false
        };
    }

    getUniqueDomains() {
        const domains = new Set();
        for (const event of this.networkEvents) {
            if (event.url) {
                try {
                    const url = new URL(event.url);
                    domains.add(url.hostname);
                } catch (e) { }
            }
        }
        return Array.from(domains);
    }

    findChrome() {
        const paths = process.platform === 'win32' ? [
            process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe'
        ] : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        ];

        for (const p of paths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        return null;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Load DOM monitor script
     */
    loadDomMonitorScript() {
        try {
            const scriptPath = path.join(__dirname, 'dom-monitor.js');
            return fs.readFileSync(scriptPath, 'utf8');
        } catch (e) {
            console.warn('Could not load DOM monitor script:', e.message);
            return null;
        }
    }

    /**
     * Capture screenshot on suspicious events
     */
    async captureScreenshot(page, reason, url) {
        try {
            if (!page || page.isClosed()) return null;

            const timestamp = Date.now();
            const filename = `${this.sessionId}_${timestamp}_${reason}.png`;
            const filepath = path.join(this.screenshotsDir, filename);

            await page.screenshot({
                path: filepath,
                fullPage: false,
                type: 'png'
            });

            const screenshotInfo = {
                timestamp: new Date().toISOString(),
                filename: filename,
                filepath: filepath,
                reason: reason,
                url: url
            };

            this.screenshots.push(screenshotInfo);
            console.log(`[Screenshot] Captured: ${reason} - ${filename}`);

            return screenshotInfo;
        } catch (e) {
            console.error('Screenshot failed:', e.message);
            return null;
        }
    }

    /**
     * Generate HAR (HTTP Archive) format export
     */
    generateHAR() {
        const entries = [];
        const requestEvents = this.networkEvents.filter(e => e.type === 'request');
        const responseEvents = this.networkEvents.filter(e => e.type === 'response');

        for (const req of requestEvents) {
            // Find matching response
            const res = responseEvents.find(r => r.requestId === req.requestId);

            const entry = {
                startedDateTime: req.timestamp,
                time: res ? (new Date(res.timestamp) - new Date(req.timestamp)) : 0,
                request: {
                    method: req.method || 'GET',
                    url: req.url,
                    httpVersion: 'HTTP/1.1',
                    cookies: [],
                    headers: this.headersToHAR(req.headers || {}),
                    queryString: this.parseQueryString(req.url),
                    postData: req.postData ? {
                        mimeType: req.headers?.['Content-Type'] || 'application/octet-stream',
                        text: req.postData
                    } : undefined,
                    headersSize: -1,
                    bodySize: req.postData ? req.postData.length : 0
                },
                response: {
                    status: res?.status || 0,
                    statusText: res?.statusText || '',
                    httpVersion: 'HTTP/1.1',
                    cookies: [],
                    headers: this.headersToHAR(res?.headers || {}),
                    content: {
                        size: res?.body?.length || 0,
                        mimeType: res?.mimeType || 'text/plain',
                        text: res?.body || ''
                    },
                    redirectURL: '',
                    headersSize: -1,
                    bodySize: res?.body?.length || 0
                },
                cache: {},
                timings: {
                    send: 0,
                    wait: res ? (new Date(res.timestamp) - new Date(req.timestamp)) : 0,
                    receive: 0
                },
                _initiator: req.initiator,
                _fromExtension: req.initiator?.type === 'script' && req.initiator?.url?.startsWith('chrome-extension://')
            };

            entries.push(entry);
        }

        return {
            log: {
                version: '1.2',
                creator: {
                    name: 'Chrome Monitor',
                    version: '1.0.0'
                },
                browser: {
                    name: 'Chrome',
                    version: ''
                },
                pages: [{
                    startedDateTime: this.startTime?.toISOString() || new Date().toISOString(),
                    id: this.sessionId,
                    title: 'Chrome Monitor Session',
                    pageTimings: {
                        onContentLoad: -1,
                        onLoad: -1
                    }
                }],
                entries: entries
            }
        };
    }

    /**
     * Convert headers object to HAR format
     */
    headersToHAR(headers) {
        if (!headers || typeof headers !== 'object') return [];
        return Object.entries(headers).map(([name, value]) => ({
            name: name,
            value: String(value)
        }));
    }

    /**
     * Parse query string from URL
     */
    parseQueryString(url) {
        try {
            const urlObj = new URL(url);
            const params = [];
            urlObj.searchParams.forEach((value, name) => {
                params.push({ name, value });
            });
            return params;
        } catch (e) {
            return [];
        }
    }

    /**
     * Export HAR to file
     */
    async exportHAR(outputPath = null) {
        const har = this.generateHAR();
        const filename = outputPath || path.join(this.reportsDir, `${this.sessionId}.har`);

        fs.writeFileSync(filename, JSON.stringify(har, null, 2));
        console.log(`[HAR] Exported to: ${filename}`);

        return filename;
    }

    /**
     * Get real-time stats for dashboard
     */
    getRealTimeStats() {
        const now = new Date();
        const duration = this.startTime ? (now - this.startTime) / 1000 : 0;

        // Calculate requests per second
        const requestCount = this.networkEvents.filter(e => e.type === 'request').length;
        const rps = duration > 0 ? (requestCount / duration).toFixed(2) : 0;

        // Recent events (last 10)
        const recentNetwork = this.networkEvents.slice(-10).reverse();
        const recentDOM = this.domEvents.slice(-10).reverse();

        // Critical counts
        const criticalDOM = this.domEvents.filter(e => e.severity === 'critical').length;
        const highDOM = this.domEvents.filter(e => e.severity === 'high').length;

        // Extension requests
        const extRequests = this.networkEvents.filter(e =>
            e.initiator?.url?.startsWith('chrome-extension://') ||
            e.url?.startsWith('chrome-extension://')
        ).length;

        return {
            sessionId: this.sessionId,
            running: this.isRunning,
            duration: Math.round(duration),

            // Counts
            requests: requestCount,
            responses: this.networkEvents.filter(e => e.type === 'response').length,
            requestsWithBody: this.networkEvents.filter(e => e.postData).length,
            activities: this.activityEvents.length,
            domEvents: this.domEvents.length,
            screenshots: this.screenshots.length,

            // Rates
            requestsPerSecond: parseFloat(rps),

            // Threat levels
            criticalEvents: criticalDOM,
            highEvents: highDOM,
            extensionRequests: extRequests,

            // Recent activity
            recentNetworkEvents: recentNetwork.map(e => ({
                type: e.type,
                method: e.method,
                url: e.url?.substring(0, 60),
                status: e.status,
                timestamp: e.timestamp
            })),
            recentDOMEvents: recentDOM.map(e => ({
                type: e.type,
                severity: e.severity,
                url: e.url?.substring(0, 40),
                timestamp: e.timestamp
            })),

            // Domains
            domains: this.getUniqueDomains().length,
            topDomains: this.getUniqueDomains().slice(0, 5),

            // Automation
            automationRunning: this.automation?.isRunning || false,
            automationLogs: this.automationLogs.slice(-5)
        };
    }
}

module.exports = BrowserMonitor;
