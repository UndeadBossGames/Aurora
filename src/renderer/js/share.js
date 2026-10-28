// FriendShare: browse a friend's library and copy songs between Aurora apps.
// Works over the same MQTT connection as Friends, with private inbox topics:
//   lib?  → ask a friend for their library      lib   ← pages of their songs
//   get   → ask for one song's file             meta  ← name, size, details, cover, LAN links
//                                               c     ← file chunks (48 KB each)
//   ack   → "I have the first n chunks"         resend → "start again from chunk n"
//   cancel → stop sending                        (meta with push:true = a PC sending a download to its phone)
// Fast path: a PC sender also offers the file on the local network. An iPhone on the same Wi-Fi
// downloads it directly from there (full Wi-Fi speed); otherwise the chunks go through the relay.
// Who may ask: people on your friends list (if library sharing is on), your linked phone, and
// guests of the Listen Together session you're hosting (only the song that's playing).
const FriendShare = (() => {
  const CHUNK = 48 * 1024;      // raw bytes per chunk (~64 KB as text): well under the public broker's limit
  const WINDOW = 10;            // chunks in flight before waiting for an ack
  const PAGE = 150;             // songs per library page
  const MAX_RELAY = 400 * 1024 * 1024; // the internet relay path; the LAN path has no limit
  const MAX_SENDS = 6;          // songs we send at the same time
  const isPhone = () => !!(window.native && native.platform === 'ios');
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch {} });
  const onChange = (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  const rid = () => Math.random().toString(36).slice(2, 10);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const keyOf = (t) => norm(t.artist === 'Unknown artist' ? '' : t.artist) + '|' + norm(t.title);
  const nc = (c) => Friends.normCode(c);
  const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

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
    const c = await native.store.read('friendlib-' + nc(code).toLowerCase(), null);
    if (c && Array.isArray(c.items) && !libs.has(nc(code))) libs.set(nc(code), { ...c, state: 'offline', cached: true });
    return c && Array.isArray(c.items) ? c : null;
  }
  function library(code) { return libs.get(nc(code)) || null; }
  async function fetchLibrary(code) {
    const k = nc(code);
    const cur = libs.get(k);
    if (cur && cur.state === 'loading') return;
    const cached = cur && cur.items ? cur : await loadCache(code);
    libs.set(k, { items: cached ? cached.items : [], at: cached ? cached.at : 0, state: 'loading', cached: !!cached });
    emit();
    const id = rid();
    const req = { code: k, pages: {}, total: null };
    req.timer = setTimeout(() => {
      libReqs.delete(id);
      libs.set(k, { ...libs.get(k), state: 'offline' });
      emit();
    }, 15000);
    libReqs.set(id, req);
    Friends.send(code, { t: 'lib?', rid: id });
  }

  // ---------- receiving one song ----------
  // Generic: ask `code` for song `item.id`. opts: { lt, quiet, onProgress(p, phase), onDone(track), onError(msg) }
  function request(code, item, opts = {}) {
    const id = rid();
    incoming.set(id, { code: nc(code), itemId: item.id, item, chunks: [], have: 0, total: null, meta: null, last: Date.now(), resends: 0, ...opts });
    Friends.send(code, { t: 'get', rid: id, id: item.id, lt: opts.lt || undefined });
    watch(id);
    return id;
  }

  const jobKey = (code, id) => nc(code) + '|' + id;
  function job(code, id) { return jobs.get(jobKey(code, id)) || null; }
  function setJob(code, id, patch) { const k = jobKey(code, id); jobs.set(k, { ...(jobs.get(k) || {}), ...patch }); emit(); }

  // Friend's library page: download one song
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
    const r = request(code, item, {
      onProgress: (p) => { const cur = job(code, item.id); if (!cur || Math.abs((cur.progress || 0) - p) > 0.015 || p >= 1) setJob(code, item.id, { status: 'receiving', progress: p }); },
      onSaving: () => setJob(code, item.id, { status: 'saving', progress: 1 }),
      onDone: () => setJob(code, item.id, { status: 'done', progress: 1 }),
      onError: (msg) => setJob(code, item.id, { status: 'error', error: msg }),
    });
    setJob(code, item.id, { status: 'requesting', progress: 0, rid: r, error: null });
  }
  function cancel(code, itemId) {
    const j = job(code, itemId);
    if (!j) return;
    if (j.rid) { incoming.delete(j.rid); Friends.send(code, { t: 'cancel', rid: j.rid }); }
    if (j.dlJob) native.dl.cancel(j.dlJob);
    jobs.delete(jobKey(code, itemId));
    emit();
  }
  // Download all: several at once (the relay is shared, so not unlimited), source downloads queue in the downloader
  async function downloadAll(code, items) {
    const todo = items.filter((it) => !haveLocal(it));
    const PAR = isPhone() ? 4 : 3;
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const it = todo[i++];
        await download(code, it);
        if (isPhone() || !it.url) await new Promise((res) => {
          const done = () => { const j = job(code, it.id); return !j || ['done', 'error'].includes(j.status); };
          if (done()) return res();
          const off = onChange(() => { if (done()) { off(); res(); } });
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(PAR, todo.length) }, worker));
  }

  // stall detection for incoming transfers
  function watch(id) {
    const tick = () => {
      const r = incoming.get(id);
      if (!r) return;
      if (r.lan) { setTimeout(tick, 1000); return; } // the LAN download has its own timeouts
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
    try { r.onError && r.onError(msg); } catch {}
  }
  const who = (code) => { const f = Friends.friendByCode(code); const p = Friends.statusOf(code); return (f && f.nickname) || p.name || 'Your friend'; };

  // turn a received file into a library track
  async function addReceived(r, t) {
    const m = r.meta.track || {};
    const track = { ...t, title: m.title || t.title, artist: m.artist || t.artist, album: m.album || t.album, duration: m.duration || t.duration, kind: m.kind || t.kind,
      source: m.source && m.source !== 'local' ? m.source : 'Friend', url: m.url || null, from: who(r.code), addedAt: Date.now() };
    if (r.meta.cover) { try { const cp = await native.library.saveCover(track.id, r.meta.cover); if (cp) track.cover = cp; } catch {} }
    State.addTracks([track]);
    incoming.delete(r.rid);
    try { r.onDone && r.onDone(track); } catch (e) { console.warn(e); }
    if (!r.quiet) UI.toast(`Added "${track.title}"${r.meta.push ? '' : ' from ' + who(r.code)}`);
    return track;
  }

  async function finish(id) {
    const r = incoming.get(id);
    if (!r) return;
    try { r.onSaving && r.onSaving(); } catch {}
    try {
      const bytes = new Uint8Array(r.meta.size);
      let o = 0;
      for (const c of r.chunks) { bytes.set(c, o); o += c.length; }
      r.chunks = [];
      const t = await native.library.saveIncoming({ name: r.meta.name, bytes, dir: State.settings().downloadDir });
      await addReceived(r, t);
    } catch (e) {
      fail(id, "Couldn't save the song: " + clean(e));
    }
  }

  // iPhone on the same Wi-Fi as the sending PC: download it directly, at full speed
  async function tryLan(id) {
    const r = incoming.get(id);
    if (!r || !native.library.downloadUrl || !r.meta.lan || !r.meta.lan.length) return false;
    r.lan = true;
    try {
      const t = await native.library.downloadUrl({
        urls: r.meta.lan, name: r.meta.name, size: r.meta.size,
        onProgress: (p) => { r.last = Date.now(); try { r.onProgress && r.onProgress(p, 'lan'); } catch {} },
      });
      if (!incoming.has(id)) return true; // cancelled meanwhile
      Friends.send(r.code, { t: 'cancel', rid: id, ok: true });
      await addReceived(r, t);
      return true;
    } catch (e) {
      r.lan = false;
      r.last = Date.now();
      return false;
    }
  }

  // ---------- sending ----------
  async function loadBytes(s) {
    if (s.bytes) return s.bytes;
    if (!s.loading) s.loading = native.library.readBytes(s.path).then((b) => (s.bytes = b instanceof Uint8Array ? b : new Uint8Array(b)));
    return s.loading;
  }
  async function pump(id) {
    const s = outgoing.get(id);
    if (!s) return;
    if (!s.bytes) {
      try { await loadBytes(s); } catch (e) { Friends.send(s.to, { t: 'err', rid: id, msg: "This song can't be sent over the internet (it's too large or missing)." }); outgoing.delete(id); return; }
    }
    while (s.next < s.n && s.next < s.acked + WINDOW) {
      const i = s.next++;
      Friends.send(s.to, { t: 'c', rid: id, i, d: b64(s.bytes.subarray(i * CHUNK, Math.min(s.bytes.length, (i + 1) * CHUNK))) });
    }
    clearTimeout(s.timer);
    s.timer = setTimeout(() => outgoing.delete(id), 120000); // give up if they vanish
  }

  // Start sending `t` (a library track) to `to`. extra goes into the meta (e.g. push:true, job).
  async function startSend(to, id, t, extra = {}) {
    let size = 0;
    try { size = native.library.stat ? (await native.library.stat(t.path)).size : 0; } catch {}
    let bytes = null;
    if (!size) { // iPhone: no stat, read it now
      try { bytes = await native.library.readBytes(t.path); bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); size = bytes.length; }
      catch { Friends.send(to, { t: 'err', rid: id, msg: "They can't send this song right now (the file is missing)." }); return; }
    }
    let lan = null;
    try { if (native.lan) lan = (await native.lan.offer(t.path)).urls; } catch { lan = null; }
    if (size > MAX_RELAY && !(lan && lan.length)) { Friends.send(to, { t: 'err', rid: id, msg: 'This file is too large to send over the internet (max 400 MB). Try on the same Wi-Fi.' }); return; }
    const n = Math.max(1, Math.ceil(size / CHUNK));
    const cover = await coverThumb(t);
    const name = fileName(t.path) || `${t.artist} - ${t.title}.mp3`;
    outgoing.set(id, { to, path: t.path, bytes, n, next: 0, acked: 0, timer: setTimeout(() => outgoing.delete(id), 120000) });
    // the receiver answers with ack(0) to start the relay, or fetches it over the LAN and sends cancel
    Friends.send(to, { t: 'meta', rid: id, name, size, n, lan, ...extra, track: { title: t.title, artist: t.artist, album: t.album || '', duration: t.duration || 0, kind: t.kind, source: t.source, url: /^https?:/i.test(t.url || '') ? t.url : null }, cover });
  }

  // PC → linked phone: send a finished download without being asked for it
  function push(to, track, extra = {}) {
    const id = rid();
    startSend(to, id, track, { push: true, ...extra });
    return id;
  }

  function allowed(m) {
    if (m.lt && typeof ListenTogether !== 'undefined' && ListenTogether.allowsFile(m.lt, m.from, m.id)) return 'lt';
    if (typeof PCLink !== 'undefined' && PCLink.isLinkedDevice(m.from)) return 'link';
    if (Friends.isFriend(m.from)) return sharing() ? 'friend' : 'off';
    return null;
  }
  async function serve(m) {
    const reply = (msg) => Friends.send(m.from, { ...msg, rid: m.rid });
    const who2 = allowed(m);
    if (!who2) return reply({ t: 'err', msg: "You're not on their friends list yet. Ask them to add your friend code." });
    if (who2 === 'off') return reply({ t: 'err', msg: 'They turned off library sharing.', off: true });
    if (m.t === 'lib?') {
      const items = State.allTracks().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).map(compact);
      const n = Math.max(1, Math.ceil(items.length / PAGE));
      for (let p = 0; p < n; p++) reply({ t: 'lib', p, n, items: items.slice(p * PAGE, (p + 1) * PAGE) });
      return;
    }
    if (m.t === 'get') {
      const t = State.track(m.id) || State.anyTrack(m.id);
      if (!t || (who2 === 'friend' && !State.track(m.id))) return reply({ t: 'err', msg: "That song isn't in their library anymore." });
      if (outgoing.size >= MAX_SENDS) return reply({ t: 'err', msg: `${(State.activeProfile() || {}).name || 'Your friend'} is busy sending other songs. Try again in a minute.` });
      startSend(m.from, m.rid, t);
    }
  }

  // ---------- message router ----------
  function onMessage(m) {
    if (m.t === 'lib?' || m.t === 'get') return serve(m);
    if (m.t === 'ack' || m.t === 'resend' || m.t === 'cancel') {
      const s = outgoing.get(m.rid);
      if (!s || nc(s.to) !== nc(m.from)) return;
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
    if (m.t === 'meta' && m.push && !incoming.has(m.rid)) {
      // a song our linked PC downloaded for us
      if (typeof PCLink === 'undefined' || !PCLink.isLinkedPC(m.from)) return;
      const hooks = PCLink.hooksFor(m) || {};
      incoming.set(m.rid, { code: nc(m.from), itemId: m.rid, chunks: [], have: 0, total: null, meta: null, last: Date.now(), resends: 0, quiet: true, ...hooks });
      watch(m.rid);
    }
    const r = incoming.get(m.rid);
    if (!r || r.code !== nc(m.from)) return;
    r.last = Date.now();
    if (m.t === 'meta') {
      if (!(m.size > 0)) return fail(m.rid, 'That file is empty.');
      r.meta = m; r.total = m.n; r.rid = m.rid;
      try { r.onProgress && r.onProgress(0, 'start'); } catch {}
      (async () => {
        if (await tryLan(m.rid)) return;
        if (m.size > MAX_RELAY) return fail(m.rid, 'This file is too large to send over the internet. Connect to the same Wi-Fi as the PC and try again.');
        Friends.send(m.from, { t: 'ack', rid: m.rid, n: 0 }); // start the relay transfer
      })();
      return;
    }
    if (m.t === 'c' && r.meta && !r.lan) {
      if (!r.chunks[m.i]) { try { r.chunks[m.i] = unb64(m.d); } catch { return; } }
      while (r.chunks[r.have]) r.have++;
      r.resends = 0;
      Friends.send(m.from, { t: 'ack', rid: m.rid, n: r.have });
      try { r.onProgress && r.onProgress(r.have / r.total, 'relay'); } catch {}
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

  return { init, onChange, fetchLibrary, library, loadCache, download, downloadAll, cancel, job, haveLocal, sharing, setSharing, request, push, get isPhone() { return isPhone(); } };
})();
