// Aurora data layer: profiles, track catalogue, playlists, likes, recents.
// Everything is persisted as JSON in %APPDATA%/Aurora/data via window.native.store.
const State = (() => {
  const listeners = {};
  const on = (ev, fn) => ((listeners[ev] ||= []).push(fn), () => (listeners[ev] = listeners[ev].filter((f) => f !== fn)));
  const emit = (ev, data) => (listeners[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } });

  const S = {
    profiles: { activeId: null, askOnStartup: false, list: [] },
    tracks: {},
    settings: {},
    p: null, // active profile data
    info: {},
  };

  const writers = {};
  function save(name, getter, ms = 400) {
    clearTimeout(writers[name]);
    writers[name] = setTimeout(() => native.store.write(name, getter()), ms);
  }
  const saveProfiles = () => save('profiles', () => S.profiles);
  const saveTracks = () => save('tracks', () => ({ tracks: S.tracks }), 800);
  const saveSettings = () => save('settings', () => S.settings);
  const saveP = () => { if (S.profiles.activeId) { const id = S.profiles.activeId, data = S.p; save('profile-' + id, () => data); } };

  const PROFILE_COLORS = ['#e8115b', '#509bf5', '#1ed760', '#f59b23', '#af2896', '#27856a', '#8d67ab', '#e13300', '#0d73ec', '#ffc864'];

  const blankProfileData = () => ({
    liked: {},
    playlists: [],
    recents: [],
    plays: {},
    pinned: ['liked'],
    prefs: { accent: '#1ed760', showRightPanel: true, volume: 0.7, sidebarWidth: 420, rpWidth: 420, libFilter: null, libSort: 'recents', libView: 'list', homeFilter: 'all' },
  });

  async function init() {
    S.info = await native.app.info();
    S.profiles = (await native.store.read('profiles', null)) || { activeId: null, askOnStartup: false, list: [] };
    S.tracks = ((await native.store.read('tracks', null)) || {}).tracks || {};
    S.settings = Object.assign({
      downloadDir: S.info.music ? S.info.music + (S.info.platform === 'win32' ? '\\' : '/') + 'Aurora' : '',
      musicFolders: [],
      dlFormat: 'video-best',
      dlAddToLibrary: true,
      dlPlaylist: false,
      customCss: '',
    }, (await native.store.read('settings', null)) || {});
    if (!S.profiles.list.length) {
      // first run - created by the onboarding modal
      S.p = blankProfileData();
      return { firstRun: true };
    }
    if (!S.profiles.list.find((p) => p.id === S.profiles.activeId)) S.profiles.activeId = S.profiles.list[0].id;
    await loadProfileData(S.profiles.activeId);
    return { firstRun: false };
  }

  async function loadProfileData(id) {
    const data = await native.store.read('profile-' + id, null);
    const blank = blankProfileData();
    S.p = Object.assign(blank, data || {});
    S.p.prefs = Object.assign(blankProfileData().prefs, (data && data.prefs) || {});
  }

  // ---------- profiles ----------
  const profiles = () => S.profiles.list;
  const activeProfile = () => S.profiles.list.find((p) => p.id === S.profiles.activeId) || null;

  async function createProfile({ name, avatar = null, color = null }) {
    const p = {
      id: uid(8),
      name: (name || 'Listener').trim().slice(0, 40) || 'Listener',
      avatar,
      color: color || PROFILE_COLORS[S.profiles.list.length % PROFILE_COLORS.length],
      createdAt: Date.now(),
    };
    S.profiles.list.push(p);
    await native.store.write('profile-' + p.id, blankProfileData());
    saveProfiles();
    emit('profiles');
    return p;
  }

  function updateProfile(id, patch) {
    const p = S.profiles.list.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    saveProfiles();
    emit('profiles');
    if (id === S.profiles.activeId) emit('profile');
  }

  async function deleteProfile(id) {
    if (S.profiles.list.length <= 1) return false;
    S.profiles.list = S.profiles.list.filter((p) => p.id !== id);
    await native.store.remove('profile-' + id);
    if (S.profiles.activeId === id) await switchProfile(S.profiles.list[0].id);
    saveProfiles();
    emit('profiles');
    return true;
  }

  async function switchProfile(id) {
    // flush pending writes for the current profile first
    if (S.profiles.activeId && S.p) {
      clearTimeout(writers['profile-' + S.profiles.activeId]);
      await native.store.write('profile-' + S.profiles.activeId, S.p);
    }
    S.profiles.activeId = id;
    await loadProfileData(id);
    saveProfiles();
    emit('profile');
    emit('library');
  }

  // ---------- tracks ----------
  const track = (id) => S.tracks[id] || null;
  const allTracks = () => Object.values(S.tracks);

  function addTracks(list) {
    let added = 0;
    for (const t of list) {
      if (!t || !t.id) continue;
      const prev = S.tracks[t.id];
      if (!prev) added++;
      S.tracks[t.id] = prev ? { ...prev, ...t, addedAt: prev.addedAt, duration: t.duration || prev.duration } : t;
    }
    saveTracks();
    emit('library');
    return added;
  }

  function updateTrack(id, patch) {
    if (!S.tracks[id]) return;
    Object.assign(S.tracks[id], patch);
    saveTracks();
  }

  function removeTracks(ids) {
    for (const id of ids) {
      delete S.tracks[id];
      delete S.p.liked[id];
      for (const pl of S.p.playlists) pl.items = pl.items.filter((i) => i.id !== id);
    }
    saveTracks();
    saveP();
    emit('library');
  }

  // ---------- likes ----------
  const isLiked = (id) => !!S.p.liked[id];
  function toggleLike(id, force) {
    const now = force === undefined ? !S.p.liked[id] : force;
    if (now) S.p.liked[id] = Date.now(); else delete S.p.liked[id];
    saveP();
    emit('likes', id);
    emit('library');
    return now;
  }

  // ---------- playlists ----------
  const playlists = () => S.p.playlists;
  const playlist = (id) => S.p.playlists.find((p) => p.id === id) || null;

  function createPlaylist(opts = {}) {
    const n = S.p.playlists.length + 1;
    const pl = {
      id: uid(10),
      name: opts.name || `My Playlist #${n}`,
      description: opts.description || '',
      cover: opts.cover || null,
      items: (opts.trackIds || []).map((id) => ({ id, addedAt: Date.now() })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    S.p.playlists.unshift(pl);
    touchRecent('playlist', pl.id);
    saveP();
    emit('library');
    return pl;
  }

  function updatePlaylist(id, patch) {
    const pl = playlist(id);
    if (!pl) return;
    Object.assign(pl, patch, { updatedAt: Date.now() });
    saveP();
    emit('library');
  }

  function deletePlaylist(id) {
    S.p.playlists = S.p.playlists.filter((p) => p.id !== id);
    S.p.pinned = S.p.pinned.filter((p) => p !== 'pl:' + id);
    S.p.recents = S.p.recents.filter((r) => r.id !== id);
    saveP();
    emit('library');
  }

  function addToPlaylist(id, trackIds) {
    const pl = playlist(id);
    if (!pl) return 0;
    const have = new Set(pl.items.map((i) => i.id));
    let n = 0;
    for (const t of trackIds) if (!have.has(t)) { pl.items.push({ id: t, addedAt: Date.now() }); n++; }
    pl.updatedAt = Date.now();
    saveP();
    emit('library');
    return n;
  }

  function removeFromPlaylist(id, trackId) {
    const pl = playlist(id);
    if (!pl) return;
    pl.items = pl.items.filter((i) => i.id !== trackId);
    saveP();
    emit('library');
  }

  function togglePin(key) {
    const i = S.p.pinned.indexOf(key);
    if (i >= 0) S.p.pinned.splice(i, 1); else S.p.pinned.push(key);
    saveP();
    emit('library');
  }
  const isPinned = (key) => S.p.pinned.includes(key);

  // ---------- recents & stats ----------
  function touchRecent(kind, id) {
    S.p.recents = [{ kind, id, at: Date.now() }, ...S.p.recents.filter((r) => !(r.kind === kind && r.id === id))].slice(0, 60);
    saveP();
  }
  function countPlay(id) {
    S.p.plays[id] = (S.p.plays[id] || 0) + 1;
    saveP();
  }
  const lastPlayed = (kind, id) => (S.p.recents.find((r) => r.kind === kind && r.id === id) || {}).at || 0;

  // ---------- prefs / settings ----------
  const prefs = () => S.p.prefs;
  function setPref(k, v) { S.p.prefs[k] = v; saveP(); emit('prefs', k); }
  const settings = () => S.settings;
  function setSetting(k, v) { S.settings[k] = v; saveSettings(); emit('settings', k); }

  // ---------- collections (what a "playlist page" shows) ----------
  function collection(key) {
    const me = activeProfile() || { name: 'You' };
    const sortByAdded = (arr) => arr.sort((a, b) => b.addedAt - a.addedAt);
    if (key === 'liked') {
      return {
        key, type: 'Playlist', name: 'Liked Songs', cover: likedCover(), owner: me.name, editable: false,
        items: sortByAdded(Object.entries(S.p.liked).filter(([id]) => S.tracks[id]).map(([id, at]) => ({ track: S.tracks[id], addedAt: at }))),
      };
    }
    if (key === 'downloads') {
      return {
        key, type: 'Playlist', name: 'Downloads', cover: downloadsCover(), owner: 'Aurora', editable: false,
        description: 'Everything you saved with the Video Downloader.',
        items: sortByAdded(allTracks().filter((t) => t.source !== 'local').map((t) => ({ track: t, addedAt: t.addedAt }))),
      };
    }
    if (key === 'videos') {
      return {
        key, type: 'Playlist', name: 'Videos', cover: videosCover(), owner: 'Aurora', editable: false,
        description: 'All music videos and clips in your library.',
        items: sortByAdded(allTracks().filter((t) => t.kind === 'video').map((t) => ({ track: t, addedAt: t.addedAt }))),
      };
    }
    if (key === 'local') {
      return {
        key, type: 'Playlist', name: 'Local Files', cover: genCover('local', '', 'folder'), owner: me.name, editable: false,
        description: 'Music and videos imported from your computer.',
        items: sortByAdded(allTracks().filter((t) => t.source === 'local').map((t) => ({ track: t, addedAt: t.addedAt }))),
      };
    }
    if (key.startsWith('artist:')) {
      const name = key.slice(7);
      const items = allTracks().filter((t) => t.artist === name).map((t) => ({ track: t, addedAt: t.addedAt }));
      const cov = items.find((i) => i.track.cover);
      return { key, type: 'Artist', name, cover: cov ? native.fileUrl(cov.track.cover) : genCover(name, name), owner: name, round: true, editable: false, items: sortByAdded(items) };
    }
    if (key.startsWith('pl:')) {
      const pl = playlist(key.slice(3));
      if (!pl) return null;
      return {
        key, type: 'Playlist', name: pl.name, description: pl.description, owner: me.name, editable: true, playlist: pl,
        cover: playlistCover(pl),
        items: pl.items.filter((i) => S.tracks[i.id]).map((i) => ({ track: S.tracks[i.id], addedAt: i.addedAt })),
      };
    }
    return null;
  }

  function playlistCover(pl) {
    if (pl.cover) return pl.cover.startsWith('data:') ? pl.cover : native.fileUrl(pl.cover);
    const covers = [];
    for (const i of pl.items) {
      const t = S.tracks[i.id];
      if (t && t.cover && !covers.includes(t.cover)) covers.push(t.cover);
      if (covers.length >= 4) break;
    }
    if (covers.length >= 4) return { mosaic: covers.map((c) => native.fileUrl(c)) };
    if (covers.length) return native.fileUrl(covers[0]);
    return genCover(pl.id, '', 'music');
  }

  function artists() {
    const m = new Map();
    for (const t of allTracks()) {
      if (!t.artist || t.artist === 'Unknown artist') continue;
      if (!m.has(t.artist)) m.set(t.artist, { name: t.artist, count: 0, cover: null, addedAt: 0 });
      const a = m.get(t.artist);
      a.count++;
      a.addedAt = Math.max(a.addedAt, t.addedAt || 0);
      if (!a.cover && t.cover) a.cover = t.cover;
    }
    return [...m.values()];
  }

  // Library entries for the left sidebar
  function libraryEntries() {
    const me = activeProfile() || { name: 'You' };
    const out = [];
    const likedCount = Object.keys(S.p.liked).filter((id) => S.tracks[id]).length;
    out.push({ key: 'liked', name: 'Liked Songs', sub: `Playlist • ${likedCount} song${likedCount === 1 ? '' : 's'}`, cover: likedCover(), kind: 'playlist', at: Math.max(lastPlayed('collection', 'liked'), 1) });
    const dl = allTracks().filter((t) => t.source !== 'local');
    if (dl.length) out.push({ key: 'downloads', name: 'Downloads', sub: `Playlist • ${dl.length} item${dl.length === 1 ? '' : 's'}`, cover: downloadsCover(), kind: 'download', at: lastPlayed('collection', 'downloads') || Math.max(...dl.map((t) => t.addedAt || 0)) });
    const vids = allTracks().filter((t) => t.kind === 'video');
    if (vids.length) out.push({ key: 'videos', name: 'Videos', sub: `Playlist • ${vids.length} video${vids.length === 1 ? '' : 's'}`, cover: videosCover(), kind: 'video', at: lastPlayed('collection', 'videos') || 0 });
    const local = allTracks().filter((t) => t.source === 'local');
    if (local.length) out.push({ key: 'local', name: 'Local Files', sub: `Playlist • ${local.length} file${local.length === 1 ? '' : 's'}`, cover: genCover('local', '', 'folder'), kind: 'playlist', at: lastPlayed('collection', 'local') || 0 });
    for (const pl of S.p.playlists) out.push({ key: 'pl:' + pl.id, name: pl.name, sub: `Playlist • ${me.name}`, cover: playlistCover(pl), kind: 'playlist', at: Math.max(lastPlayed('playlist', pl.id), pl.updatedAt || 0, pl.createdAt) });
    for (const a of artists()) out.push({ key: 'artist:' + a.name, name: a.name, sub: 'Artist', cover: a.cover ? native.fileUrl(a.cover) : genCover(a.name, a.name), round: true, kind: 'artist', at: lastPlayed('artist', a.name) || a.addedAt });
    for (const e of out) e.pinned = isPinned(e.key);
    return out;
  }

  return {
    S, on, emit, init,
    profiles, activeProfile, createProfile, updateProfile, deleteProfile, switchProfile, PROFILE_COLORS,
    track, allTracks, addTracks, updateTrack, removeTracks,
    isLiked, toggleLike,
    playlists, playlist, createPlaylist, updatePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, playlistCover,
    togglePin, isPinned, touchRecent, countPlay, lastPlayed,
    prefs, setPref, settings, setSetting,
    collection, artists, libraryEntries,
  };
})();
