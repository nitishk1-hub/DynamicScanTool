/**
 * Chrome Monitor - Activity Logger Extension
 * Captures all extension API activity and sends to the main app via WebSocket
 */

const WEBSOCKET_PORT = 9333;
let ws = null;
let activityLog = [];
let isConnected = false;

// Connect to the main app
function connectToApp() {
    try {
        ws = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}`);

        ws.onopen = () => {
            console.log('[Chrome Monitor] Connected to app');
            isConnected = true;
            sendBufferedLogs();
        };

        ws.onclose = () => {
            console.log('[Chrome Monitor] Disconnected, reconnecting...');
            isConnected = false;
            setTimeout(connectToApp, 3000);
        };

        ws.onerror = (err) => {
            console.log('[Chrome Monitor] Connection error');
            isConnected = false;
        };
    } catch (e) {
        setTimeout(connectToApp, 3000);
    }
}

// Send buffered logs
function sendBufferedLogs() {
    if (isConnected && ws && activityLog.length > 0) {
        const logsToSend = [...activityLog];
        activityLog = [];

        ws.send(JSON.stringify({
            type: 'activity_batch',
            activities: logsToSend
        }));
    }
}

// Log activity
function logActivity(type, name, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        type: type,
        apiName: name,
        ...details
    };

    activityLog.push(entry);

    // Send immediately if connected
    if (isConnected && ws) {
        try {
            ws.send(JSON.stringify({
                type: 'activity',
                activity: entry
            }));
        } catch (e) {
            // Will send later
        }
    }

    console.log(`[Activity] ${type}: ${name}`, details);
}

// ============ ACTIVITY LOG PRIVATE API ============
// This requires Chrome built with activity logging enabled
if (chrome.activityLogPrivate) {
    chrome.activityLogPrivate.onExtensionActivity.addListener((activity) => {
        logActivity('api_call', activity.activityType, {
            extensionId: activity.extensionId,
            apiCall: activity.apiCall,
            args: activity.args,
            pageUrl: activity.pageUrl,
            argUrl: activity.argUrl
        });
    });
    console.log('[Chrome Monitor] activityLogPrivate listener registered');
} else {
    console.log('[Chrome Monitor] activityLogPrivate not available, using fallback methods');
}

// ============ FALLBACK MONITORING ============

// Monitor extension installations/updates
chrome.management.onInstalled.addListener((info) => {
    logActivity('lifecycle', 'extension.installed', {
        extensionId: info.id,
        name: info.name,
        version: info.version,
        type: info.type
    });
});

chrome.management.onUninstalled.addListener((id) => {
    logActivity('lifecycle', 'extension.uninstalled', {
        extensionId: id
    });
});

chrome.management.onEnabled.addListener((info) => {
    logActivity('lifecycle', 'extension.enabled', {
        extensionId: info.id,
        name: info.name
    });
});

chrome.management.onDisabled.addListener((info) => {
    logActivity('lifecycle', 'extension.disabled', {
        extensionId: info.id,
        name: info.name
    });
});

// Monitor storage changes (captures chrome.storage.* calls)
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (const key in changes) {
        logActivity('api_call', `storage.${namespace}.set`, {
            key: key,
            oldValue: changes[key].oldValue ? '[set]' : '[empty]',
            newValue: changes[key].newValue ? '[set]' : '[empty]'
        });
    }
});

// Monitor cookie changes (captures chrome.cookies.* calls)
chrome.cookies.onChanged.addListener((changeInfo) => {
    logActivity('api_call', changeInfo.removed ? 'cookies.remove' : 'cookies.set', {
        cookie: changeInfo.cookie.name,
        domain: changeInfo.cookie.domain,
        cause: changeInfo.cause
    });
});

// Monitor tab events
chrome.tabs.onCreated.addListener((tab) => {
    logActivity('api_event', 'tabs.onCreated', {
        tabId: tab.id,
        url: tab.url || tab.pendingUrl
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        logActivity('api_event', 'tabs.onUpdated', {
            tabId: tabId,
            url: changeInfo.url || tab.url,
            status: changeInfo.status
        });
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    logActivity('api_event', 'tabs.onRemoved', {
        tabId: tabId
    });
});

// Monitor web requests
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (details.initiator && details.initiator.startsWith('chrome-extension://')) {
            logActivity('api_call', 'webRequest.onBeforeRequest', {
                url: details.url.substring(0, 100),
                method: details.method,
                type: details.type,
                initiator: details.initiator
            });
        }
    },
    { urls: ['<all_urls>'] }
);

chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.initiator && details.initiator.startsWith('chrome-extension://')) {
            logActivity('api_call', 'webRequest.onCompleted', {
                url: details.url.substring(0, 100),
                statusCode: details.statusCode,
                initiator: details.initiator
            });
        }
    },
    { urls: ['<all_urls>'] }
);

// Monitor runtime messages between extensions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logActivity('api_call', 'runtime.onMessage', {
        from: sender.id || 'unknown',
        url: sender.url,
        message: typeof message === 'object' ? JSON.stringify(message).substring(0, 100) : String(message).substring(0, 100)
    });
});

chrome.runtime.onConnect.addListener((port) => {
    logActivity('api_call', 'runtime.onConnect', {
        name: port.name,
        from: port.sender?.id
    });
});

// Get list of all installed extensions on startup
async function logInstalledExtensions() {
    const extensions = await chrome.management.getAll();

    for (const ext of extensions) {
        if (ext.type === 'extension' && ext.enabled && ext.id !== chrome.runtime.id) {
            logActivity('lifecycle', 'extension.detected', {
                extensionId: ext.id,
                name: ext.name,
                version: ext.version,
                permissions: ext.permissions
            });
        }
    }
}

// Periodic flush of logs
setInterval(() => {
    if (activityLog.length > 0) {
        sendBufferedLogs();
    }
}, 2000);

// Initialize
console.log('[Chrome Monitor] Activity Logger started');
logInstalledExtensions();
connectToApp();
