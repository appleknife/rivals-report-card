const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rivals', {
  importScreenshot: (image) => ipcRenderer.invoke('import-screenshot', image),
  captureImage: (rect, mode) => ipcRenderer.invoke('capture-image', rect, mode),
  readClipboardImage: () => ipcRenderer.invoke('read-clipboard-image'),
  getVersion: () => ipcRenderer.invoke('app-version'),
  onProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('import-progress', handler);
    return () => ipcRenderer.removeListener('import-progress', handler);
  }
});
