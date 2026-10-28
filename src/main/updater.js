// "Check for updates": looks at the latest GitHub Release of Aurora, and if it is newer than
// this build, downloads the installer and runs it. User data in %APPDATA%\Aurora is kept.
const { app, net, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const OWNER_REPO = 'UndeadBossGames/Aurora';
const UA = 'Aurora-Updater';

function parseVersion(v) {
  return String(v || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
}
function isNewer(latest, current) {
  const a = parseVersion(latest), b = parseVersion(current);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

class Updater extends EventEmitter {
  constructor() {
    super();
    this.info = null;
    this.downloading = null;
  }

  get current() { return app.getVersion(); }

  async check() {
    let info;
    try {
      info = await this.fromApi();
    } catch (e) {
      // API rate-limited or blocked: fall back to the public "latest release" redirect
      info = await this.fromRedirect();
    }
    info.current = this.current;
    info.newer = isNewer(info.latest, info.current);
    info.checkedAt = Date.now();
    this.info = info;
    return info;
  }

  async fromApi() {
    const res = await net.fetch(`https://api.github.com/repos/${OWNER_REPO}/releases/latest`, {
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
    });
    if (res.status === 404) return { latest: this.current, notes: '', url: `https://github.com/${OWNER_REPO}/releases`, asset: null, none: true };
    if (!res.ok) throw new Error('GitHub API ' + res.status);
    const r = await res.json();
    const asset = (r.assets || []).find((a) => /\.exe$/i.test(a.name) && /setup/i.test(a.name)) || (r.assets || []).find((a) => /\.exe$/i.test(a.name));
    return {
      latest: (r.tag_name || '').replace(/^v/i, ''),
      name: r.name || r.tag_name,
      notes: r.body || '',
      url: r.html_url,
      publishedAt: r.published_at,
      asset: asset ? { name: asset.name, size: asset.size, url: asset.browser_download_url } : null,
    };
  }

  async fromRedirect() {
    const res = await net.fetch(`https://github.com/${OWNER_REPO}/releases/latest`, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const m = (res.url || '').match(/\/releases\/tag\/v?([^/?#]+)/);
    if (!m) throw new Error('No releases published yet');
    const v = decodeURIComponent(m[1]);
    const name = `Aurora-Setup-${v}.exe`;
    return { latest: v, name: 'v' + v, notes: '', url: res.url, asset: { name, size: 0, url: `https://github.com/${OWNER_REPO}/releases/download/v${v}/${name}` } };
  }

  async downloadAndInstall() {
    if (this.downloading) return this.downloading;
    if (!this.info) await this.check();
    const info = this.info;
    if (!info.asset) {
      shell.openExternal(info.url);
      throw new Error('This release has no installer attached yet. The release page was opened in your browser.');
    }
    this.downloading = (async () => {
      const dest = path.join(app.getPath('temp'), info.asset.name);
      const res = await net.fetch(info.asset.url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
      const total = Number(res.headers.get('content-length')) || info.asset.size || 0;
      const out = fs.createWriteStream(dest);
      const reader = res.body.getReader();
      let got = 0, last = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
        if (Date.now() - last > 150) { last = Date.now(); this.emit('progress', { got, total, ratio: total ? got / total : 0 }); }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      this.emit('progress', { got, total, ratio: 1, done: true });
      if (process.platform !== 'win32') { shell.showItemInFolder(dest); return { path: dest, launched: false }; }
      // Start the installer on its own and close Aurora so the files can be replaced.
      spawn(dest, [], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => app.quit(), 600);
      return { path: dest, launched: true };
    })().finally(() => { this.downloading = null; });
    return this.downloading;
  }
}

module.exports = { Updater, isNewer };
