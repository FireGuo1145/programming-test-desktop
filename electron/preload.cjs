const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  isElectron: true,
  request: request => ipcRenderer.invoke('student:request', request),
  config: () => ipcRenderer.invoke('student:config'),
  verification: sessionId => ipcRenderer.invoke('student:verification', sessionId),
})
