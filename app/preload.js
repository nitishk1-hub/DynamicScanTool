const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // File operations
    selectFile: () => ipcRenderer.invoke('select-file'),

    // CRX Analysis
    analyzeExtension: (filePath) => ipcRenderer.invoke('analyze-extension', filePath),

    // Browser Testing
    startTesting: (options) => ipcRenderer.invoke('start-testing', options),
    stopTesting: () => ipcRenderer.invoke('stop-testing'),
    getStatus: () => ipcRenderer.invoke('get-status'),
    getRealTimeStats: () => ipcRenderer.invoke('get-realtime-stats'),
    exportHAR: () => ipcRenderer.invoke('export-har'),

    // Automation
    getAutomationTemplates: () => ipcRenderer.invoke('get-automation-templates'),
    runAutomation: (script, options) => ipcRenderer.invoke('run-automation', script, options),
    stopAutomation: () => ipcRenderer.invoke('stop-automation'),

    // Reports
    getReports: () => ipcRenderer.invoke('get-reports'),
    openReport: (id) => ipcRenderer.invoke('open-report', id),
    exportReport: (id) => ipcRenderer.invoke('export-report', id),

    // Utility
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Events
    onAutomationLog: (callback) => {
        ipcRenderer.on('automation-log', (event, data) => callback(data));
    },
    onStatusUpdate: (callback) => {
        ipcRenderer.on('status-update', (event, data) => callback(data));
    },

    // Credentials Management
    getCredentials: () => ipcRenderer.invoke('get-credentials'),
    setDefaultCredentials: (creds) => ipcRenderer.invoke('set-default-credentials', creds),
    setSiteCredentials: (data) => ipcRenderer.invoke('set-site-credentials', data),
    removeSiteCredentials: (site) => ipcRenderer.invoke('remove-site-credentials', site),
    importCredentials: () => ipcRenderer.invoke('import-credentials'),
    exportCredentials: () => ipcRenderer.invoke('export-credentials'),
    clearCredentials: () => ipcRenderer.invoke('clear-credentials'),
    getCredentialsForUrl: (url) => ipcRenderer.invoke('get-credentials-for-url', url)
});
