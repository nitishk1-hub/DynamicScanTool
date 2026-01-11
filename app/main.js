const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const CRXAnalyzer = require('./analyzer');
const BrowserMonitor = require('./monitor');
const CredentialsManager = require('./test-credentials');

let mainWindow;
let analyzer;
let monitor;
let credentialsManager;

// Data directory
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        titleBarStyle: 'default',
        show: false
    });

    mainWindow.loadFile('ui/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (monitor) {
            monitor.stop();
        }
    });

    // Create directories first
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    // Initialize services (after directories exist)
    analyzer = new CRXAnalyzer(DATA_DIR);
    monitor = new BrowserMonitor(DATA_DIR);
    credentialsManager = new CredentialsManager(DATA_DIR);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (monitor) monitor.stop();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ============ IPC HANDLERS ============

// Select CRX/ZIP file
ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Chrome Extension', extensions: ['crx', 'zip'] }
        ]
    });

    if (result.canceled) return null;
    return result.filePaths[0];
});

// Analyze extension
ipcMain.handle('analyze-extension', async (event, filePath) => {
    try {
        const result = await analyzer.analyze(filePath);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Start browser testing
ipcMain.handle('start-testing', async (event, options) => {
    try {
        await monitor.start(options);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Stop browser testing
ipcMain.handle('stop-testing', async () => {
    try {
        const report = await monitor.stop();
        return { success: true, data: report };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Get testing status
ipcMain.handle('get-status', async () => {
    return {
        isRunning: monitor ? monitor.isRunning : false,
        stats: monitor ? monitor.getStats() : null
    };
});

// Get real-time dashboard stats
ipcMain.handle('get-realtime-stats', async () => {
    return monitor ? monitor.getRealTimeStats() : null;
});

// Export HAR file
ipcMain.handle('export-har', async () => {
    try {
        if (!monitor) return { success: false, error: 'Monitor not running' };

        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `session-${monitor.sessionId || 'unknown'}.har`,
            filters: [{ name: 'HAR', extensions: ['har'] }]
        });

        if (result.canceled) return { success: false };

        const harPath = await monitor.exportHAR(result.filePath);
        return { success: true, path: harPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Get automation templates
ipcMain.handle('get-automation-templates', async () => {
    return monitor ? monitor.getAutomationTemplates() : [];
});

// Run automation
ipcMain.handle('run-automation', async (event, script, options = {}) => {
    try {
        const logs = await monitor.runAutomation(script, (entry) => {
            // Send real-time log updates
            if (mainWindow) {
                mainWindow.webContents.send('automation-log', entry);
            }
        }, options);
        return { success: true, logs };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Stop automation
ipcMain.handle('stop-automation', async () => {
    if (monitor) {
        monitor.stopAutomation();
    }
    return { success: true };
});

// Get reports list
ipcMain.handle('get-reports', async () => {
    try {
        const files = fs.readdirSync(REPORTS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filePath = path.join(REPORTS_DIR, f);
                const stats = fs.statSync(filePath);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                return {
                    id: f.replace('.json', ''),
                    name: content.name || f,
                    date: stats.mtime,
                    stats: content.stats
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        return files;
    } catch (error) {
        return [];
    }
});

// Open report
ipcMain.handle('open-report', async (event, reportId) => {
    try {
        const filePath = path.join(REPORTS_DIR, `${reportId}.json`);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return { success: true, data: content };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Export report
ipcMain.handle('export-report', async (event, reportId) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `report-${reportId}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (result.canceled) return { success: false };

        const srcPath = path.join(REPORTS_DIR, `${reportId}.json`);
        fs.copyFileSync(srcPath, result.filePath);

        return { success: true, path: result.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Open external link
ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url);
});

// ============ CREDENTIALS MANAGEMENT ============

// Get all credentials (masked passwords)
ipcMain.handle('get-credentials', async () => {
    return credentialsManager.getAllCredentials();
});

// Set default credentials
ipcMain.handle('set-default-credentials', async (event, { email, username, password }) => {
    credentialsManager.setDefault(email, username, password);
    return { success: true };
});

// Set site-specific credentials
ipcMain.handle('set-site-credentials', async (event, { site, email, username, password }) => {
    credentialsManager.setSiteCredentials(site, { email, username, password });
    return { success: true };
});

// Remove site credentials
ipcMain.handle('remove-site-credentials', async (event, site) => {
    credentialsManager.removeSiteCredentials(site);
    return { success: true };
});

// Import credentials from file
ipcMain.handle('import-credentials', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (result.canceled) return { success: false, canceled: true };

        const data = fs.readFileSync(result.filePaths[0], 'utf8');
        const importResult = credentialsManager.importFromJson(data);
        return importResult;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Export credentials to file
ipcMain.handle('export-credentials', async () => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: 'test-credentials.json',
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (result.canceled) return { success: false };

        const data = credentialsManager.exportToJson();
        fs.writeFileSync(result.filePath, data);
        return { success: true, path: result.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Clear all credentials
ipcMain.handle('clear-credentials', async () => {
    credentialsManager.clearAll();
    return { success: true };
});

// Get credentials for a specific URL (for automation)
ipcMain.handle('get-credentials-for-url', async (event, url) => {
    return credentialsManager.getCredentialsForUrl(url);
});
