const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');

class CRXAnalyzer {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.extractDir = path.join(dataDir, 'extracted');

        if (!fs.existsSync(this.extractDir)) {
            fs.mkdirSync(this.extractDir, { recursive: true });
        }

        // Risk patterns
        this.dangerousPermissions = [
            'cookies', 'webRequest', 'webRequestBlocking', '<all_urls>',
            'debugger', 'nativeMessaging', 'proxy', 'privacy', 'downloads',
            'history', 'browsingData', 'management', 'clipboardRead', 'clipboardWrite'
        ];

        this.suspiciousPatterns = [
            { pattern: /eval\s*\(/g, description: 'Dynamic code execution (eval)', risk: 15 },
            { pattern: /new\s+Function\s*\(/g, description: 'Dynamic function creation', risk: 15 },
            { pattern: /document\.write/g, description: 'Document write (XSS risk)', risk: 10 },
            { pattern: /innerHTML\s*=/g, description: 'innerHTML manipulation', risk: 8 },
            { pattern: /chrome\.cookies/g, description: 'Cookie access', risk: 12 },
            { pattern: /chrome\.webRequest/g, description: 'Web request interception', risk: 10 },
            { pattern: /atob\s*\(|btoa\s*\(/g, description: 'Base64 encoding/decoding', risk: 5 },
            { pattern: /XMLHttpRequest|fetch\s*\(/g, description: 'Network requests', risk: 5 },
            { pattern: /localStorage|sessionStorage/g, description: 'Storage access', risk: 5 },
            { pattern: /password|passwd|secret|token|api.?key/gi, description: 'Sensitive data keywords', risk: 10 },
            { pattern: /webhook|discord\.com|telegram/gi, description: 'External messaging services', risk: 20 },
            { pattern: /crypto|wallet|bitcoin|ethereum/gi, description: 'Cryptocurrency references', risk: 15 },
            { pattern: /keylog|keystroke/gi, description: 'Keylogging patterns', risk: 25 },
        ];
    }

    async analyze(filePath) {
        const id = uuidv4();
        const extractPath = path.join(this.extractDir, id);

        try {
            // Extract the extension
            await this.extract(filePath, extractPath);

            // Read manifest
            const manifestPath = path.join(extractPath, 'manifest.json');
            if (!fs.existsSync(manifestPath)) {
                throw new Error('manifest.json not found');
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            // Analyze
            const result = {
                id,
                name: manifest.name || 'Unknown',
                version: manifest.version || '0.0.0',
                description: manifest.description || '',
                manifestVersion: manifest.manifest_version,

                // Permission analysis
                permissions: this.analyzePermissions(manifest),

                // Code analysis
                codeAnalysis: await this.analyzeCode(extractPath),

                // Files
                files: this.listFiles(extractPath),

                // Overall risk
                riskScore: 0,
                riskLevel: 'low'
            };

            // Calculate risk score
            result.riskScore = this.calculateRiskScore(result);
            result.riskLevel = this.getRiskLevel(result.riskScore);

            // Cleanup
            this.cleanup(extractPath);

            return result;

        } catch (error) {
            this.cleanup(extractPath);
            throw error;
        }
    }

    async extract(filePath, destPath) {
        fs.mkdirSync(destPath, { recursive: true });

        const buffer = fs.readFileSync(filePath);

        // Check if CRX format
        if (buffer.slice(0, 4).toString() === 'Cr24') {
            // CRX3 format
            const version = buffer.readUInt32LE(4);
            let zipStart;

            if (version === 3) {
                const headerSize = buffer.readUInt32LE(8);
                zipStart = 12 + headerSize;
            } else if (version === 2) {
                const pubKeyLen = buffer.readUInt32LE(8);
                const sigLen = buffer.readUInt32LE(12);
                zipStart = 16 + pubKeyLen + sigLen;
            } else {
                zipStart = 0;
            }

            const zipBuffer = buffer.slice(zipStart);
            const zip = new AdmZip(zipBuffer);
            zip.extractAllTo(destPath, true);
        } else {
            // Regular ZIP
            const zip = new AdmZip(filePath);
            zip.extractAllTo(destPath, true);
        }
    }

    analyzePermissions(manifest) {
        const permissions = [
            ...(manifest.permissions || []),
            ...(manifest.optional_permissions || []),
            ...(manifest.host_permissions || [])
        ];

        return permissions.map(perm => {
            const isDangerous = this.dangerousPermissions.some(d =>
                perm.includes(d) || perm === '<all_urls>'
            );

            return {
                name: perm,
                risk: isDangerous ? 'high' : 'low',
                description: this.getPermissionDescription(perm)
            };
        });
    }

    getPermissionDescription(perm) {
        const descriptions = {
            'cookies': 'Read and modify cookies',
            'webRequest': 'Monitor network requests',
            'webRequestBlocking': 'Block/modify network requests',
            '<all_urls>': 'Access all websites',
            'tabs': 'Access browser tabs',
            'storage': 'Store local data',
            'clipboardRead': 'Read clipboard',
            'clipboardWrite': 'Write to clipboard',
            'downloads': 'Manage downloads',
            'history': 'Access browsing history',
            'nativeMessaging': 'Communicate with native apps',
            'management': 'Manage other extensions'
        };

        return descriptions[perm] || 'Custom permission';
    }

    async analyzeCode(extractPath) {
        const findings = [];
        const jsFiles = this.findFiles(extractPath, ['.js', '.html']);

        for (const file of jsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(extractPath, file);

            for (const { pattern, description, risk } of this.suspiciousPatterns) {
                const matches = content.match(pattern);
                if (matches) {
                    findings.push({
                        file: relativePath,
                        pattern: description,
                        count: matches.length,
                        risk,
                        sample: this.getSample(content, pattern)
                    });
                }
            }
        }

        return findings;
    }

    getSample(content, pattern) {
        const match = content.match(pattern);
        if (match) {
            const index = content.indexOf(match[0]);
            const start = Math.max(0, index - 20);
            const end = Math.min(content.length, index + match[0].length + 20);
            return '...' + content.slice(start, end).replace(/\s+/g, ' ') + '...';
        }
        return '';
    }

    findFiles(dir, extensions) {
        const files = [];

        const walk = (currentDir) => {
            const items = fs.readdirSync(currentDir);
            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    walk(fullPath);
                } else if (extensions.some(ext => item.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        };

        walk(dir);
        return files;
    }

    listFiles(dir) {
        const files = [];

        const walk = (currentDir, prefix = '') => {
            const items = fs.readdirSync(currentDir);
            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);
                const relativePath = prefix ? `${prefix}/${item}` : item;

                if (stat.isDirectory()) {
                    walk(fullPath, relativePath);
                } else {
                    files.push({
                        path: relativePath,
                        size: stat.size
                    });
                }
            }
        };

        walk(dir);
        return files;
    }

    calculateRiskScore(result) {
        let score = 0;

        // Permission risks
        for (const perm of result.permissions) {
            if (perm.risk === 'high') score += 10;
        }

        // Code findings
        for (const finding of result.codeAnalysis) {
            score += finding.risk;
        }

        return Math.min(100, score);
    }

    getRiskLevel(score) {
        if (score >= 60) return 'critical';
        if (score >= 40) return 'high';
        if (score >= 20) return 'medium';
        return 'low';
    }

    cleanup(dir) {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
}

module.exports = CRXAnalyzer;
