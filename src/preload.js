// Bridge between the UI (renderer) and the main process.
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { pathToFileURL } = require('url');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('native', {
  fileUrl: (p) => (p ? pathToFileURL(p).href : ''),
  pathForFile: (file) => webUtils.getPathForFile(file),
  store: { read: invoke('store:read'), write: invoke('store:write'), remove: invoke('store:remove') },
  app: {
    info: invoke('app:info'),
    customFiles: invoke('app:customFiles'),
    saveCustomCss: invoke('app:saveCustomCss'),
    devtools: invoke('app:devtools'),
    reload: invoke('app:reload'),
    relaunch: invoke('app:relaunch'),
    quit: invoke('app:quit'),
    fullscreen: invoke('window:fullscreen'),
    overlay: invoke('window:overlay'),
    onFullscreen: on('window:fullscreen'),
  },
  dialog: {
    folder: invoke('dialog:folder'),
    files: invoke('dialog:files'),
    image: invoke('dialog:image'),
    confirm: invoke('dialog:confirm'),
  },
  library: {
    scan: invoke('library:scan'),
    readFiles: invoke('library:readFiles'),
    exists: invoke('library:exists'),
    saveCover: invoke('library:saveCover'),
    deleteFile: invoke('library:deleteFile'),
    readBytes: invoke('library:readBytes'),
    stat: invoke('library:stat'),
    saveIncoming: invoke('library:saveIncoming'),
  },
  shell: { showItem: invoke('shell:showItem'), openPath: invoke('shell:openPath'), openExternal: invoke('shell:openExternal') },
  art: { lookup: invoke('art:lookup') },
  lan: { offer: invoke('lan:offer') },
  discord: {
    configure: invoke('discord:configure'),
    status: invoke('discord:status'),
    nowPlaying: invoke('discord:nowPlaying'),
    onStatus: on('discord:status'),
  },
  update: {
    check: invoke('update:check'),
    download: invoke('update:download'),
    install: invoke('update:install'),
    state: invoke('update:state'),
    onProgress: on('update:progress'),
  },
  dl: {
    add: invoke('dl:add'),
    setConcurrency: invoke('dl:setConcurrency'),
    search: invoke('dl:search'),
    list: invoke('dl:list'),
    cancel: invoke('dl:cancel'),
    retry: invoke('dl:retry'),
    remove: invoke('dl:remove'),
    clear: invoke('dl:clear'),
    tools: invoke('dl:tools'),
    updateYtdlp: invoke('dl:updateYtdlp'),
    installFfmpeg: invoke('dl:installFfmpeg'),
    onJob: on('dl:job'),
    onFile: on('dl:file'),
    onRemoved: on('dl:removed'),
    onCleared: on('dl:cleared'),
    onTools: on('dl:tools'),
  },
});
