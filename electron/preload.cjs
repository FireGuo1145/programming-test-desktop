const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:settings:get'),
    saveSettings: settings => ipcRenderer.invoke('ai:settings:save', settings),
    complete: request => ipcRenderer.invoke('ai:complete', request),
    cancel: requestId => ipcRenderer.invoke('ai:cancel', requestId),
  },
  platform: process.platform,
  isElectron: true,
  request: request => ipcRenderer.invoke('student:request', request),
  config: () => ipcRenderer.invoke('student:config'),
  verification: sessionId => ipcRenderer.invoke('student:verification', sessionId),
})
