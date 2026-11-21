// Brücke zwischen Oberfläche und Windows-App (siehe web/platform.js).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find(a => a.startsWith('--klangraum-version='));

contextBridge.exposeInMainWorld('klangraumDesktop', {
  version: versionArg ? versionArg.split('=')[1] : '',
  login: url => ipcRenderer.invoke('kr:login', url),
  cancelLogin: () => ipcRenderer.invoke('kr:cancel-login'),
  token: body => ipcRenderer.invoke('kr:token', body),
  open: url => ipcRenderer.invoke('kr:open', url),
});
