const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Chrome Activity Log Reader
 * Reads extension activity from Chrome's SQLite database
 * 
 * The activity log is stored in a SQLite database when Chrome is launched
 * with --enable-extension-activity-logging flag
 */
class ActivityLogReader {
    constructor(profilePath) {
        this.profilePath = profilePath || this.getDefaultProfilePath();
        this.activities = [];
        this.lastReadTime = 0;
        this.pollInterval = null;
    }

    /**
     * Get default Chrome profile path based on OS
     */
    getDefaultProfilePath() {
        const platform = process.platform;
        const home = os.homedir();

        if (platform === 'win32') {
            return path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default');
        } else if (platform === 'darwin') {
            return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
        } else {
            // Linux
            return path.join(home, '.config', 'google-chrome', 'Default');
        }
    }

    /**
     * Find the activity log database file
     */
    findActivityDatabase() {
        const possiblePaths = [
            path.join(this.profilePath, 'Extension Activity'),
            path.join(this.profilePath, 'Extension Activity Database'),
            path.join(this.profilePath, 'extension_activity.db'),
        ];

        for (const dbPath of possiblePaths) {
            if (fs.existsSync(dbPath)) {
                return dbPath;
            }
        }

        // Search in Local Extension Settings
        const localExtSettings = path.join(this.profilePath, 'Local Extension Settings');
        if (fs.existsSync(localExtSettings)) {
            const dirs = fs.readdirSync(localExtSettings);
            for (const dir of dirs) {
                const dbPath = path.join(localExtSettings, dir, 'extension_activity.db');
                if (fs.existsSync(dbPath)) {
                    return dbPath;
                }
            }
        }

        return null;
    }

    /**
     * Copy database to temp location to avoid lock issues
     * Chrome keeps the database locked while running
     */
    copyDatabaseForReading(dbPath) {
        const tempPath = path.join(os.tmpdir(), `chrome_activity_${Date.now()}.db`);

        try {
            fs.copyFileSync(dbPath, tempPath);

            // Also copy WAL and SHM files if they exist
            const walPath = dbPath + '-wal';
            const shmPath = dbPath + '-shm';

            if (fs.existsSync(walPath)) {
                fs.copyFileSync(walPath, tempPath + '-wal');
            }
            if (fs.existsSync(shmPath)) {
                fs.copyFileSync(shmPath, tempPath + '-shm');
            }

            return tempPath;
        } catch (error) {
            console.error('Failed to copy database:', error.message);
            return null;
        }
    }

    /**
     * Read activities from the database
     */
    readActivities(tempDbPath) {
        const activities = [];

        try {
            // Dynamic import to handle if better-sqlite3 isn't installed
            const Database = require('better-sqlite3');
            const db = new Database(tempDbPath, { readonly: true });

            // Try different table names
            const tableNames = ['activitylog', 'activity_log', 'extension_activity'];

            for (const tableName of tableNames) {
                try {
                    const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY time DESC LIMIT 1000`).all();

                    for (const row of rows) {
                        activities.push({
                            extensionId: row.extension_id,
                            timestamp: new Date(row.time).toISOString(),
                            actionType: row.action_type,
                            apiName: row.api_name,
                            args: row.args,
                            pageUrl: row.page_url,
                            argUrl: row.arg_url
                        });
                    }
                    break;
                } catch (e) {
                    // Table doesn't exist, try next
                }
            }

            db.close();
        } catch (error) {
            console.error('Failed to read database:', error.message);
        }

        return activities;
    }

    /**
     * Get new activities since last read
     */
    getNewActivities() {
        const dbPath = this.findActivityDatabase();
        if (!dbPath) {
            return [];
        }

        const tempPath = this.copyDatabaseForReading(dbPath);
        if (!tempPath) {
            return [];
        }

        try {
            const activities = this.readActivities(tempPath);

            // Filter to only new activities
            const newActivities = activities.filter(a => {
                const time = new Date(a.timestamp).getTime();
                return time > this.lastReadTime;
            });

            if (newActivities.length > 0) {
                this.lastReadTime = Math.max(...newActivities.map(a => new Date(a.timestamp).getTime()));
                this.activities.push(...newActivities);
            }

            // Cleanup temp file
            try {
                fs.unlinkSync(tempPath);
                fs.unlinkSync(tempPath + '-wal').catch(() => { });
                fs.unlinkSync(tempPath + '-shm').catch(() => { });
            } catch (e) { }

            return newActivities;
        } catch (error) {
            return [];
        }
    }

    /**
     * Start polling for new activities
     */
    startPolling(intervalMs = 2000, callback) {
        this.lastReadTime = Date.now();
        this.activities = [];

        this.pollInterval = setInterval(() => {
            const newActivities = this.getNewActivities();
            if (newActivities.length > 0 && callback) {
                callback(newActivities);
            }
        }, intervalMs);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Get all collected activities
     */
    getAllActivities() {
        return this.activities;
    }

    /**
     * Analyze activities for suspicious patterns
     */
    analyzeSuspiciousActivities() {
        const suspicious = [];

        const suspiciousApis = [
            'cookies.get', 'cookies.getAll', 'cookies.set',
            'webRequest.onBeforeRequest', 'webRequest.onBeforeSendHeaders',
            'storage.sync.get', 'storage.local.get',
            'tabs.query', 'tabs.executeScript',
            'runtime.sendMessage', 'runtime.connect',
            'downloads.download',
            'history.search', 'bookmarks.getTree',
            'browsingData'
        ];

        for (const activity of this.activities) {
            if (suspiciousApis.some(api => activity.apiName?.includes(api))) {
                suspicious.push({
                    ...activity,
                    reason: `Sensitive API call: ${activity.apiName}`
                });
            }

            // Check for external URL access
            if (activity.argUrl && !activity.argUrl.startsWith('chrome://')) {
                suspicious.push({
                    ...activity,
                    reason: `External URL access: ${activity.argUrl}`
                });
            }
        }

        return suspicious;
    }
}

module.exports = ActivityLogReader;
