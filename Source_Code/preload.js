const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ---- App lifecycle ----
  quitApp: () => ipcRenderer.send('quit-app'),

  // ---- Auto-updater ----
  startUpdateDownload: () => ipcRenderer.invoke('updater-download-update'),
  checkForUpdates: () => ipcRenderer.invoke('updater-check-for-updates'),
  onUpdaterEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater-event', handler);
    return () => ipcRenderer.removeListener('updater-event', handler);
  },

  // ---- Offline System ----
  offline: {
    /** Run initial sync after login (downloads patients, visits, images) */
    initialSync: (authToken, clinic, user) =>
      ipcRenderer.invoke('offline-initial-sync', { authToken, clinic, user }),

    /** Start the adaptive background sync loop */
    startSync: (authToken) =>
      ipcRenderer.invoke('offline-start-sync', { authToken }),

    /** Stop the background sync loop */
    stopSync: () =>
      ipcRenderer.invoke('offline-stop-sync'),

    /** Trigger an immediate sync (e.g., after a write or network regained) */
    triggerSync: (reason) =>
      ipcRenderer.invoke('offline-trigger-sync', { reason }),

    /** Execute a database method on the offline SQLite DB */
    dbQuery: (method, ...args) =>
      ipcRenderer.invoke('offline-db-query', { method, args }),

    /** Resolve a Cloudinary URL to a local file:// URL */
    resolveImage: (cloudUrl) =>
      ipcRenderer.invoke('offline-image-resolve', { cloudUrl }),

    /** Get offline system statistics (cache size, queue counts, recent logs) */
    getStats: () =>
      ipcRenderer.invoke('offline-get-stats'),

    /** Get sync logs for audit trail */
    getSyncLogs: (limit) =>
      ipcRenderer.invoke('offline-get-sync-logs', { limit }),

    /** Record user activity (resets adaptive sync timer to active mode) */
    recordActivity: () =>
      ipcRenderer.send('offline-user-activity'),

    /** Listen for sync status updates */
    onSyncStatus: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('sync-status', handler);
      return () => ipcRenderer.removeListener('sync-status', handler);
    },

    /** Listen for sync conflict notifications */
    onSyncNotification: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('sync-notification', handler);
      return () => ipcRenderer.removeListener('sync-notification', handler);
    },
  },
});
