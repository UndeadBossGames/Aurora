// Aurora - main (Node/Electron) process.
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./store');
const media = require('./media');
const lanshare = require('./lanshare');
const { Downloader } = require('./downloader');
const { Updater } = require('./updater');
const { DiscordPresence, buildActivity, LOGO_URL } = require('./discord');
const { Artwork } = require('./artwork');

app.setName('Aurora');
// Optional: AURORA_USER_DATA=<folder> (or a "data" folder next to Aurora.exe) = portable mode
const portable = process.env.AURORA_USER_DATA || (process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'AuroraData'));
if (portable) app.setPath('userData', portable);
if (process.platform === 'win32') app.setAppUserModelId('com.aurora.player');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(app.getPath('userData'), 'data');
const COVERS = path.join(app.getPath('userData'), 'covers');
const BIN = path.join(app.getPath('userData'), 'bin');
const CUSTOM = path.join(app.getPath('userData'), 'custom');
fs.mkdirSync(COVERS, { recursive: true });
fs.mkdirSync(CUSTOM, { recursive: true });

const store = new Store(DATA);
let win = null;
let downloader = null;
const updater = new Updater();
updater.on('progress', (p) => send('update:progress', p));
const presence = new DiscordPresence();
let artwork = null; // created once the data store exists
let npSeq = 0;
presence.on('status', (s) => send('discord:status', s));
const PKG = require(path.join(__dirname, '..', '..', 'package.json'));
const DISCORD_CLIENT_ID = (PKG.aurora && PKG.aurora.discordClientId) || '';

function ensureCustomFiles() {
  const css = path.join(CUSTOM, 'user.css');
  const js = path.join(CUSTOM, 'user.js');
  if (!fs.existsSync(css)) fs.writeFileSync(css, '/* Aurora custom styles.\n   Anything here is loaded after the built-in theme, so you can override any variable, e.g.\n   :root { --accent: #ff5fa2; }\n*/\n');
  if (!fs.existsSync(js)) fs.writeFileSync(js, '// Aurora custom script. Runs in the app window after it loads.\n// The full app API is available as window.Aurora (see src/renderer/js/app.js).\n');
}

function createWindow() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icon.png'));
  const bounds = store.read('window', { width: 1600, height: 900 });
  win = new BrowserWindow({
    ...bounds,
    minWidth: 860,
    minHeight: 600,
    show: false,
    backgroundColor: '#07080d',
    icon,
    title: 'Aurora',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#07080d', symbolColor: '#ffffff', height: 64 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  if (bounds.maximized) win.maximize();
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    const b = maximized ? store.read('window', {}) : win.getBounds();
    store.write('window', { ...b, maximized });
  };
  win.on('close', saveBounds);
  win.on('enter-full-screen', () => send('window:fullscreen', true));
  win.on('leave-full-screen', () => send('window:fullscreen', false));

  // Open external links in the user's browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); }
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ensureCustomFiles();
  downloader = new Downloader({ binDir: BIN, coversDir: COVERS });
  artwork = new Artwork(store);
  downloader.on('job', (j) => send('dl:job', j));
  downloader.on('file', (f) => send('dl:file', f));
  downloader.on('removed', (id) => send('dl:removed', id));
  downloader.on('cleared', () => send('dl:cleared'));
  downloader.on('tools', (t) => send('dl:tools', t));
  registerIpc();
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/embed/*', 'https://w.soundcloud.com/*'] },
    (details, cb) => { details.requestHeaders.Referer = 'https://aurora-player.app/'; cb({ requestHeaders: details.requestHeaders }); },
  );
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => presence.disconnect());

// ---------------- IPC ----------------
function registerIpc() {
  // generic JSON store (renderer owns the shape of the data)
  ipcMain.handle('store:read', (_e, name, fallback) => store.read(name, fallback));
  ipcMain.handle('store:write', (_e, name, data) => store.write(name, data));
  ipcMain.handle('store:remove', (_e, name) => store.remove(name));

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    userData: app.getPath('userData'),
    customDir: CUSTOM,
    coversDir: COVERS,
    music: app.getPath('music'),
    videos: app.getPath('videos'),
    downloads: app.getPath('downloads'),
    platform: process.platform,
  }));
  ipcMain.handle('app:customFiles', () => {
    ensureCustomFiles();
    const read = (f) => { try { return fs.readFileSync(path.join(CUSTOM, f), 'utf8'); } catch { return ''; } };
    return { css: read('user.css'), js: read('user.js') };
  });
  ipcMain.handle('app:saveCustomCss', (_e, css) => { fs.writeFileSync(path.join(CUSTOM, 'user.css'), css); return true; });
  ipcMain.handle('app:devtools', () => win && win.webContents.toggleDevTools());
  ipcMain.handle('app:reload', () => win && win.webContents.reload());
  ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('window:fullscreen', (_e, on) => win && win.setFullScreen(on === undefined ? !win.isFullScreen() : !!on));
  ipcMain.handle('window:overlay', (_e, color) => { try { win.setTitleBarOverlay({ color, symbolColor: '#ffffff', height: 64 }); } catch {} });

  // dialogs
  ipcMain.handle('dialog:folder', async (_e, title) => {
    const r = await dialog.showOpenDialog(win, { title: title || 'Choose folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:files', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Add music or videos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Media', extensions: media.MEDIA_EXT.map((e) => e.slice(1)) }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:image', async () => {
    // Return the raw file as a data URL; the UI crops/resizes it with Chromium, which can decode
    // WebP, GIF, AVIF, BMP, etc. (nativeImage on Windows only reads PNG/JPEG, which made some photos silently fail).
    const r = await dialog.showOpenDialog(win, { title: 'Choose a photo', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'jfif'] }] });
    if (r.canceled) return null;
    const f = r.filePaths[0];
    const stat = fs.statSync(f);
    if (stat.size > 25 * 1024 * 1024) throw new Error('That image is too large (max 25 MB).');
    const ext = path.extname(f).slice(1).toLowerCase();
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' }[ext] || 'image/png';
    return `data:${mime};base64,${fs.readFileSync(f).toString('base64')}`;
  });
  ipcMain.handle('dialog:confirm', async (_e, { message, detail, ok = 'OK' }) => {
    const r = await dialog.showMessageBox(win, { type: 'question', buttons: [ok, 'Cancel'], defaultId: 0, cancelId: 1, message, detail });
    return r.response === 0;
  });

  // library
  ipcMain.handle('library:scan', (_e, dir) => media.scanFolder(dir, COVERS));
  ipcMain.handle('library:readFiles', (_e, files) =>
    files.filter((f) => media.MEDIA_EXT.includes(path.extname(f).toLowerCase()) && fs.existsSync(f)).map((f) => media.readTrack(f, COVERS)));
  ipcMain.handle('library:exists', (_e, files) => files.map((f) => fs.existsSync(f)));
  ipcMain.handle('library:saveCover', (_e, id, dataUrl) => {
    const m = String(dataUrl).match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
    if (!m) return null;
    const out = path.join(COVERS, `${id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    fs.writeFileSync(out, Buffer.from(m[2], 'base64'));
    return out;
  });
  // Friend sharing: read a song's bytes to send to a friend, and save one a friend sent us.
  ipcMain.handle('library:stat', (_e, file) => { const st = fs.statSync(file); return { size: st.size }; });
  ipcMain.handle('lan:offer', (_e, file) => lanshare.offer(file));
  ipcMain.handle('library:readBytes', (_e, file) => {
    const st = fs.statSync(file);
    if (st.size > 400 * 1024 * 1024) throw new Error('This file is too large to send over the internet (max 400 MB).');
    return new Uint8Array(fs.readFileSync(file));
  });
  ipcMain.handle('library:saveIncoming', (_e, { name, bytes, dir }) => {
    const base = path.join(dir || app.getPath('music'), 'From friends');
    fs.mkdirSync(base, { recursive: true });
    const safe = String(name || 'song').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 150) || 'song';
    const ext = path.extname(safe), stem = safe.slice(0, safe.length - ext.length);
    if (!media.MEDIA_EXT.includes(ext.toLowerCase())) throw new Error('Not a music or video file.');
    let out = path.join(base, safe), n = 1;
    while (fs.existsSync(out)) out = path.join(base, `${stem} (${n++})${ext}`);
    fs.writeFileSync(out, Buffer.from(bytes));
    return media.readTrack(out, COVERS);
  });
  ipcMain.handle('library:deleteFile', async (_e, file) => {
    try { await shell.trashItem(file); return true; } catch { return false; }
  });

  // shell
  ipcMain.handle('shell:showItem', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
  ipcMain.handle('shell:openExternal', (_e, url) => /^https?:/i.test(url) && shell.openExternal(url));

  // downloader
  ipcMain.handle('dl:add', (_e, opts) => downloader.add(opts));
  ipcMain.handle('dl:setConcurrency', (_e, n) => { downloader.maxConcurrent = Math.max(1, Math.min(8, n | 0)); downloader.pump(); return downloader.maxConcurrent; });
  ipcMain.handle('dl:search', (_e, q, source, limit) => downloader.search(q, source, limit));
  ipcMain.handle('dl:list', () => downloader.list());
  ipcMain.handle('dl:cancel', (_e, id) => downloader.cancel(id));
  ipcMain.handle('dl:retry', (_e, id) => downloader.retry(id));
  ipcMain.handle('dl:remove', (_e, id) => downloader.remove(id));
  ipcMain.handle('dl:clear', () => downloader.clearFinished());
  ipcMain.handle('dl:tools', () => downloader.tools());
  ipcMain.handle('dl:updateYtdlp', () => downloader.updateYtdlp());
  ipcMain.handle('dl:installFfmpeg', () => downloader.installFfmpeg());

  // updates
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:download', () => updater.download());
  ipcMain.handle('update:install', () => updater.install());
  ipcMain.handle('update:state', () => ({ ready: updater.ready || null, info: updater.info || null, downloading: !!updater.downloading }));

  // Album / artist artwork lookup (shared by Discord and Friends)
  ipcMain.handle('art:lookup', (_e, title, artist) => (artwork ? artwork.lookup(title, artist) : { album: null, artist: null }));

  // Discord Connection
  ipcMain.handle('discord:configure', (_e, { enabled, clientId }) => presence.configure({ enabled, clientId: clientId || DISCORD_CLIENT_ID }));
  ipcMain.handle('discord:status', () => ({ ...presence.status(), defaultClientId: DISCORD_CLIENT_ID }));
  ipcMain.handle('discord:nowPlaying', async (_e, np, opts = {}) => {
    const seq = ++npSeq;
    let art = { album: null, artist: null };
    if (np && np.title && opts.lookupArt !== false && artwork) {
      art = await artwork.lookup(np.title, np.artist);
      if (seq !== npSeq) return { art, logo: LOGO_URL }; // a newer song started meanwhile
      np = { ...np, albumArtUrl: art.album, artistImageUrl: art.artist };
    }
    presence.setActivity(buildActivity(np, opts));
    return { art, logo: LOGO_URL };
  });
}
