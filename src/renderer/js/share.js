// FriendShare: browse a friend's library and download songs from it.
// Works over the same MQTT connection as Friends, with private inbox topics:
//   lib?  → ask a friend for their library      lib   ← pages of their songs
//   get   → ask for one song's file             meta  ← name, size, details, cover
//                                               c     ← file chunks (48 KB each)
//   ack   → "I have the first n chunks"         resend → "start again from chunk n"
// Only people on your own friends list can see or download your songs, and you can turn
// sharing off on the Friends page. On PC, songs that came from YouTube/SoundCloud are fetched
// from their source instead (faster); everything else is copied straight from your friend.
const FriendShare = (() => {
  const CHUNK = 48 * 1024;      // raw bytes per chunk (~64 KB as text): well under the public broker's limit
  const WINDOW = 6;             // chunks in flight before waiting for an ack
  const PAGE = 150;             // songs per library page
  const MAX_BYTES = 80 * 1024 * 1024;
  const isPhone = () => !!(window.native && native.platform === 'ios');
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch {} });
  const onChange = (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  const rid = () => Math.random().toString(36).slice(2, 10);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const keyOf = (t) => norm(t.artist === 'Unknown artist' ? '' : t.artist) + '|' + norm(t.title);

  const libs = new Map();      // code -> { items, at, state: 'loading'|'ready'|'offline'|'error'|'off', error, cached }
  const libReqs = new Map();   // rid -> { code, pages, total, timer }
  const outgoing = new Map();  // rid -> sender state
  const incoming = new Map();  // rid -> receiver state
  const jobs = new Map();      // `${code}|${itemId}` -> { status, progress, error, rid, dlJob }

  const sharing = () => State.prefs().shareLibrary !== false;
  function setSharing(on) { State.setPref('shareLibrary', !!on); emit(); }

  // ---------- helpers ----------
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  const fileName = (p) => String(p || '').split(/[\\/]/).pop();
  async function coverThumb(t) {
    const src = t && t.cover ? native.fileUrl(t.cover) : null;
    if (!src) return null;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const s = Math.min(320, img.naturalWidth, img.naturalHeight) || 320;
      const c = document.createElement('canvas'); c.width = c.height = s;
      const k = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, 0, 0, s, s);
      return c.toDataURL('image/jpeg', 0.82);
    } catch { return null; }
  }
  const compact = (t) => ({ i: t.id, t: t.title, a: t.artist, al: t.album || '', d: Math.round(t.duration || 0), k: t.kind || 'audio', s: t.source || 'local', u: /^https?:/i.test(t.url || '') ? t.url : null, at: t.addedAt || 0 });
  const expand = (x) => ({ id: x.i, title: x.t, artist: x.a, album: x.al, duration: x.d, kind: x.k, source: x.s, url: x.u, addedAt: x.at });

  // is this song already in my library?
  function haveLocal(item) {
    const k = keyOf(item);
    return State.allTracks().find((t) => (item.url && t.url === item.url) || keyOf(t) === k) || null;
  }

  // ---------- asking for a friend's library ----------
  async function loadCache(code) {
    const c = await native.store.read('friendlib-' + Friends.normCode(code).toLowerCase(), null);
    return c && Array.isArray(c.items) ? c : null;
  }
  function library(code) { return libs.get(Friends.normCode(code)) || null; }
  async function fetchLibrary(code) {
    const k = Friends.normCode(code);
    const cur = libs.get(k);
    if (cur && cur.state === 'loading') return;
    const cached = cur && cur.items ? cur : await loadCache(code);
    libs.set(k, { items: cached ? cached.items : [], at: cached ? cached.at : 0, state: 'loading', cached: !!cached });
    emit();
    const id = rid();
    const req = { code: k, pages: {}, total: null };
    req.timer = setTimeout(() => {
      libReqs.delete(id);
      const l = libs.get(k);
      libs.set(k, { ...l, state: l && l.cached ? 'offline' : 'offline' });
      emit();
    }, 15000);
    libReqs.set(id, req);
    Friends.send(code, { t: 'lib?', rid: id });
  }

  // ---------- downloading one song ----------
  const jobKey = (code, id) => Friends.normCode(code) + '|' + id;
  function job(code, id) { return jobs.get(jobKey(code, id)) || null; }
  function setJob(code, id, patch) { const k = jobKey(code, id); jobs.set(k, { ...(jobs.get(k) || {}), ...patch }); emit(); }

  async function download(code, item) {
    const j = job(code, item.id);
    if (j && ['requesting', 'receiving', 'saving', 'source'].includes(j.status)) return;
    if (haveLocal(item)) { setJob(code, item.id, { status: 'done', progress: 1 }); return; }
    // PC: songs from YouTube/SoundCloud etc. download straight from the source
    if (!isPhone() && item.url) {
      try {
        const fmt = item.kind === 'video' ? 'video-best' : 'audio-mp3';
        const list = await native.dl.add({ url: item.url, format: fmt, dir: State.settings().downloadDir, playlist: false, addToLibrary: true });
        setJob(code, item.id, { status: 'source', progress: 0, dlJob: list[0] && list[0].id, error: null });
        return;
      } catch { /* fall back to copying it from the friend */ }
    }
    const id = rid();
    incoming.set(id, { code: Friends.normCode(code), itemId: item.id, item, chunks: [], have: 0, total: null, meta: null, last: Date.now(), resends: 0 });
    setJob(code, item.id, { status: 'requesting', progress: 0, rid: id, error: null });
    Friends.send(code, { t: 'get', rid: id, id: item.id });
    watch(id);
  }
  function cancel(code, itemId) {
    const j = job(code, itemId);
    if (!j) return;
    if (j.rid) { incoming.delete(j.rid); Friends.send(code, { t: 'cancel', rid: j.rid }); }
    if (j.dlJob) native.dl.cancel(j.dlJob);
    jobs.delete(jobKey(code, itemId));
    emit();
  }
  async function downloadAll(code, items) {
    // one at a time from the friend (kind to the shared broker), source downloads queue in the downloader
    for (const it of items) {
      if (haveLocal(it)) continue;
      await download(code, it);
      if (isPhone() || !it.url) await new Promise((res) => {
        const off = onChange(() => { const j = job(code, it.id); if (!j || ['done', 'error'].includes(j.status)) { off(); res(); } });
      });
    }
  }

  // stall detection for incoming transfers
  function watch(id) {
    const tick = () => {
      const r = incoming.get(id);
      if (!r) return;
      const idle = Date.now() - r.last;
      if (!r.meta && idle > 20000) return fail(id, `${who(r.code)} didn't answer. They need to have Aurora open.`);
      if (r.meta && idle > 4000) {
        if (++r.resends > 8) return fail(id, 'The transfer stopped. Try again in a moment.');
        r.last = Date.now();
        Friends.send(r.code, { t: 'resend', rid: id, from: r.have });
      }
      setTimeout(tick, 1000);
    };
    setTimeout(tick, 1000);
  }
  function fail(id, msg) {
    const r = incoming.get(id);
    if (!r) return;
    incoming.delete(id);
    setJob(r.code, r.itemId, { status: 'error', error: msg });
  }
  const who = (code) => { const f = Friends.friendByCode(code); const p = Friends.statusOf(code); return (f && f.nickname) || p.name || 'Your friend'; };

  async function finish(id) {
    const r = incoming.get(id);
    if (!r) return;
    setJob(r.code, r.itemId, { status: 'saving', progress: 1 });
    try {
      const size = r.meta.size;
      const bytes = new Uint8Array(size);
      let o = 0;
      for (const c of r.chunks) { bytes.set(c, o); o += c.length; }
      const t = await native.library.saveIncoming({ name: r.meta.name, bytes, dir: State.settings().downloadDir });
      const m = r.meta.track || {};
      const track = { ...t, title: m.title || t.title, artist: m.artist || t.artist, album: m.album || t.album, duration: m.duration || t.duration, kind: m.kind || t.kind,
        source: m.source && m.source !== 'local' ? m.source : 'Friend', url: m.url || null, from: who(r.code), addedAt: Date.now() };
      if (r.meta.cover) { try { const cp = await native.library.saveCover(track.id, r.meta.cover); if (cp) track.cover = cp; } catch {} }
      State.addTracks([track]);
      incoming.delete(id);
      setJob(r.code, r.itemId, { status: 'done', progress: 1 });
      UI.toast(`Added "${track.title}" from ${who(r.code)}`);
    } catch (e) {
      fail(id, "Couldn't save the song: " + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  }

  // ---------- sending (we're the friend) ----------
  function pump(id) {
    const s = outgoing.get(id);
    if (!s) return;
    while (s.next < s.n && s.next < s.acked + WINDOW) {
      const i = s.next++;
      Friends.send(s.to, { t: 'c', rid: id, i, d: b64(s.bytes.subarray(i * CHUNK, Math.min(s.bytes.length, (i + 1) * CHUNK))) });
    }
    s.last = Date.now();
    clearTimeout(s.timer);
    s.timer = setTimeout(() => outgoing.delete(id), 60000); // give up if they vanish
  }
  async function serve(m) {
    const reply = (msg) => Friends.send(m.from, { ...msg, rid: m.rid });
    if (!Friends.isFriend(m.from)) return reply({ t: 'err', msg: "You're not on their friends list yet. Ask them to add your friend code." });
    if (!sharing()) return reply({ t: 'err', msg: 'They turned off library sharing.', off: true });
    if (m.t === 'lib?') {
      const items = State.allTracks().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).map(compact);
      const n = Math.max(1, Math.ceil(items.length / PAGE));
      for (let p = 0; p < n; p++) reply({ t: 'lib', p, n, items: items.slice(p * PAGE, (p + 1) * PAGE) });
      return;
    }
    if (m.t === 'get') {
      const t = State.track(m.id);
      if (!t) return reply({ t: 'err', msg: "That song isn't in their library anymore." });
      if (outgoing.size >= 3) return reply({ t: 'err', msg: `${(State.activeProfile() || {}).name || 'Your friend'} is busy sending other songs. Try again in a minute.` });
      let bytes;
      try { bytes = await native.library.readBytes(t.path); } catch (e) { return reply({ t: 'err', msg: "They can't send this song right now (the file is missing or too large)." }); }
      bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (bytes.length > MAX_BYTES) return reply({ t: 'err', msg: 'This file is too large to send (max 80 MB).' });
      const n = Math.max(1, Math.ceil(bytes.length / CHUNK));
      const cover = await coverThumb(t);
      const name = fileName(t.path) || `${t.artist} - ${t.title}.mp3`;
      reply({ t: 'meta', name, size: bytes.length, n, track: { title: t.title, artist: t.artist, album: t.album || '', duration: t.duration || 0, kind: t.kind, source: t.source, url: /^https?:/i.test(t.url || '') ? t.url : null }, cover });
      outgoing.set(m.rid, { to: m.from, bytes, n, next: 0, acked: 0, timer: null, last: Date.now() });
      pump(m.rid);
    }
  }

  // ---------- message router ----------
  function onMessage(m) {
    if (m.t === 'lib?' || m.t === 'get') return serve(m);
    if (m.t === 'ack' || m.t === 'resend' || m.t === 'cancel') {
      const s = outgoing.get(m.rid);
      if (!s || Friends.normCode(s.to) !== Friends.normCode(m.from)) return;
      if (m.t === 'cancel') { clearTimeout(s.timer); outgoing.delete(m.rid); return; }
      if (m.t === 'ack') { s.acked = Math.max(s.acked, m.n | 0); if (s.acked >= s.n) { clearTimeout(s.timer); outgoing.delete(m.rid); return; } }
      if (m.t === 'resend') { s.next = s.acked = Math.max(0, Math.min(s.n, m.from | 0)); }
      return pump(m.rid);
    }
    if (m.t === 'lib') {
      const req = libReqs.get(m.rid);
      if (!req) return;
      req.pages[m.p] = m.items || [];
      req.total = m.n;
      if (Object.keys(req.pages).length >= req.total) {
        clearTimeout(req.timer);
        libReqs.delete(m.rid);
        const items = [];
        for (let p = 0; p < req.total; p++) items.push(...(req.pages[p] || []).map(expand));
        const data = { items, at: Date.now() };
        libs.set(req.code, { ...data, state: 'ready', cached: true });
        native.store.write('friendlib-' + req.code.toLowerCase(), data);
        emit();
      }
      return;
    }
    if (m.t === 'err') {
      const req = libReqs.get(m.rid);
      if (req) {
        clearTimeout(req.timer); libReqs.delete(m.rid);
        libs.set(req.code, { ...(libs.get(req.code) || {}), state: m.off ? 'off' : 'error', error: m.msg });
        emit();
      }
      if (incoming.has(m.rid)) fail(m.rid, m.msg);
      return;
    }
    const r = incoming.get(m.rid);
    if (!r || r.code !== Friends.normCode(m.from)) return;
    r.last = Date.now();
    if (m.t === 'meta') {
      if (!(m.size > 0) || m.size > MAX_BYTES) return fail(m.rid, 'This file is too large to receive.');
      r.meta = m; r.total = m.n;
      setJob(r.code, r.itemId, { status: 'receiving', progress: 0 });
      return;
    }
    if (m.t === 'c' && r.meta) {
      if (!r.chunks[m.i]) { try { r.chunks[m.i] = unb64(m.d); } catch { return; } }
      while (r.chunks[r.have]) r.have++;
      r.resends = 0;
      Friends.send(m.from, { t: 'ack', rid: m.rid, n: r.have });
      const j = job(r.code, r.itemId);
      const p = r.have / r.total;
      if (!j || Math.abs((j.progress || 0) - p) > 0.02 || r.have === r.total) setJob(r.code, r.itemId, { progress: p });
      if (r.have === r.total) finish(m.rid);
    }
  }

  function init() {
    Friends.onDM(onMessage);
    // source downloads (PC): follow the downloader's progress
    native.dl.onJob((dj) => {
      for (const [k, j] of jobs) {
        if (j.dlJob !== dj.id) continue;
        if (dj.status === 'done') jobs.set(k, { ...j, status: 'done', progress: 1 });
        else if (dj.status === 'error' || dj.status === 'cancelled') jobs.set(k, { ...j, status: 'error', error: dj.error || 'Download failed' });
        else jobs.set(k, { ...j, progress: (dj.progress || 0) / 100 });
        emit();
      }
    });
  }

  return { init, onChange, fetchLibrary, library, loadCache, download, downloadAll, cancel, job, haveLocal, sharing, setSharing, get isPhone() { return isPhone(); } };
})();
