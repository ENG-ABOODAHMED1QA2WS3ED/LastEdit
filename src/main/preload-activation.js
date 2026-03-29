const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseAPI', {
    getMachineId: () => ipcRenderer.invoke('license-get-machine-id'),
    checkLicense: () => ipcRenderer.invoke('license-check'),
    activate: (key) => ipcRenderer.invoke('license-activate', key),
    enterApp: () => ipcRenderer.invoke('license-enter-app')
});
