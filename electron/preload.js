// Preload script для Electron - обеспечивает безопасность
/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  version: process.versions.electron,
  platform: process.platform,
  // IPC handlers for main process communication
  onSyncCheckNow: (callback) => ipcRenderer.on('sync-check-now', callback),
  onNavigateToSettings: (callback) => ipcRenderer.on('navigate-to-settings', callback),
  // Remove listeners when needed
  removeSyncCheckNowListener: (callback) => ipcRenderer.removeListener('sync-check-now', callback),
  removeNavigateToSettingsListener: (callback) => ipcRenderer.removeListener('navigate-to-settings', callback),
});
