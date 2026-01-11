/**
 * User Credentials Manager
 * Store and manage user's own test credentials for security testing
 */

const fs = require('fs');
const path = require('path');

class CredentialsManager {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.credentialsFile = path.join(dataDir, 'test-credentials.json');

        // Also check local app/data folder as fallback
        this.localCredentialsFile = path.join(__dirname, 'data', 'test-credentials.json');

        this.credentials = this.load();
    }

    /**
     * Load credentials from file
     * Checks userData folder first, then local app/data folder
     */
    load() {
        // Try primary location (userData)
        try {
            if (fs.existsSync(this.credentialsFile)) {
                const data = fs.readFileSync(this.credentialsFile, 'utf8');
                console.log('Loaded credentials from:', this.credentialsFile);
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Failed to load credentials from userData:', e.message);
        }

        // Try local app/data folder
        try {
            if (fs.existsSync(this.localCredentialsFile)) {
                const data = fs.readFileSync(this.localCredentialsFile, 'utf8');
                console.log('Loaded credentials from:', this.localCredentialsFile);
                const parsed = JSON.parse(data);

                // Copy to primary location for future use
                this.credentials = parsed;
                this.save();

                return parsed;
            }
        } catch (e) {
            console.error('Failed to load credentials from local folder:', e.message);
        }

        // Return default structure if no file exists
        return {
            sites: {},
            default: {
                email: '',
                username: '',
                password: ''
            }
        };
    }

    /**
     * Save credentials to file
     */
    save() {
        try {
            const dir = path.dirname(this.credentialsFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.credentialsFile, JSON.stringify(this.credentials, null, 2));
            return true;
        } catch (e) {
            console.error('Failed to save credentials:', e.message);
            return false;
        }
    }

    /**
     * Set default credentials (used when site-specific not found)
     */
    setDefault(email, username, password) {
        this.credentials.default = { email, username, password };
        this.save();
    }

    /**
     * Add or update credentials for a specific site
     */
    setSiteCredentials(site, creds) {
        this.credentials.sites[site] = {
            email: creds.email || '',
            username: creds.username || '',
            password: creds.password || '',
            selectors: creds.selectors || null
        };
        this.save();
    }

    /**
     * Remove credentials for a site
     */
    removeSiteCredentials(site) {
        delete this.credentials.sites[site];
        this.save();
    }

    /**
     * Get credentials for a URL
     */
    getCredentialsForUrl(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();

            // Check site-specific credentials
            for (const [site, creds] of Object.entries(this.credentials.sites)) {
                if (hostname.includes(site.toLowerCase())) {
                    return { site, ...creds, found: true };
                }
            }

            // Return default if no match
            return {
                site: 'default',
                ...this.credentials.default,
                found: false
            };
        } catch (e) {
            return {
                site: 'default',
                ...this.credentials.default,
                found: false
            };
        }
    }

    /**
     * Get all stored credentials (for UI display)
     */
    getAllCredentials() {
        return {
            default: this.credentials.default,
            sites: Object.entries(this.credentials.sites).map(([site, creds]) => ({
                site,
                email: creds.email,
                username: creds.username,
                hasPassword: !!creds.password
            }))
        };
    }

    /**
     * Import credentials from JSON
     */
    importFromJson(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

            if (data.default) {
                this.credentials.default = data.default;
            }

            if (data.sites) {
                for (const [site, creds] of Object.entries(data.sites)) {
                    this.credentials.sites[site] = creds;
                }
            }

            this.save();
            return { success: true, count: Object.keys(data.sites || {}).length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Export credentials to JSON
     */
    exportToJson() {
        return JSON.stringify(this.credentials, null, 2);
    }

    /**
     * Clear all credentials
     */
    clearAll() {
        this.credentials = {
            sites: {},
            default: { email: '', username: '', password: '' }
        };
        this.save();
    }

    /**
     * Get site selectors (login form elements)
     */
    static getSiteSelectors(site) {
        // Common selectors for popular sites
        const selectors = {
            facebook: {
                email: '#email',
                password: '#pass',
                submit: 'button[name="login"]'
            },
            google: {
                email: 'input[type="email"]',
                emailNext: '#identifierNext',
                password: 'input[type="password"]',
                passwordNext: '#passwordNext'
            },
            github: {
                email: '#login_field',
                password: '#password',
                submit: 'input[type="submit"]'
            },
            twitter: {
                email: 'input[autocomplete="username"]',
                password: 'input[autocomplete="current-password"]'
            },
            instagram: {
                email: 'input[name="username"]',
                password: 'input[name="password"]',
                submit: 'button[type="submit"]'
            },
            linkedin: {
                email: '#username',
                password: '#password',
                submit: 'button[type="submit"]'
            },
            amazon: {
                email: '#ap_email',
                continue: '#continue',
                password: '#ap_password',
                submit: '#signInSubmit'
            },
            paypal: {
                email: '#email',
                next: '#btnNext',
                password: '#password',
                submit: '#btnLogin'
            },
            coinbase: {
                email: '#email',
                password: '#password',
                submit: 'button[type="submit"]'
            }
        };

        return selectors[site.toLowerCase()] || {
            email: 'input[type="email"], input[name="email"], input[name="username"], #email, #username',
            password: 'input[type="password"]',
            submit: 'button[type="submit"], input[type="submit"]'
        };
    }
}

module.exports = CredentialsManager;
