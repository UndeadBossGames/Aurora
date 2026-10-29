// Aurora Account: one account for all your devices.
// Sign in with the same account name and password on your PC and your iPhone and they share your
// profile (name, photo, bio, look), Favorites, playlists and your song list. Songs that are on one
// device can be downloaded on the other: copied straight from it (at full Wi-Fi speed on the same
// network), or re-downloaded from YouTube/SoundCloud when that device is off.
//
// There's no Aurora server: your devices keep everything, and they talk through the same relay as
// Friends. Everything is end-to-end encrypted with a key made from your name + password
// (PBKDF2-SHA256, 210,000 rounds → AES-256-GCM), so the relay and anyone else only see noise.
// The password itself is never stored or sent anywhere; only the derived key stays on the device.
//   <base>/state          your account (profile, Favorites, playlists, look)   retained, encrypted
//   <base>/dev/<device>   one device: name, friend code, the songs it has      retained, encrypted
const Account = (() => {
  const NS = 'aurora-player/v1/acct/';
  const ROUNDS = 210000;
  const isPhone = () => !!(window.native && native.platform === 'ios');
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch {} });
  const onChange = (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
  const songKey = (t) => (norm(t.artist === 'Unknown artist' ? '' : t.artist) + '|' + norm(t.title)) || ('u|' + (t.url || t.id));
  const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

  let key = null;          // CryptoKey (AES-GCM)
  let hkey = null;         // CryptoKey (HMAC) to sign song requests between your devices
  let base = null;         // topic prefix
  let unlisten = [];
  let acct = null;         // the account state (merged)
  let applying = false;
  const devices = new Map(); // deviceId -> device record (other devices)
  let status = 'off';      // off | connecting | synced | error
  let lastError = '';

  const info = () => State.prefs().account || null;
  const signedIn = () => !!(info() && info().k);

  // ---------- crypto ----------
  async function derive(name, password) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('aurora-account-v1:' + name), iterations: ROUNDS, hash: 'SHA-256' }, baseKey, 512));
    const id = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(32)))).slice(0, 32);
    return { k: hex(bits.slice(0, 32)), id };
  }
  async function loadKey(k) { return crypto.subtle.importKey('raw', unhex(k), 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function loadHmac(k) { return crypto.subtle.importKey('raw', new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('aurora-dm-auth:' + k))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
  // proves a request comes from one of your own devices (only they have the key)
  async function sign(text) { if (!hkey) throw new Error('Not signed in'); return b64(new Uint8Array(await crypto.subtle.sign('HMAC', hkey, new TextEncoder().encode(String(text))))); }
  async function verify(text, sig) { if (!hkey || !sig) return false; try { return await crypto.subtle.verify('HMAC', hkey, unb64(sig), new TextEncoder().encode(String(text))); } catch { return false; } }
  async function gz(u8, inflate) {
    if (typeof CompressionStream === 'undefined') return null;
    const s = new Blob([u8]).stream().pipeThrough(inflate ? new DecompressionStream('gzip') : new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function seal(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    const z = await gz(raw, false);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, z || raw));
    return `${z ? 'z' : 'p'}1.${b64(iv)}.${b64(ct)}`;
  }
  async function open(text) {
    const [kind, ivs, cts] = String(text || '').split('.');
    if (!cts) return null;
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivs) }, key, unb64(cts)));
    const raw = kind === 'z1' ? await gz(pt, true) : pt;
    return JSON.parse(new TextDecoder().decode(raw));
  }

  // ---------- this device ----------
  function deviceId() {
    const a = info();
    if (a && a.deviceId) return a.deviceId;
    return 'd' + Math.random().toString(36).slice(2, 12);
  }
  const deviceName = () => `${(State.activeProfile() || {}).name || 'Aurora'}'s ${isPhone() ? 'iPhone' : 'PC'}`;
  const compact = (t) => ({ i: t.id, k: songKey(t), t: t.title, a: t.artist, al: t.album || '', d: Math.round(t.duration || 0), v: t.kind === 'video' ? 1 : 0, s: t.source || 'local', u: /^https?:/i.test(t.url || '') ? t.url : null, z: t.size || 0 });

  async function publishDevice() {
    if (!key || !base) return;
    const rec = { v: 1, id: deviceId(), name: deviceName(), platform: isPhone() ? 'ios' : 'pc', fc: Friends.myCode(), ts: Date.now(), tracks: State.allTracks().map(compact) };
    Friends.publishRaw(`${base}/dev/${rec.id}`, await seal(rec), { retain: true });
  }
  const publishDeviceSoon = debounce(() => publishDevice().catch(() => {}), 2500);
  // "I'm online" heartbeat (small, so the song list isn't re-sent every minute)
  const pings = new Map(); // deviceId -> ts
  let pingTimer = null;
  let offlinePing = null; // sealed ahead of time: closing the app can't wait for encryption
  async function ping() {
    if (!key || !base) return;
    Friends.publishRaw(`${base}/on/${deviceId()}`, await seal({ ts: Date.now() }), { retain: true });
    if (!offlinePing) offlinePing = await seal({ ts: 0, off: Date.now() });
  }
  function goingOffline() { if (base && offlinePing) Friends.publishRaw(`${base}/on/${deviceId()}`, offlinePing, { retain: true }); }
  async function onPing(t, payload) {
    const id = t.split('/').pop();
    if (id === deviceId()) return;
    if (!payload) { pings.delete(id); emit(); return; }
    try { const p = await open(payload); if (p && p.off) { pings.set(id, -p.off); emit(); return; } if (p && p.ts) { const was = isOnline(id); pings.set(id, p.ts); if (!was) { emit(); autoGet(); } } } catch {}
  }
  function isOnline(id) {
    const ts = pings.get(id);
    if (ts < 0) return false; // closed Aurora
    if (ts && Date.now() - ts < 150000) return true;
    const d = devices.get(id);
    return !!(d && d.fc && ['online', 'listening', 'idle', 'paused'].includes(Friends.statusOf(d.fc).status));
  }

  // ---------- account state ----------
  const blankAcct = () => ({ v: 1, rev: 0, profile: null, profileAt: 0, look: null, lookAt: 0, liked: {}, playlists: {} });

  async function avatarThumb(src) {
    if (!src) return null;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const k = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, 0, 0, 160, 160);
      return c.toDataURL('image/jpeg', 0.8);
    } catch { return null; }
  }
  const sigOf = (s) => (s ? String(s).length + ':' + String(s).slice(-48) : '');
  async function localProfile() {
    const p = State.activeProfile() || {};
    const pick = {};
    for (const k of ['name', 'color', 'bio', 'pronouns', 'statusEmoji', 'statusText', 'effect']) pick[k] = p[k] || '';
    pick.banner = p.banner && p.banner.type === 'gradient' ? p.banner : null;
    for (const k of ['favSong', 'favAlbum', 'favArtist']) pick[k] = p[k] ? { ...p[k], cover: null } : null;
    const c = State.prefs().accountAvatar;
    pick.avatar = c && c.sig === sigOf(p.avatar) ? c.thumb : await avatarThumb(p.avatar);
    if (p.avatar && pick.avatar && !(c && c.sig === sigOf(p.avatar))) State.setPref('accountAvatar', { sig: sigOf(p.avatar), thumb: pick.avatar });
    return pick;
  }

  // merge two account states (newest wins per item)
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    const out = blankAcct();
    const pa = (a.profileAt || 0) >= (b.profileAt || 0);
    out.profile = pa ? a.profile : b.profile; out.profileAt = Math.max(a.profileAt || 0, b.profileAt || 0);
    const la = (a.lookAt || 0) >= (b.lookAt || 0);
    out.look = la ? a.look : b.look; out.lookAt = Math.max(a.lookAt || 0, b.lookAt || 0);
    for (const src of [a.liked || {}, b.liked || {}]) for (const [k, v] of Object.entries(src)) if (!out.liked[k] || v.at > out.liked[k].at) out.liked[k] = v;
    for (const src of [a.playlists || {}, b.playlists || {}]) for (const [k, v] of Object.entries(src)) if (!out.playlists[k] || (v.updatedAt || 0) > (out.playlists[k].updatedAt || 0)) out.playlists[k] = v;
    out.rev = Math.max(a.rev || 0, b.rev || 0);
    return out;
  }

  async function publishAccount() {
    if (!key || !base || !acct) return;
    acct.rev = Date.now();
    Friends.publishRaw(`${base}/state`, await seal(acct), { retain: true });
    await native.store.write('account-' + info().id, acct);
  }
  const publishAccountSoon = debounce(() => publishAccount().catch(() => {}), 1500);

  // ---------- local changes → account ----------
  const byKey = () => { const m = new Map(); for (const t of State.allTracks()) { const k = songKey(t); if (!m.has(k)) m.set(k, t); } return m; };

  // What this device last synced (kept per device): lets us tell "removed here" apart from
  // "not downloaded here yet", so a song arriving later never undoes anything.
  const syncPrefs = () => State.prefs().accountSync || { likes: [], pls: {} };
  const saveSync = (x) => State.setPref('accountSync', x);

  function captureLikes(sync) {
    let changed = false;
    const was = new Set(sync.likes);
    const now = new Set();
    for (const [k, t] of byKey()) {
      const on = State.isLiked(t.id);
      const cur = acct.liked[k];
      if (on) now.add(k);
      // liked here since the last sync
      if (on && !(cur && cur.on) && !was.has(k)) { acct.liked[k] = { on: true, at: Date.now(), t: t.title, a: t.artist }; changed = true; }
      // unliked here since the last sync
      if (!on && was.has(k) && cur && cur.on) { acct.liked[k] = { on: false, at: Date.now() }; changed = true; }
    }
    sync.likes = [...now];
    return changed;
  }

  function capturePlaylists(sync) {
    let changed = false;
    const seen = new Set();
    for (const pl of State.playlists()) {
      if (!pl.syncId) State.updatePlaylist(pl.id, { syncId: pl.id });
      const sid = pl.syncId;
      seen.add(sid);
      const remote = acct.playlists[sid];
      const local = pl.items.map((i) => State.track(i.id)).filter(Boolean).map((t) => ({ k: songKey(t), t: t.title, a: t.artist }));
      const nowKeys = new Set(local.map((x) => x.k));
      const base = sync.pls[sid];
      let items;
      if (!base || !remote || remote.deleted) items = local;
      else {
        const L0 = new Set(base.L0);
        const B = remote.items || [];
        const bKeys = new Set(B.map((x) => x.k));
        const removed = new Set([...L0].filter((k) => !nowKeys.has(k)));
        const added = local.filter((x) => !bKeys.has(x.k));
        items = [...B.filter((x) => !removed.has(x.k)), ...added];
      }
      const sig = JSON.stringify([pl.name, pl.description || '', items.map((x) => x.k)]);
      const rsig = remote && !remote.deleted ? JSON.stringify([remote.name, remote.description || '', (remote.items || []).map((x) => x.k)]) : null;
      if (sig !== rsig) { acct.playlists[sid] = { id: sid, name: pl.name, description: pl.description || '', items, updatedAt: Date.now() }; changed = true; }
      sync.pls[sid] = { L0: [...nowKeys] };
    }
    // playlists deleted here (that were synced before)
    for (const sid of Object.keys(sync.pls)) {
      if (seen.has(sid)) continue;
      const r = acct.playlists[sid];
      if (r && !r.deleted) { acct.playlists[sid] = { id: sid, deleted: true, updatedAt: Date.now() }; changed = true; }
      delete sync.pls[sid];
    }
    return changed;
  }

  const captureSoon = debounce(async () => {
    if (!acct || applying) return;
    const sync = syncPrefs();
    let changed = captureLikes(sync);
    changed = capturePlaylists(sync) || changed;
    saveSync(sync);
    const prof = await localProfile();
    if (JSON.stringify(prof) !== JSON.stringify(acct.profile)) { acct.profile = prof; acct.profileAt = Date.now(); changed = true; }
    const look = { store: State.prefs().store || null, accent: State.prefs().accent || null };
    if (JSON.stringify(look) !== JSON.stringify(acct.look)) { acct.look = look; acct.lookAt = Date.now(); changed = true; }
    if (changed) publishAccountSoon();
    publishDeviceSoon();
    await applyAccount(); // songs that just arrived go into their playlists / Favorites
  }, 1200);

  // ---------- account → this device ----------
  async function applyAccount() {
    if (!acct) return;
    applying = true;
    try {
      const me = State.activeProfile();
      if (acct.profile && me) {
        const p = acct.profile;
        const patch = {};
        for (const k of ['name', 'color', 'bio', 'pronouns', 'statusEmoji', 'statusText', 'effect', 'banner', 'favSong', 'favAlbum', 'favArtist']) {
          const cur = me[k] === undefined ? null : me[k];
          if (k in p && JSON.stringify(cur || null) !== JSON.stringify(p[k] || null) && !(k === 'banner' && me.banner && me.banner.type === 'image')) patch[k] = p[k];
        }
        // the photo: only when it changed on another device (we remember which thumbnail matches our photo)
        const c = State.prefs().accountAvatar;
        if (p.avatar && !(c && c.thumb === p.avatar) && me.avatar !== p.avatar) {
          patch.avatar = p.avatar;
          State.setPref('accountAvatar', { sig: sigOf(p.avatar), thumb: p.avatar });
        }
        if (Object.keys(patch).length) State.updateProfile(me.id, patch);
      }
      if (acct.look) {
        if (acct.look.store && JSON.stringify(acct.look.store) !== JSON.stringify(State.prefs().store)) { State.setPref('store', acct.look.store); if (typeof Store !== 'undefined' && Store.apply) Store.apply(); }
        if (acct.look.accent && acct.look.accent !== State.prefs().accent) { State.setPref('accent', acct.look.accent); App.applyTheme(); }
      }
      const tracks = byKey();
      const sync = syncPrefs();
      const likes = new Set(sync.likes);
      for (const [k, v] of Object.entries(acct.liked)) {
        const t = tracks.get(k);
        if (!t) continue;
        if (!!v.on !== State.isLiked(t.id)) State.toggleLike(t.id, !!v.on);
        if (v.on) likes.add(k); else likes.delete(k);
      }
      sync.likes = [...likes];
      for (const [sid, r] of Object.entries(acct.playlists)) {
        const local = State.playlists().find((pl) => (pl.syncId || pl.id) === sid);
        if (r.deleted) { if (local) State.deletePlaylist(local.id); delete sync.pls[sid]; continue; }
        const ids = [...new Set((r.items || []).map((x) => tracks.get(x.k)).filter(Boolean).map((t) => t.id))];
        if (!local) {
          const pl = State.createPlaylist({ name: r.name, description: r.description, trackIds: ids });
          State.updatePlaylist(pl.id, { syncId: sid });
        } else {
          const cur = local.items.map((i) => i.id);
          if (local.name !== r.name || (local.description || '') !== (r.description || '') || JSON.stringify(cur) !== JSON.stringify(ids)) {
            State.updatePlaylist(local.id, { name: r.name, description: r.description || '', items: ids.map((id) => ({ id, addedAt: (local.items.find((i) => i.id === id) || {}).addedAt || Date.now() })) });
          }
        }
        sync.pls[sid] = { L0: ids.map((id) => songKey(State.track(id) || {})) };
      }
      saveSync(sync);
    } finally {
      setTimeout(() => { applying = false; }, 200);
    }
    emit();
  }

  // ---------- messages ----------
  async function onState(_t, payload) {
    if (!payload) return;
    let remote;
    try { remote = await open(payload); } catch { return; } // not our key
    if (!remote) return;
    acct = merge(acct || blankAcct(), remote);
    await native.store.write('account-' + info().id, acct);
    status = 'synced';
    await applyAccount();
    // our merged copy may have news for the other devices
    if (JSON.stringify(merge(remote, acct)) !== JSON.stringify(remote)) publishAccountSoon();
    emit();
  }
  async function onDevice(t, payload) {
    const id = t.split('/').pop();
    if (id === deviceId()) return;
    if (!payload) { devices.delete(id); emit(); return; }
    try { const d = await open(payload); if (d && d.id) { devices.set(d.id, d); emit(); autoGet(); } } catch {}
  }

  // ---------- songs on your other devices ----------
  function otherSongs() {
    const mine = byKey();
    const out = new Map();
    for (const d of devices.values()) {
      const online = isOnline(d.id);
      for (const x of d.tracks || []) {
        if (mine.has(x.k)) continue;
        const cur = out.get(x.k);
        const fresher = cur && online === cur.online && Math.abs(pings.get(d.id) || d.ts || 0) > Math.abs(pings.get(cur.device) || 0);
        if (!cur || (online && !cur.online) || fresher) out.set(x.k, { id: x.i, key: x.k, title: x.t, artist: x.a, album: x.al, duration: x.d, kind: x.v ? 'video' : 'audio', source: x.s, url: x.u, size: x.z, device: d.id, deviceName: d.name, fc: d.fc, online });
      }
    }
    return [...out.values()];
  }
  const isMyDevice = (code) => [...devices.values()].some((d) => d.fc && Friends.normCode(d.fc) === Friends.normCode(code));
  const deviceList = () => [...devices.values()].map((d) => ({ ...d, online: isOnline(d.id), seen: Math.max(Math.abs(pings.get(d.id) || 0), d.ts || 0), count: (d.tracks || []).length }));

  // download one song from your account onto this device
  function download(item) {
    if (item.online && item.fc) return FriendShare.download(item.fc, { id: item.id, title: item.title, artist: item.artist, album: item.album, url: item.url, kind: item.kind }, { prefer: 'copy', acct: true });
    if (item.url) return FriendShare.download(item.fc || 'AUR-0000-0000', { id: item.id, title: item.title, artist: item.artist, album: item.album, url: item.url, kind: item.kind }, { prefer: 'source', acct: true });
    UI.toast(`"${item.title}" is only on ${item.deviceName}. Open Aurora there to copy it.`, 4500);
  }
  const job = (item) => FriendShare.job(item.fc || 'AUR-0000-0000', item.id);
  async function downloadAll(items) {
    const byDev = new Map();
    for (const it of items) { const k = it.fc || 'AUR-0000-0000'; if (!byDev.has(k)) byDev.set(k, []); byDev.get(k).push(it); }
    await Promise.all([...byDev.entries()].map(([fc, list]) => FriendShare.downloadAll(fc, list.map((it) => ({ id: it.id, title: it.title, artist: it.artist, album: it.album, url: it.url, kind: it.kind })), { prefer: list[0].online ? 'copy' : 'source', acct: true })));
  }
  const autoGet = debounce(() => {
    if (!signedIn() || !State.prefs().accountAutoGet) return;
    const todo = otherSongs().filter((x) => x.online || x.url).filter((x) => { const j = job(x); return !j || j.status === 'error'; });
    if (todo.length) downloadAll(todo);
  }, 4000);

  // ---------- sign in / out ----------
  async function connect() {
    unlisten.forEach((f) => f()); unlisten = [];
    devices.clear();
    const a = info();
    pings.clear();
    if (!a || !a.k) { clearInterval(pingTimer); key = null; hkey = null; base = null; acct = null; status = 'off'; emit(); return; }
    key = await loadKey(a.k);
    hkey = await loadHmac(a.k);
    base = NS + a.id;
    acct = (await native.store.read('account-' + a.id, null)) || null;
    status = 'connecting';
    unlisten.push(Friends.listen(`${base}/state`, onState));
    unlisten.push(Friends.listen(`${base}/dev/+`, onDevice));
    unlisten.push(Friends.listen(`${base}/on/+`, onPing));
    unlisten.push(Friends.onConnect(() => { publishDeviceSoon(); captureSoon(); ping(); }));
    offlinePing = null;
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { ping().catch(() => {}); emit(); }, 60000);
    ping().catch(() => {});
    // nothing on the relay yet (new account) → this device's data becomes the account
    setTimeout(async () => {
      if (!acct) { acct = blankAcct(); await captureSoon(); }
      if (status === 'connecting') status = Friends.connected ? 'synced' : 'connecting';
      emit();
    }, 6000);
    publishDeviceSoon();
    emit();
  }

  async function signIn(name, password) {
    const n = String(name || '').trim().toLowerCase();
    if (n.length < 3) throw new Error('Pick an account name with at least 3 characters.');
    if (String(password || '').length < 8) throw new Error('Use a password with at least 8 characters.');
    status = 'connecting'; emit();
    const d = await derive(n, password);
    State.setPref('account', { name: n, k: d.k, id: d.id, deviceId: deviceId(), signedInAt: Date.now() });
    await connect();
    return true;
  }

  async function signOut({ forget = false } = {}) {
    if (key && base) {
      // take this device off the account's device list
      Friends.publishRaw(`${base}/dev/${deviceId()}`, '', { retain: true });
      Friends.publishRaw(`${base}/on/${deviceId()}`, '', { retain: true });
    }
    clearInterval(pingTimer);
    const a = info();
    unlisten.forEach((f) => f()); unlisten = [];
    if (a && forget) await native.store.remove('account-' + a.id);
    State.setPref('account', null);
    key = null; hkey = null; base = null; acct = null; devices.clear(); pings.clear(); status = 'off';
    emit();
  }

  function init() {
    State.on('likes', () => { if (signedIn()) captureSoon(); });
    State.on('library', () => { if (signedIn()) { captureSoon(); publishDeviceSoon(); } });
    State.on('profiles', () => { if (signedIn()) captureSoon(); });
    State.on('prefs', (k) => { if (signedIn() && (k === 'store' || k === 'accent')) captureSoon(); });
    State.on('profile', () => connect());
    Friends.onChange(() => emit());
    Friends.onStop(goingOffline); // runs before the connection closes
    connect();
  }

  return {
    init, onChange, signIn, signOut, signedIn, info, songKey, otherSongs, deviceList, isMyDevice, download, downloadAll, job, sign, verify,
    get status() { return status; }, get error() { return lastError; },
    get state() { return acct; }, syncNow: () => { captureSoon(); publishDeviceSoon(); },
    setAutoGet: (on) => { State.setPref('accountAutoGet', !!on); if (on) autoGet(); emit(); },
  };
})();
