// Brücke zwischen Oberfläche und Windows-App (siehe web/platform.js).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find(a => a.startsWith('--klangwelt-version='));

contextBridge.exposeInMainWorld('klangweltDesktop', {
  version: versionArg ? versionArg.split('=')[1] : '',
  open: url => ipcRenderer.invoke('kw:open', url),
  getJson: url => ipcRenderer.invoke('kw:json', url),
  login: url => ipcRenderer.invoke('kw:login', url),
  cancelLogin: () => ipcRenderer.invoke('kw:cancel-login'),
  token: body => ipcRenderer.invoke('kw:token', body),
});
