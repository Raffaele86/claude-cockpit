const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cockpit', {
  getToken: () => ipcRenderer.invoke('get-token'),
  startEngine: () => ipcRenderer.invoke('start-engine'),
  notify: (payload) => ipcRenderer.invoke('notify', payload),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  doctor: () => ipcRenderer.invoke('doctor'),
  updateRun: () => ipcRenderer.invoke('update-run'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateState: (cb) => { ipcRenderer.on('update-state', (_e, s) => cb(s)); },
});
