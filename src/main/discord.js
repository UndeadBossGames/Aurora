// Discord Connection: shows what you're listening to in Aurora on your Discord profile
// ("Rich Presence"). Talks to the Discord desktop app over its local IPC pipe, so no login
// or token is needed - Discord just has to be running on the same PC.
const netMod = require('net');
const path = require('path');
const { EventEmitter } = require('events');

// Aurora logo, served from the public GitHub repo (Discord accepts https image URLs)
const LOGO_URL = 'https://raw.githubusercontent.com/UndeadBossGames/Aurora/main/assets/icon.png';

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

function pipeCandidates() {
  const out = [];
  if (process.platform === 'win32') {
    for (let i = 0; i < 10; i++) out.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    return out;
  }
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  const dirs = [base, path.join(base, 'app/com.discordapp.Discord'), path.join(base, 'snap.discord'), path.join(base, '.flatpak/com.discordapp.Discord/xdg-run')];
  for (const d of dirs) for (let i = 0; i < 10; i++) out.push(path.join(d, `discord-ipc-${i}`));
  return out;
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

class DiscordPresence extends EventEmitter {
  constructor() {
    super();
    this.clientId = null;
    this.enabled = false;
    this.sock = null;
    this.state = 'off'; // off | connecting | connected | waiting (Discord not running) | error
    this.user = null;
    this.error = null;
    this.activity = null; // last activity we want shown
    this.buf = Buffer.alloc(0);
    this.retryTimer = null;
    this.sendTimer = null;
    this.lastSent = 0;
    this.nonce = 0;
  }

  status() {
    return { state: this.state, user: this.user, error: this.error, clientId: this.clientId, enabled: this.enabled };
  }

  setStatus(state, extra = {}) {
    this.state = state;
    Object.assign(this, extra);
    this.emit('status', this.status());
  }

  configure({ enabled, clientId }) {
    const changedId = clientId && clientId !== this.clientId;
    this.enabled = !!enabled;
    if (clientId) this.clientId = String(clientId).trim();
    if (!this.enabled) {
      this.disconnect();
      this.setStatus('off', { error: null });
      return this.status();
    }
    if (changedId) this.disconnect();
    if (!this.sock) this.connect();
    return this.status();
  }

  async connect() {
    clearTimeout(this.retryTimer);
    if (!this.enabled || !this.clientId) return;
    this.setStatus('connecting', { error: null });
    for (const p of pipeCandidates()) {
      const ok = await this.tryPipe(p);
      if (ok) return;
      if (!this.enabled) return;
    }
    this.setStatus('waiting', { error: 'Discord isn\'t running on this PC. Open the Discord desktop app and Aurora will connect automatically.' });
    this.scheduleRetry();
  }

  tryPipe(p) {
    return new Promise((resolve) => {
      const sock = netMod.createConnection(p);
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      sock.once('connect', () => {
        this.sock = sock;
        this.buf = Buffer.alloc(0);
        sock.on('data', (d) => this.onData(d));
        sock.on('close', () => this.onClose());
        sock.on('error', () => {});
        sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
        // READY arrives as a DISPATCH frame; if not within 6s treat this pipe as dead
        const t = setTimeout(() => { if (this.state !== 'connected') { sock.destroy(); done(false); } }, 6000);
        this.once('ready', () => { clearTimeout(t); done(true); });
      });
      sock.once('error', () => { sock.destroy(); done(false); });
    });
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) return;
      const raw = this.buf.subarray(8, 8 + len).toString('utf8');
      this.buf = this.buf.subarray(8 + len);
      let msg = {};
      try { msg = JSON.parse(raw); } catch {}
      if (op === OP.PING) { this.sock && this.sock.write(encode(OP.PONG, msg)); continue; }
      if (op === OP.CLOSE) {
        this.setStatus('error', { error: msg.message || 'Discord closed the connection' + (msg.code === 4000 ? ' (invalid Application ID)' : '') });
        this.sock && this.sock.destroy();
        continue;
      }
      if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
        const u = (msg.data && msg.data.user) || {};
        const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null;
        this.setStatus('connected', { user: { id: u.id, username: u.global_name || u.username, handle: u.username, avatar }, error: null });
        this.emit('ready');
        this.flush(true);
      } else if (msg.evt === 'ERROR') {
        this.error = (msg.data && msg.data.message) || 'Discord rejected the update';
        this.emit('status', this.status());
      }
    }
  }

  onClose() {
    this.sock = null;
    if (this.state === 'connected') this.setStatus('connecting', { error: null });
    if (this.enabled) this.scheduleRetry(this.state === 'error' ? 30000 : 5000);
  }

  scheduleRetry(ms = 15000) {
    clearTimeout(this.retryTimer);
    if (this.enabled) this.retryTimer = setTimeout(() => this.connect(), ms);
  }

  disconnect() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.sendTimer);
    if (this.sock) {
      try { this.send({ cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null } }); } catch {}
      try { this.sock.end(); } catch {}
      this.sock = null;
    }
    this.user = null;
  }

  send(payload) {
    if (!this.sock) return;
    this.sock.write(encode(OP.FRAME, { ...payload, nonce: String(++this.nonce) }));
  }

  // activity === null clears the status
  setActivity(activity) {
    this.activity = activity;
    this.flush();
  }

  // Discord allows about 5 updates per 20 s, so coalesce bursts (seeking, skipping)
  flush(now = false) {
    clearTimeout(this.sendTimer);
    if (this.state !== 'connected') return;
    const wait = now ? 0 : Math.max(0, 4000 - (Date.now() - this.lastSent));
    this.sendTimer = setTimeout(() => {
      this.lastSent = Date.now();
      this.send({ cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: this.activity } });
    }, wait);
  }
}

const pickHttps = (...urls) => urls.find((u) => u && /^https:\/\//.test(u) && u.length <= 300) || null;

// Turn the renderer's "now playing" info into a Discord activity
function buildActivity(np, opts = {}) {
  if (!np || !np.title) return null;
  if (!np.playing && !opts.showPaused) return null;
  const clip = (s, n = 128) => {
    s = String(s || '').trim();
    if (s.length < 2) s = (s + '  ').slice(0, 2);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  const a = {
    type: 2, // "Listening to"
    details: clip(np.title),
    state: clip(np.playing ? `by ${np.artist || 'Unknown artist'}` : `Paused · ${np.artist || 'Unknown artist'}`),
    assets: {
      // big picture: album cover (online lookup) -> the video/thumbnail it was downloaded with -> Aurora logo
      large_image: pickHttps(np.albumArtUrl, np.coverUrl) || LOGO_URL,
      large_text: clip(np.album || np.title || 'Aurora'),
      // small bubble: a photo of the artist -> Aurora logo
      small_image: pickHttps(np.artistImageUrl) || LOGO_URL,
      small_text: clip(np.artistImageUrl ? (np.artist || 'Artist') : 'Aurora'),
    },
    instance: false,
  };
  if (np.playing && opts.showProgress !== false && np.duration > 0) {
    const start = Date.now() - Math.round((np.position || 0) * 1000);
    a.timestamps = { start, end: start + Math.round(np.duration * 1000) };
  }
  if (opts.showButton !== false && np.url && /^https?:\/\//.test(np.url)) {
    a.buttons = [{ label: clip(`Open on ${np.source || 'the web'}`, 32), url: np.url.slice(0, 512) }];
  }
  return a;
}

module.exports = { DiscordPresence, buildActivity, LOGO_URL };
