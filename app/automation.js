/**
 * Browser Automation Module
 * Execute automated actions in the monitored Chrome browser
 * Supports test credentials for login testing
 */

const CredentialsManager = require('./test-credentials');

class Automation {
    constructor(browser, credentialsManager = null) {
        this.browser = browser;
        this.credentialsManager = credentialsManager;
        this.isRunning = false;
        this.currentScript = null;
        this.logs = [];
        this.useTestCredentials = false;
    }

    /**
     * Execute an automation script
     * @param {Object} script - Script with actions
     * @param {Function} onLog - Callback for logs
     * @param {Object} options - Options like useTestCredentials
     */
    async execute(script, onLog = null, options = {}) {
        if (!this.browser) {
            throw new Error('Browser not connected');
        }

        this.isRunning = true;
        this.currentScript = script;
        this.logs = [];
        this.useTestCredentials = options.useTestCredentials || false;

        const log = (message, type = 'info') => {
            const entry = { timestamp: new Date().toISOString(), message, type };
            this.logs.push(entry);
            if (onLog) onLog(entry);
        };

        if (this.useTestCredentials) {
            log('🔐 Test credentials enabled - will attempt logins', 'info');
        }

        try {
            const pages = await this.browser.pages();
            let page = pages[0];

            if (!page) {
                page = await this.browser.newPage();
            }

            for (const action of script.actions) {
                if (!this.isRunning) {
                    log('Automation stopped by user', 'warning');
                    break;
                }

                log(`Executing: ${action.type} - ${action.description || ''}`);
                await this.executeAction(page, action, log);

                // Delay between actions
                if (action.delay) {
                    await this.sleep(action.delay);
                } else {
                    await this.sleep(500);
                }
            }

            log('Automation completed', 'success');

        } catch (error) {
            log(`Error: ${error.message}`, 'error');
            throw error;
        } finally {
            this.isRunning = false;
            this.currentScript = null;
        }

        return this.logs;
    }

    /**
     * Execute a single action
     */
    async executeAction(page, action, log) {
        switch (action.type) {
            case 'navigate':
                await page.goto(action.url, { waitUntil: 'networkidle2', timeout: 30000 });
                log(`Navigated to: ${action.url}`);
                break;

            case 'click':
                await page.waitForSelector(action.selector, { timeout: 10000 });
                await page.click(action.selector);
                log(`Clicked: ${action.selector}`);
                break;

            case 'type':
                await page.waitForSelector(action.selector, { timeout: 10000 });
                await page.type(action.selector, action.text, { delay: 50 });
                log(`Typed in: ${action.selector}`);
                break;

            case 'wait':
                await this.sleep(action.duration || 1000);
                log(`Waited ${action.duration || 1000}ms`);
                break;

            case 'waitForSelector':
                await page.waitForSelector(action.selector, { timeout: action.timeout || 10000 });
                log(`Found: ${action.selector}`);
                break;

            case 'scroll':
                await page.evaluate((distance) => {
                    window.scrollBy(0, distance);
                }, action.distance || 500);
                log(`Scrolled ${action.distance || 500}px`);
                break;

            case 'screenshot':
                const screenshotPath = action.path || `/tmp/screenshot-${Date.now()}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: action.fullPage });
                log(`Screenshot saved: ${screenshotPath}`);
                break;

            case 'evaluate':
                const result = await page.evaluate(action.script);
                log(`Evaluated script, result: ${JSON.stringify(result)}`);
                break;

            case 'newTab':
                const newPage = await this.browser.newPage();
                await newPage.goto(action.url, { waitUntil: 'networkidle2' });
                log(`Opened new tab: ${action.url}`);
                break;

            case 'closeTab':
                await page.close();
                log('Closed current tab');
                break;

            case 'reload':
                await page.reload({ waitUntil: 'networkidle2' });
                log('Reloaded page');
                break;

            case 'back':
                await page.goBack({ waitUntil: 'networkidle2' });
                log('Navigated back');
                break;

            case 'forward':
                await page.goForward({ waitUntil: 'networkidle2' });
                log('Navigated forward');
                break;

            case 'selectOption':
                await page.select(action.selector, action.value);
                log(`Selected option: ${action.value}`);
                break;

            case 'hover':
                await page.hover(action.selector);
                log(`Hovered: ${action.selector}`);
                break;

            case 'focus':
                await page.focus(action.selector);
                log(`Focused: ${action.selector}`);
                break;

            case 'clear':
                await page.click(action.selector, { clickCount: 3 });
                await page.keyboard.press('Backspace');
                log(`Cleared: ${action.selector}`);
                break;

            case 'press':
                await page.keyboard.press(action.key);
                log(`Pressed key: ${action.key}`);
                break;

            case 'setCookie':
                await page.setCookie({
                    name: action.name,
                    value: action.value,
                    domain: action.domain
                });
                log(`Set cookie: ${action.name}`);
                break;

            // ========== LOGIN ACTIONS ==========
            case 'login':
                await this.performLogin(page, action, log);
                break;

            case 'fillCredentials':
                await this.fillCredentials(page, action, log);
                break;

            default:
                log(`Unknown action type: ${action.type}`, 'warning');
        }
    }

    /**
     * Perform login on current page using test credentials
     */
    async performLogin(page, action, log) {
        const url = action.url || page.url();

        if (!this.credentialsManager) {
            log('⚠️ Credentials manager not available', 'warning');
            return;
        }

        const creds = this.credentialsManager.getCredentialsForUrl(url);

        log(`🔐 Attempting login on ${creds.site}`, 'info');

        if (!this.useTestCredentials) {
            log('⚠️ Test credentials not enabled, skipping login', 'warning');
            return;
        }

        if (!creds.found && !creds.email && !creds.password) {
            log('⚠️ No credentials configured for this site', 'warning');
            return;
        }

        try {
            // Navigate to login URL if specified
            if (action.url && page.url() !== action.url) {
                await page.goto(action.url, { waitUntil: 'networkidle2', timeout: 30000 });
                await this.sleep(1000);
            }

            const selectors = creds.selectors || {};

            // Site-specific login flows
            switch (creds.site) {
                case 'facebook':
                    await this.loginFacebook(page, creds, log);
                    break;
                case 'google':
                    await this.loginGoogle(page, creds, log);
                    break;
                case 'github':
                    await this.loginGithub(page, creds, log);
                    break;
                case 'twitter':
                    await this.loginTwitter(page, creds, log);
                    break;
                case 'amazon':
                    await this.loginAmazon(page, creds, log);
                    break;
                case 'instagram':
                    await this.loginInstagram(page, creds, log);
                    break;
                case 'linkedin':
                    await this.loginLinkedin(page, creds, log);
                    break;
                default:
                    await this.loginGeneric(page, creds, log);
            }

            log(`✅ Login attempt completed for ${creds.site}`, 'success');
        } catch (error) {
            log(`❌ Login failed: ${error.message}`, 'error');
        }
    }

    async loginFacebook(page, creds, log) {
        log('Filling Facebook credentials...', 'info');
        await page.waitForSelector('#email', { timeout: 5000 });
        await page.type('#email', creds.email, { delay: 30 });
        await page.type('#pass', creds.password, { delay: 30 });
        await this.sleep(500);
        await page.click('button[name="login"]');
        log('Submitted Facebook login form', 'info');
        await this.sleep(3000);
    }

    async loginGoogle(page, creds, log) {
        log('Filling Google credentials...', 'info');
        await page.waitForSelector('input[type="email"]', { timeout: 5000 });
        await page.type('input[type="email"]', creds.email, { delay: 30 });
        await page.click('#identifierNext');
        await this.sleep(2000);
        await page.waitForSelector('input[type="password"]', { timeout: 5000 });
        await page.type('input[type="password"]', creds.password, { delay: 30 });
        await page.click('#passwordNext');
        log('Submitted Google login form', 'info');
        await this.sleep(3000);
    }

    async loginGithub(page, creds, log) {
        log('Filling GitHub credentials...', 'info');
        await page.waitForSelector('#login_field', { timeout: 5000 });
        await page.type('#login_field', creds.email || creds.username, { delay: 30 });
        await page.type('#password', creds.password, { delay: 30 });
        await page.click('input[type="submit"]');
        log('Submitted GitHub login form', 'info');
        await this.sleep(3000);
    }

    async loginTwitter(page, creds, log) {
        log('Filling Twitter/X credentials...', 'info');
        await page.waitForSelector('input[autocomplete="username"]', { timeout: 5000 });
        await page.type('input[autocomplete="username"]', creds.email || creds.username, { delay: 30 });
        await page.keyboard.press('Enter');
        await this.sleep(2000);
        await page.waitForSelector('input[autocomplete="current-password"]', { timeout: 5000 });
        await page.type('input[autocomplete="current-password"]', creds.password, { delay: 30 });
        await page.keyboard.press('Enter');
        log('Submitted Twitter login form', 'info');
        await this.sleep(3000);
    }

    async loginAmazon(page, creds, log) {
        log('Filling Amazon credentials...', 'info');
        await page.waitForSelector('#ap_email', { timeout: 5000 });
        await page.type('#ap_email', creds.email, { delay: 30 });
        await page.click('#continue');
        await this.sleep(1500);
        await page.waitForSelector('#ap_password', { timeout: 5000 });
        await page.type('#ap_password', creds.password, { delay: 30 });
        await page.click('#signInSubmit');
        log('Submitted Amazon login form', 'info');
        await this.sleep(3000);
    }

    async loginInstagram(page, creds, log) {
        log('Filling Instagram credentials...', 'info');
        await page.waitForSelector('input[name="username"]', { timeout: 5000 });
        await page.type('input[name="username"]', creds.username || creds.email, { delay: 30 });
        await page.type('input[name="password"]', creds.password, { delay: 30 });
        await page.click('button[type="submit"]');
        log('Submitted Instagram login form', 'info');
        await this.sleep(3000);
    }

    async loginLinkedin(page, creds, log) {
        log('Filling LinkedIn credentials...', 'info');
        await page.waitForSelector('#username', { timeout: 5000 });
        await page.type('#username', creds.email, { delay: 30 });
        await page.type('#password', creds.password, { delay: 30 });
        await page.click('button[type="submit"]');
        log('Submitted LinkedIn login form', 'info');
        await this.sleep(3000);
    }

    async loginGeneric(page, creds, log) {
        log('Attempting generic login...', 'info');

        // Try common email/username selectors
        const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input[name="username"]', '#email', '#username', '#login'];
        const passwordSelectors = ['input[type="password"]', 'input[name="password"]', '#password'];
        const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:contains("Login")', 'button:contains("Sign in")'];

        // Find and fill email/username
        for (const sel of emailSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 2000 });
                await page.type(sel, creds.email || creds.username, { delay: 30 });
                log(`Filled email/username in ${sel}`, 'info');
                break;
            } catch (e) { }
        }

        // Find and fill password
        for (const sel of passwordSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 2000 });
                await page.type(sel, creds.password, { delay: 30 });
                log(`Filled password in ${sel}`, 'info');
                break;
            } catch (e) { }
        }

        // Try to submit
        for (const sel of submitSelectors) {
            try {
                await page.click(sel);
                log(`Clicked submit: ${sel}`, 'info');
                break;
            } catch (e) { }
        }

        await this.sleep(2000);
    }

    /**
     * Fill credentials without submitting
     */
    async fillCredentials(page, action, log) {
        const url = action.url || page.url();

        if (!this.credentialsManager) {
            log('⚠️ Credentials manager not available', 'warning');
            return;
        }

        const creds = this.credentialsManager.getCredentialsForUrl(url);

        if (!this.useTestCredentials) {
            log('⚠️ Test credentials not enabled', 'warning');
            return;
        }

        log(`📝 Filling credentials for ${creds.site} (not submitting)`, 'info');

        try {
            // Fill email/username
            if (action.emailSelector) {
                await page.type(action.emailSelector, creds.email || creds.username, { delay: 30 });
            }

            // Fill password
            if (action.passwordSelector) {
                await page.type(action.passwordSelector, creds.password, { delay: 30 });
            }

            log('Credentials filled, waiting for extension to capture...', 'info');
            await this.sleep(2000);
        } catch (error) {
            log(`Failed to fill credentials: ${error.message}`, 'error');
        }
    }

    /**
     * Stop current automation
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * Get predefined automation scripts
     */
    static getTemplates() {
        return [
            {
                id: 'browse-sites',
                name: 'Browse Popular Sites',
                description: 'Navigate through popular websites to trigger extension activity',
                supportsCredentials: false,
                actions: [
                    { type: 'navigate', url: 'https://www.google.com', description: 'Go to Google' },
                    { type: 'wait', duration: 2000 },
                    { type: 'type', selector: 'textarea[name="q"]', text: 'chrome extensions security', description: 'Search' },
                    { type: 'press', key: 'Enter' },
                    { type: 'wait', duration: 3000 },
                    { type: 'navigate', url: 'https://www.github.com', description: 'Go to GitHub' },
                    { type: 'wait', duration: 2000 },
                    { type: 'scroll', distance: 500 },
                    { type: 'wait', duration: 1000 },
                    { type: 'navigate', url: 'https://www.amazon.com', description: 'Go to Amazon' },
                    { type: 'wait', duration: 2000 },
                    { type: 'scroll', distance: 800 },
                    { type: 'wait', duration: 1000 },
                    { type: 'navigate', url: 'https://www.facebook.com', description: 'Go to Facebook' },
                    { type: 'wait', duration: 2000 },
                    { type: 'navigate', url: 'https://www.twitter.com', description: 'Go to Twitter' },
                    { type: 'wait', duration: 2000 }
                ]
            },
            {
                id: 'shopping-flow',
                name: 'Shopping Flow',
                description: 'Simulate shopping behavior - good for testing shopping extensions',
                supportsCredentials: false,
                actions: [
                    { type: 'navigate', url: 'https://www.amazon.com', description: 'Go to Amazon' },
                    { type: 'wait', duration: 2000 },
                    { type: 'type', selector: '#twotabsearchtextbox', text: 'laptop', description: 'Search for laptop' },
                    { type: 'press', key: 'Enter' },
                    { type: 'wait', duration: 3000 },
                    { type: 'scroll', distance: 600 },
                    { type: 'wait', duration: 1500 },
                    { type: 'navigate', url: 'https://www.ebay.com', description: 'Go to eBay' },
                    { type: 'wait', duration: 2000 },
                    { type: 'type', selector: '#gh-ac', text: 'headphones', description: 'Search for headphones' },
                    { type: 'press', key: 'Enter' },
                    { type: 'wait', duration: 3000 },
                    { type: 'scroll', distance: 500 }
                ]
            },
            {
                id: 'login-test',
                name: '🔐 Login Pages Test',
                description: 'Visit login pages and enter test credentials to detect credential stealers',
                supportsCredentials: true,
                actions: [
                    { type: 'navigate', url: 'https://www.facebook.com/login', description: 'Facebook Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt Facebook login' },
                    { type: 'wait', duration: 3000 },
                    { type: 'navigate', url: 'https://github.com/login', description: 'GitHub Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt GitHub login' },
                    { type: 'wait', duration: 3000 },
                    { type: 'navigate', url: 'https://twitter.com/login', description: 'Twitter Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt Twitter login' },
                    { type: 'wait', duration: 3000 },
                    { type: 'navigate', url: 'https://www.instagram.com/accounts/login/', description: 'Instagram Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt Instagram login' },
                    { type: 'wait', duration: 3000 }
                ]
            },
            {
                id: 'banking-test',
                name: '🏦 Banking Sites Test',
                description: 'Visit banking login pages with test credentials - detects financial malware',
                supportsCredentials: true,
                actions: [
                    { type: 'navigate', url: 'https://www.paypal.com/signin', description: 'PayPal Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt PayPal login' },
                    { type: 'wait', duration: 3000 },
                    { type: 'navigate', url: 'https://www.chase.com', description: 'Chase Bank' },
                    { type: 'wait', duration: 2000 },
                    { type: 'scroll', distance: 300 },
                    { type: 'wait', duration: 2000 },
                    { type: 'navigate', url: 'https://www.bankofamerica.com', description: 'Bank of America' },
                    { type: 'wait', duration: 2000 },
                    { type: 'scroll', distance: 300 },
                    { type: 'wait', duration: 2000 }
                ]
            },
            {
                id: 'crypto-test',
                name: '💰 Crypto Sites Test',
                description: 'Visit cryptocurrency sites with test credentials - detects crypto stealers',
                supportsCredentials: true,
                actions: [
                    { type: 'navigate', url: 'https://www.coinbase.com/signin', description: 'Coinbase Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt Coinbase login' },
                    { type: 'wait', duration: 3000 },
                    { type: 'navigate', url: 'https://accounts.binance.com/login', description: 'Binance Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt Binance login' },
                    { type: 'wait', duration: 3000 },
                    { type: 'navigate', url: 'https://metamask.io', description: 'MetaMask' },
                    { type: 'wait', duration: 2000 },
                    { type: 'navigate', url: 'https://www.blockchain.com/wallet', description: 'Blockchain.com' },
                    { type: 'wait', duration: 2000 }
                ]
            },
            {
                id: 'google-login',
                name: '🔐 Google Login Test',
                description: 'Test Google login flow - enter credentials step by step',
                supportsCredentials: true,
                actions: [
                    { type: 'navigate', url: 'https://accounts.google.com', description: 'Google Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt Google login' },
                    { type: 'wait', duration: 5000 }
                ]
            },
            {
                id: 'amazon-login',
                name: '🛒 Amazon Login Test',
                description: 'Test Amazon login and checkout flow',
                supportsCredentials: true,
                actions: [
                    { type: 'navigate', url: 'https://www.amazon.com/ap/signin', description: 'Amazon Login' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Attempt Amazon login' },
                    { type: 'wait', duration: 5000 }
                ]
            },
            {
                id: 'full-security-test',
                name: '🛡️ Full Security Test',
                description: 'Comprehensive test: browse, login, banking, crypto - ALL with credentials',
                supportsCredentials: true,
                actions: [
                    // Browse first
                    { type: 'navigate', url: 'https://www.google.com', description: 'Go to Google' },
                    { type: 'wait', duration: 1500 },
                    { type: 'type', selector: 'textarea[name="q"]', text: 'password manager', description: 'Search' },
                    { type: 'press', key: 'Enter' },
                    { type: 'wait', duration: 2000 },
                    // Social logins
                    { type: 'navigate', url: 'https://www.facebook.com/login', description: 'Facebook' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Login to Facebook' },
                    { type: 'wait', duration: 2000 },
                    { type: 'navigate', url: 'https://github.com/login', description: 'GitHub' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Login to GitHub' },
                    { type: 'wait', duration: 2000 },
                    // Banking
                    { type: 'navigate', url: 'https://www.paypal.com/signin', description: 'PayPal' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Login to PayPal' },
                    { type: 'wait', duration: 2000 },
                    // Crypto
                    { type: 'navigate', url: 'https://www.coinbase.com/signin', description: 'Coinbase' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Login to Coinbase' },
                    { type: 'wait', duration: 2000 },
                    // Shopping
                    { type: 'navigate', url: 'https://www.amazon.com/ap/signin', description: 'Amazon' },
                    { type: 'wait', duration: 2000 },
                    { type: 'login', description: 'Login to Amazon' },
                    { type: 'wait', duration: 3000 }
                ]
            }
        ];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Automation;
