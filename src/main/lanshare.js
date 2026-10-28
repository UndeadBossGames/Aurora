// LAN fast path: when an iPhone on the same Wi-Fi asks this PC for a song, it can fetch it straight
// over the local network instead of through the internet relay. Each file gets a random one-time
// token that expires; nothing else on the PC is reachable.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };
const TTL = 60 * 60 * 1000;

class LanShare {
  constructor() {
    this.files = new Map(); // token -> { file, expires }
    this.server = null;
    this.port = 0;
    this.starting = null;
  }

  start() {
    if (this.server) return Promise.resolve(this.port);
    if (this.starting) return this.starting;
    this.starting = new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handle(req, res));
      srv.on('error', (e) => { this.starting = null; reject(e); });
      srv.listen(0, '0.0.0.0', () => { this.server = srv; this.port = srv.address().port; resolve(this.port); });
    });
    return this.starting;
  }

  addresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family !== 'IPv4' && a.family !== 4) continue;
        if (a.internal) continue;
        if (/^169\.254\./.test(a.address)) continue; // link-local
        out.push(a.address);
      }
    }
    // private ranges first (home Wi-Fi), then anything else
    const priv = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
    return out.sort((a, b) => priv(b) - priv(a));
  }

  // Make one file downloadable; returns the URLs to try (one per network address).
  async offer(file) {
    const st = fs.statSync(file);
    if (!st.isFile()) throw new Error('Not a file');
    const port = await this.start();
    const now = Date.now();
    for (const [t, v] of this.files) if (v.expires < now) this.files.delete(t);
    const token = crypto.randomBytes(16).toString('hex');
    this.files.set(token, { file, expires: now + TTL });
    const name = encodeURIComponent(path.basename(file));
    return { size: st.size, urls: this.addresses().map((ip) => `http://${ip}:${port}/f/${token}/${name}`) };
  }

  handle(req, res) {
    const m = String(req.url || '').match(/^\/f\/([0-9a-f]{32})(\/|$)/);
    const entry = m && this.files.get(m[1]);
    if (!entry || entry.expires < Date.now() || !fs.existsSync(entry.file)) { res.writeHead(404); res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const size = fs.statSync(entry.file).size;
    const type = MIME[path.extname(entry.file).toLowerCase()] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = size - 1, code = 200;
    if (range) {
      start = range[1] ? parseInt(range[1], 10) : Math.max(0, size - parseInt(range[2], 10));
      end = range[1] && range[2] ? Math.min(size - 1, parseInt(range[2], 10)) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
      code = 206;
    }
    const headers = { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (code === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(code, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(entry.file, { start, end }).pipe(res);
  }
}

module.exports = new LanShare();
