// Playback engine. A single <video> element plays both audio and video files.
const Player = (() => {
  const media = document.getElementById('media');
  const listeners = {};
  const on = (ev, fn) => (listeners[ev] ||= []).push(fn);
  const emit = (ev, d) => (listeners[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

  const P = {
    queue: [],        // context order (track ids)
    order: [],        // play order (indexes into queue) - shuffled or not
    pos: -1,          // position within order
    userQueue: [],    // "Add to queue" items, played next
    context: null,    // { key, name }
    shuffle: false,
    repeat: 'off',    // off | all | one
    current: null,    // track id
    muted: false,
    volume: 0.7,
  };

  function buildOrder(startIdx = 0) {
    P.order = P.queue.map((_, i) => i);
    if (P.shuffle) {
      const rest = P.order.filter((i) => i !== startIdx);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      P.order = [startIdx, ...rest];
      P.pos = 0;
    } else {
      P.pos = startIdx;
    }
  }

  function playContext(context, ids, startIdx = 0) {
    if (!ids.length) return;
    P.queue = ids.slice();
    P.context = context;
    if (startIdx < 0) startIdx = P.shuffle ? Math.floor(Math.random() * ids.length) : 0;
    buildOrder(startIdx);
    if (context && context.key) {
      const k = context.key;
      if (k.startsWith('pl:')) State.touchRecent('playlist', k.slice(3));
      else if (k.startsWith('artist:')) State.touchRecent('artist', k.slice(7));
      else State.touchRecent('collection', k);
    }
    load(P.queue[P.order[P.pos]], true);
  }

  function load(id, autoplay = true, startAt = 0) {
    const t = State.track(id);
    if (!t) return;
    P.current = id;
    media.src = native.fileUrl(t.path);
    media.currentTime = startAt || 0;
    if (autoplay) {
      media.play().catch((e) => {
        if (e.name !== 'AbortError') UI.toast(`Can't play "${t.title}". The file may have moved.`);
      });
      State.countPlay(id);
      State.touchRecent('track', id);
    }
    State.setPref('lastPlayed', { id, ctx: P.context, queue: P.queue.slice(0, 500), time: startAt || 0 });
    updateMediaSession(t);
    emit('track', t);
  }

  function updateMediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    const set = (art) => {
      if (P.current !== t.id) return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || '', artwork: art ? [{ src: art, sizes: '512x512' }] : [] });
    };
    set(null);
    // Windows media overlay only accepts http/data/blob artwork, so convert the cover file to a blob URL
    if (t.cover) {
      fetch(native.fileUrl(t.cover)).then((r) => r.blob()).then((b) => {
        if (artUrl) URL.revokeObjectURL(artUrl);
        artUrl = URL.createObjectURL(b);
        set(artUrl);
      }).catch(() => {});
    }
  }
  let artUrl = null;

  function toggle() {
    if (!P.current) {
      // nothing loaded: play liked songs or everything
      const liked = State.collection('liked').items.map((i) => i.track.id);
      const ids = liked.length ? liked : State.allTracks().map((t) => t.id);
      if (ids.length) playContext(liked.length ? { key: 'liked', name: 'Favorites' } : { key: 'downloads', name: 'Library' }, ids, 0);
      else UI.toast('Your library is empty. Download something or add local files first.');
      return;
    }
    if (media.paused) media.play().catch(() => {}); else media.pause();
  }

  function next(auto = false) {
    if (auto && P.repeat === 'one') { media.currentTime = 0; media.play(); return; }
    if (P.userQueue.length) { const id = P.userQueue.shift(); emit('queue'); return load(id, true); }
    if (!P.order.length) return;
    if (P.pos < P.order.length - 1) P.pos++;
    else if (P.repeat === 'all' || !auto) { if (P.shuffle) buildOrder(P.order[0]); P.pos = 0; }
    else { media.pause(); media.currentTime = 0; emit('state'); return; }
    load(P.queue[P.order[P.pos]], true);
  }

  function prev() {
    if (media.currentTime > 3 || P.pos <= 0) { media.currentTime = 0; return; }
    P.pos--;
    load(P.queue[P.order[P.pos]], true);
  }

  function seek(sec) { if (isFinite(media.duration)) media.currentTime = Math.max(0, Math.min(media.duration, sec)); }
  function seekRatio(r) { if (isFinite(media.duration)) media.currentTime = r * media.duration; }

  function setVolume(v) {
    P.volume = Math.max(0, Math.min(1, v));
    media.volume = P.volume;
    if (P.volume > 0 && P.muted) { P.muted = false; media.muted = false; }
    State.setPref('volume', P.volume);
    emit('volume');
  }
  function toggleMute() { P.muted = !P.muted; media.muted = P.muted; emit('volume'); }

  function toggleShuffle() {
    P.shuffle = !P.shuffle;
    if (P.queue.length) {
      const cur = P.order[P.pos];
      buildOrder(cur);
    }
    State.setPref('shuffle', P.shuffle);
    emit('mode');
  }
  function cycleRepeat() {
    P.repeat = P.repeat === 'off' ? 'all' : P.repeat === 'all' ? 'one' : 'off';
    State.setPref('repeat', P.repeat);
    emit('mode');
  }

  function addToQueue(ids) { P.userQueue.push(...ids); emit('queue'); }

  function upNext(limit = 30) {
    const out = P.userQueue.map((id) => ({ id, user: true }));
    for (let i = P.pos + 1; i < P.order.length && out.length < limit; i++) out.push({ id: P.queue[P.order[i]] });
    return out.filter((x) => State.track(x.id));
  }

  function jumpToUpNext(index) {
    const list = upNext(1000);
    const item = list[index];
    if (!item) return;
    if (item.user) { P.userQueue.splice(P.userQueue.indexOf(item.id), 1); emit('queue'); return load(item.id, true); }
    const k = index - P.userQueue.length;
    P.pos = P.pos + 1 + k;
    load(P.queue[P.order[P.pos]], true);
  }

  function restore() {
    const pr = State.prefs();
    P.volume = typeof pr.volume === 'number' ? pr.volume : 0.7;
    media.volume = P.volume;
    P.shuffle = !!pr.shuffle;
    P.repeat = pr.repeat || 'off';
    P.userQueue = [];
    const lp = pr.lastPlayed;
    if (lp && State.track(lp.id)) {
      P.queue = (lp.queue || [lp.id]).filter((id) => State.track(id));
      if (!P.queue.includes(lp.id)) P.queue.unshift(lp.id);
      P.context = lp.ctx || null;
      buildOrder(P.queue.indexOf(lp.id));
      P.current = lp.id;
      const t = State.track(lp.id);
      media.src = native.fileUrl(t.path);
      media.currentTime = lp.time || 0;
      updateMediaSession(t);
      emit('track', t);
    } else {
      media.removeAttribute('src');
      media.load();
      P.current = null; P.queue = []; P.order = []; P.pos = -1;
      emit('track', null);
    }
    emit('volume'); emit('mode'); emit('state');
  }

  function stop() { media.pause(); }

  // ----- media element events -----
  let lastSave = 0;
  media.addEventListener('play', () => emit('state'));
  media.addEventListener('pause', () => emit('state'));
  media.addEventListener('ended', () => next(true));
  media.addEventListener('timeupdate', () => {
    emit('time');
    if (Date.now() - lastSave > 5000 && P.current) {
      lastSave = Date.now();
      const lp = State.prefs().lastPlayed;
      if (lp && lp.id === P.current) { lp.time = media.currentTime; State.setPref('lastPlayed', lp); }
    }
  });
  media.addEventListener('loadedmetadata', () => {
    const t = State.track(P.current);
    if (t && isFinite(media.duration) && Math.abs((t.duration || 0) - media.duration) > 1) State.updateTrack(t.id, { duration: media.duration });
    if (t) {
      const isVideo = media.videoWidth > 0;
      if (isVideo !== (t.kind === 'video')) State.updateTrack(t.id, { kind: isVideo ? 'video' : 'audio' });
    }
    emit('meta');
    emit('time');
  });
  media.addEventListener('error', () => {
    const t = State.track(P.current);
    if (t && media.getAttribute('src')) UI.toast(`Couldn't play "${t.title}" — the file is missing or unsupported.`);
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => media.play());
    navigator.mediaSession.setActionHandler('pause', () => media.pause());
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
  }

  return {
    P, media, on, playContext, load, toggle, next, prev, seek, seekRatio, setVolume, toggleMute,
    toggleShuffle, cycleRepeat, addToQueue, upNext, jumpToUpNext, restore, stop,
    get playing() { return !media.paused && !!P.current; },
    get current() { return State.track(P.current); },
    isCurrentContext: (key) => P.context && P.context.key === key,
  };
})();
