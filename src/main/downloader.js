// Video Downloader engine.
// Wraps yt-dlp (https://github.com/yt-dlp/yt-dlp), which supports YouTube, SoundCloud,
// Vimeo, TikTok, Bandcamp, X/Twitter, Instagram, Twitch and 1000+ other sites.
// Spotify streams are DRM-protected, so Spotify links are resolved to their track
// names and matched to a public YouTube upload instead.
const { app, net } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const FFMPEG_ZIP = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp' + EXE;

const FORMATS = {
  'video-best': { label: 'Video · Best quality (MP4)', kind: 'video' },
  'video-1080': { label: 'Video · 1080p (MP4)', kind: 'video' },
  'video-720': { label: 'Video · 720p (MP4)', kind: 'video' },
  'audio-mp3': { label: 'Audio · MP3', kind: 'audio' },
  'audio-m4a': { label: 'Audio · M4A', kind: 'audio' },
};

class Downloader extends EventEmitter {
  constructor({ binDir, coversDir }) {
    super();
    this.binDir = binDir;
    this.coversDir = coversDir;
    this.jobs = new Map();
    this.queue = [];
    this.maxConcurrent = 2;
    this.running = 0;
    this.ffmpegInstalling = null;
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(coversDir, { recursive: true });
    this.ensureBundledYtdlp();
  }

  get ytdlp() { return path.join(this.binDir, 'yt-dlp' + EXE); }
  get ffmpeg() { return path.join(this.binDir, 'ffmpeg' + EXE); }
  hasFfmpeg() { return fs.existsSync(this.ffmpeg); }

  ensureBundledYtdlp() {
    if (fs.existsSync(this.ytdlp)) return;
    const candidates = [
      path.join(process.resourcesPath || '', 'bin', 'yt-dlp' + EXE),
      path.join(app.getAppPath(), 'resources', 'bin', 'yt-dlp' + EXE),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) { try { fs.copyFileSync(c, this.ytdlp); } catch {} return; }
    }
  }

  async tools() {
    const version = await new Promise((resolve) => {
      if (!fs.existsSync(this.ytdlp)) return resolve(null);
      execFile(this.ytdlp, ['--version'], { timeout: 20000, windowsHide: true }, (err, out) => resolve(err ? null : out.trim()));
    });
    return { ytdlp: version, ffmpeg: this.hasFfmpeg(), ffmpegInstalling: !!this.ffmpegInstalling, binDir: this.binDir, formats: FORMATS };
  }

  // ---------- online search (Discover) ----------
  // source: 'youtube' | 'soundcloud'. Returns lightweight results without downloading anything.
  async search(query, source = 'youtube', limit = 18) {
    query = String(query || '').trim();
    if (!query) return [];
    if (!fs.existsSync(this.ytdlp)) await this.updateYtdlp();
    const sc = source === 'soundcloud';
    const n = Math.max(1, Math.min(sc ? 12 : 30, limit));
    const args = ['-J', '--no-warnings', '--ignore-errors', ...(sc ? ['--skip-download'] : ['--flat-playlist']), `${sc ? 'scsearch' : 'ytsearch'}${n}:${query}`];
    const out = await new Promise((resolve, reject) => {
      execFile(this.ytdlp, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 90000, env: { ...process.env, PYTHONUTF8: '1' } }, (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error((String(stderr).match(/ERROR:.*$/m) || [err.message])[0].replace(/^ERROR:\s*/, '')));
        resolve(stdout);
      });
    });
    let data;
    try { data = JSON.parse(out); } catch { return []; }
    return (data.entries || []).filter(Boolean).map((e) => {
      const id = e.id;
      const url = e.webpage_url || e.url || (sc ? null : `https://www.youtube.com/watch?v=${id}`);
      const thumbs = (e.thumbnails || []).filter((t) => t && t.url);
      const thumb = sc
        ? (e.thumbnail || (thumbs.length ? thumbs[thumbs.length - 1].url : null))
        : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      return {
        id, url, source: sc ? 'SoundCloud' : 'YouTube',
        title: e.title || e.track || 'Untitled',
        channel: e.channel || e.uploader || e.artist || '',
        duration: Number(e.duration) || 0,
        views: Number(e.view_count) || 0,
        thumbnail: thumb,
        live: e.live_status === 'is_live',
      };
    }).filter((r) => r.url && !r.live);
  }

  // ---------- tool management ----------
  async downloadFile(url, dest, onProgress) {
    const res = await net.fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} while downloading ${url}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(dest);
    let got = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (onProgress && total) onProgress(got / total);
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  }

  async updateYtdlp() {
    this.emit('tools', { status: 'Updating yt-dlp…' });
    const tmp = this.ytdlp + '.new';
    try {
      await this.downloadFile(YTDLP_URL, tmp, (p) => this.emit('tools', { status: `Updating yt-dlp… ${Math.round(p * 100)}%` }));
      fs.renameSync(tmp, this.ytdlp);
      if (!IS_WIN) fs.chmodSync(this.ytdlp, 0o755);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      this.emit('tools', { status: 'yt-dlp update failed: ' + e.message });
      throw e;
    }
    const t = await this.tools();
    this.emit('tools', { status: `yt-dlp is up to date (${t.ytdlp})` });
    return t;
  }

  installFfmpeg() {
    if (this.hasFfmpeg()) return Promise.resolve(true);
    if (this.ffmpegInstalling) return this.ffmpegInstalling;
    if (!IS_WIN) return Promise.reject(new Error('Install ffmpeg with your package manager and copy it into ' + this.binDir));
    this.ffmpegInstalling = (async () => {
      const zip = path.join(app.getPath('temp'), 'aurora-ffmpeg.zip');
      const outDir = path.join(app.getPath('temp'), 'aurora-ffmpeg');
      try {
        await this.downloadFile(FFMPEG_ZIP, zip, (p) => this.emit('tools', { status: `Downloading ffmpeg… ${Math.round(p * 100)}%`, ffmpegProgress: p }));
        this.emit('tools', { status: 'Extracting ffmpeg…' });
        fs.rmSync(outDir, { recursive: true, force: true });
        fs.mkdirSync(outDir, { recursive: true });
        await new Promise((resolve, reject) => {
          // tar.exe ships with Windows 10+ and can unpack .zip files
          execFile('tar', ['-xf', zip, '-C', outDir], { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
        });
        const find = (dir, name) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const f = path.join(dir, e.name);
            if (e.isDirectory()) { const r = find(f, name); if (r) return r; } else if (e.name.toLowerCase() === name) return f;
          }
          return null;
        };
        for (const n of ['ffmpeg.exe', 'ffprobe.exe']) {
          const f = find(outDir, n);
          if (!f) throw new Error(n + ' not found in archive');
          fs.copyFileSync(f, path.join(this.binDir, n));
        }
        this.emit('tools', { status: 'ffmpeg installed', ffmpeg: true });
        return true;
      } catch (e) {
        this.emit('tools', { status: 'ffmpeg install failed: ' + e.message, ffmpeg: false });
        throw e;
      } finally {
        try { fs.unlinkSync(zip); } catch {}
        try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
        this.ffmpegInstalling = null;
      }
    })();
    return this.ffmpegInstalling;
  }

  // ---------- Spotify link resolution ----------
  async resolveSpotify(url) {
    const m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|artist)\/([A-Za-z0-9]+)/i);
    if (!m) throw new Error('Unrecognised Spotify link');
    const [, type, id] = m;
    const res = await net.fetch(`https://open.spotify.com/embed/${type}/${id}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
    const html = await res.text();
    const nd = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nd) throw new Error('Could not read Spotify page');
    const data = JSON.parse(nd[1]);
    const entity = findKey(data, 'entity') || {};
    const cover = pickImage(entity);
    const tracks = [];
    if (Array.isArray(entity.trackList) && entity.trackList.length) {
      for (const t of entity.trackList) tracks.push({ title: t.title, artist: t.subtitle || '', cover });
    } else if (entity.title || entity.name) {
      const artist = (entity.artists || []).map((a) => a.name).join(', ') || entity.subtitle || '';
      tracks.push({ title: entity.title || entity.name, artist, cover });
    }
    if (!tracks.length) throw new Error('No tracks found on that Spotify page');
    return { type, name: entity.name || entity.title || 'Spotify', tracks };
  }

  // ---------- jobs ----------
  async add({ url, format = 'video-best', dir, playlist = false, addToLibrary = true }) {
    url = String(url || '').trim();
    if (!url) throw new Error('Paste a link first');
    if (!/^https?:\/\//i.test(url) && !/^ytsearch\d*:/i.test(url)) {
      // plain text = search YouTube
      url = 'ytsearch1:' + url;
    }
    fs.mkdirSync(dir, { recursive: true });
    const created = [];
    if (/open\.spotify\.com/i.test(url)) {
      const sp = await this.resolveSpotify(url);
      const fmt = format.startsWith('video') ? 'audio-mp3' : format;
      for (const t of sp.tracks.slice(0, playlist ? 500 : sp.type === 'track' ? 1 : 500)) {
        const q = `ytsearch1:${t.artist ? t.artist + ' - ' : ''}${t.title} audio`;
        created.push(this.createJob({ url: q, displayUrl: url, title: `${t.artist ? t.artist + ' - ' : ''}${t.title}`, source: 'Spotify', format: fmt, dir, playlist: false, addToLibrary, meta: t }));
      }
    } else {
      created.push(this.createJob({ url, displayUrl: url, title: url.replace(/^ytsearch1:/, 'Search: '), source: sourceName(url), format, dir, playlist, addToLibrary }));
    }
    this.pump();
    return created.map((j) => this.public(j));
  }

  createJob(o) {
    const job = {
      id: crypto.randomBytes(6).toString('hex'),
      status: 'queued',
      progress: 0,
      speed: '',
      eta: '',
      createdAt: Date.now(),
      files: [],
      error: null,
      ...o,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.emit('job', this.public(job));
    return job;
  }

  public(j) {
    const { proc, ...rest } = j;
    return rest;
  }

  list() { return [...this.jobs.values()].map((j) => this.public(j)); }

  pump() {
    while (this.running < this.maxConcurrent && this.queue.length) {
      const id = this.queue.shift();
      const job = this.jobs.get(id);
      if (!job || job.status !== 'queued') continue;
      this.running++;
      this.run(job).finally(() => { this.running--; this.pump(); });
    }
  }

  async run(job) {
    const needsFfmpeg = job.format !== 'audio-m4a';
    if (needsFfmpeg && !this.hasFfmpeg() && IS_WIN) {
      job.status = 'preparing';
      job.statusText = 'Installing ffmpeg (one-time)…';
      this.emit('job', this.public(job));
      try { await this.installFfmpeg(); } catch {}
    }
    if (!fs.existsSync(this.ytdlp)) {
      job.statusText = 'Downloading yt-dlp (one-time)…';
      this.emit('job', this.public(job));
      try { await this.updateYtdlp(); } catch (e) { return this.fail(job, 'yt-dlp is missing and could not be downloaded: ' + e.message); }
    }
    const ff = this.hasFfmpeg();
    const args = [
      '--newline', '--no-mtime', '--windows-filenames', '--no-colors',
      job.playlist ? '--yes-playlist' : '--no-playlist',
      '-o', path.join(job.dir, '%(title).140B [%(id)s].%(ext)s'),
      '--progress-template', 'download:AURORA_PROG %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '--no-simulate',
      '--print', 'before_dl:AURORA_START %(.{id,title,thumbnail,playlist_index,n_entries})j',
      '--print', 'after_move:AURORA_DONE %(.{id,title,uploader,channel,artist,track,album,duration,thumbnail,webpage_url,extractor_key,filepath,ext,vcodec})j',
    ];
    if (ff) args.push('--ffmpeg-location', this.binDir);
    switch (job.format) {
      case 'video-1080':
        args.push('-f', ff ? 'bv*[height<=1080]+ba/b[height<=1080]/b' : 'b[ext=mp4]/b');
        if (ff) args.push('--merge-output-format', 'mp4', '-S', 'vcodec:h264,res,acodec:m4a');
        break;
      case 'video-720':
        args.push('-f', ff ? 'bv*[height<=720]+ba/b[height<=720]/b' : 'b[ext=mp4]/b');
        if (ff) args.push('--merge-output-format', 'mp4', '-S', 'vcodec:h264,res,acodec:m4a');
        break;
      case 'audio-mp3':
        if (ff) args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-metadata');
        else args.push('-f', 'ba[ext=m4a]/ba/b');
        break;
      case 'audio-m4a':
        args.push('-f', 'ba[ext=m4a]/ba/b');
        if (ff) args.push('-x', '--audio-format', 'm4a', '--embed-metadata');
        break;
      default:
        args.push('-f', ff ? 'bv*+ba/b' : 'b[ext=mp4]/b');
        if (ff) args.push('--merge-output-format', 'mp4', '-S', 'vcodec:h264,res,acodec:m4a');
    }
    args.push(job.url);

    job.status = 'downloading';
    job.statusText = 'Starting…';
    this.emit('job', this.public(job));

    return new Promise((resolve) => {
      const proc = spawn(this.ytdlp, args, { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
      job.proc = proc;
      let errTail = '';
      const pending = [];
      const onLine = async (line) => {
        line = line.trim();
        if (!line) return;
        if (line.startsWith('AURORA_PROG ')) {
          const [pct, speed, eta] = line.slice(12).split('|');
          job.progress = Math.min(100, parseFloat(pct) || 0);
          job.speed = (speed || '').trim();
          job.eta = (eta || '').trim();
          job.statusText = '';
          this.emit('job', this.public(job));
        } else if (line.startsWith('AURORA_START ')) {
          try {
            const info = JSON.parse(line.slice(13));
            job.title = info.title || job.title;
            job.thumbnail = info.thumbnail || job.thumbnail;
            if (info.n_entries) job.statusText = `Item ${info.playlist_index} of ${info.n_entries}`;
            this.emit('job', this.public(job));
          } catch {}
        } else if (line.startsWith('AURORA_DONE ')) {
          try {
            const info = JSON.parse(line.slice(12));
            const track = await this.trackFromInfo(info, job);
            job.files.push(track);
            this.emit('file', { jobId: job.id, track, addToLibrary: job.addToLibrary });
            this.emit('job', this.public(job));
          } catch (e) { errTail += '\n' + e.message; }
        } else if (/^\[(Merger|ExtractAudio|VideoConvertor|Metadata)\]/.test(line)) {
          job.statusText = 'Processing…';
          this.emit('job', this.public(job));
        } else if (/^ERROR:/.test(line) || /^WARNING:/.test(line)) {
          errTail = (errTail + '\n' + line).slice(-1500);
        }
      };
      let bufOut = '';
      let bufErr = '';
      const split = (chunk, which) => {
        let b = (which === 'out' ? bufOut : bufErr) + chunk.toString('utf8');
        const lines = b.split(/\r?\n/);
        b = lines.pop();
        if (which === 'out') bufOut = b; else bufErr = b;
        lines.forEach((l) => pending.push(onLine(l)));
      };
      proc.stdout.on('data', (c) => split(c, 'out'));
      proc.stderr.on('data', (c) => split(c, 'err'));
      proc.on('error', (e) => { this.fail(job, e.message); resolve(); });
      proc.on('close', (code) => {
        if (bufOut) pending.push(onLine(bufOut));
        job.proc = null;
        if (job.status === 'cancelled') { this.emit('job', this.public(job)); return resolve(); }
        // wait for any async AURORA_DONE handlers (thumbnail downloads) to finish
        Promise.allSettled(pending).then(() => {
          if (code === 0 || job.files.length) {
            job.status = 'done';
            job.progress = 100;
            job.statusText = job.files.length > 1 ? `${job.files.length} files` : '';
            this.emit('job', this.public(job));
          } else {
            const err = (errTail.match(/ERROR:.*$/m) || [errTail.trim() || `yt-dlp exited with code ${code}`])[0];
            this.fail(job, err.replace(/^ERROR:\s*/, ''));
          }
          resolve();
        });
      });
    });
  }

  fail(job, message) {
    job.status = 'error';
    job.error = message;
    job.proc = null;
    this.emit('job', this.public(job));
  }

  async trackFromInfo(info, job) {
    const file = info.filepath;
    const id = crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 16);
    let cover = null;
    const thumbUrl = (job.meta && job.meta.cover) || info.thumbnail;
    if (thumbUrl) {
      try {
        const res = await net.fetch(thumbUrl, { headers: { 'User-Agent': UA } });
        if (res.ok) {
          const type = res.headers.get('content-type') || '';
          const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
          cover = path.join(this.coversDir, id + ext);
          fs.writeFileSync(cover, Buffer.from(await res.arrayBuffer()));
        }
      } catch { cover = null; }
    }
    const isVideo = FORMATS[job.format] ? FORMATS[job.format].kind === 'video' : !!(info.vcodec && info.vcodec !== 'none');
    return {
      id,
      path: file,
      title: (job.meta && job.meta.title) || info.track || info.title || path.basename(file),
      artist: (job.meta && job.meta.artist) || info.artist || info.uploader || info.channel || 'Unknown artist',
      album: info.album || (job.source === 'Spotify' ? 'Spotify downloads' : (info.extractor_key || 'Downloads')),
      duration: Number(info.duration) || 0,
      kind: isVideo ? 'video' : 'audio',
      source: job.source || info.extractor_key || 'web',
      url: info.webpage_url || job.displayUrl,
      size: (() => { try { return fs.statSync(file).size; } catch { return 0; } })(),
      cover,
      coverUrl: thumbUrl && /^https:\/\//.test(thumbUrl) ? thumbUrl : null,
      addedAt: Date.now(),
    };
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status === 'queued' || job.status === 'preparing') {
      job.status = 'cancelled';
      this.emit('job', this.public(job));
      return;
    }
    if (job.proc) {
      job.status = 'cancelled';
      if (IS_WIN) execFile('taskkill', ['/pid', String(job.proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else job.proc.kill('SIGTERM');
    }
  }

  retry(id) {
    const job = this.jobs.get(id);
    if (!job || job.proc) return;
    Object.assign(job, { status: 'queued', progress: 0, error: null, statusText: '', files: [] });
    this.queue.push(job.id);
    this.emit('job', this.public(job));
    this.pump();
  }

  remove(id) {
    this.cancel(id);
    this.jobs.delete(id);
    this.emit('removed', id);
  }

  clearFinished() {
    for (const [id, j] of this.jobs) if (['done', 'error', 'cancelled'].includes(j.status)) this.jobs.delete(id);
    this.emit('cleared');
  }
}

function sourceName(url) {
  const map = [
    [/youtube\.com|youtu\.be/i, 'YouTube'], [/music\.youtube/i, 'YouTube Music'], [/soundcloud/i, 'SoundCloud'],
    [/vimeo/i, 'Vimeo'], [/tiktok/i, 'TikTok'], [/twitter\.com|x\.com/i, 'X'], [/instagram/i, 'Instagram'],
    [/twitch/i, 'Twitch'], [/bandcamp/i, 'Bandcamp'], [/facebook|fb\.watch/i, 'Facebook'], [/reddit/i, 'Reddit'],
    [/dailymotion/i, 'Dailymotion'], [/mixcloud/i, 'Mixcloud'], [/^ytsearch/i, 'YouTube'],
  ];
  for (const [re, name] of map) if (re.test(url)) return name;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Web'; }
}

function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 12) return null;
  if (obj[key] && typeof obj[key] === 'object') return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key, depth + 1); if (r) return r; }
  return null;
}

function pickImage(entity) {
  const srcs = (entity.coverArt && entity.coverArt.sources) || (entity.visualIdentity && entity.visualIdentity.image) || [];
  if (!srcs.length) return null;
  return [...srcs].sort((a, b) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0))[0].url;
}

module.exports = { Downloader, FORMATS };
