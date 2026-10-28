// Listen Together: one person hosts, everyone else hears the same song at the same moment.
// Session state travels over the same public MQTT broker as Friends. Listeners who don't have
// the song get it automatically (matched in their library, or downloaded from YouTube).
const ListenTogether = (() => {
  const brokers = () => (window.AURORA_BROKER ? [window.AURORA_BROKER] : ['wss://broker.emqx.io:8084/mqtt']);
  const NS = 'aurora-player/v1/lt/';
  const me = { id: Math.random().toString(36).slice(2, 10) };
  const S = {
    role: null,          // 'host' | 'guest' | null
    code: null,
    conn: 'off',
    hostState: null,     // last state received (guest)
    recvAt: 0,           // local time that state arrived (guest)
    members: new Map(),  // id -> {name,color,avatar,ts,role}
    chat: [],
    following: true,
    sync: { status: 'idle', drift: 0, note: '' }, // guest sync status
    pendingKey: null,
    seq: 0,
  };
  let client = null, hostBeat = null, memberBeat = null, syncTimer = null, ignoreTrackEvent = 0;
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(S); } catch {} });
  const onChange = (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); };
  const T = (s) => NS + S.code.toLowerCase() + s;
  const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
  const trackKey = (t) => norm(t.artist) + '|' + norm(t.title);

  function genCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'LT-' + [...crypto.getRandomValues(new Uint8Array(6))].map((x) => a[x % a.length]).join('');
  }
  const cleanCode = (c) => { const n = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^LT/, ''); return n.length === 6 ? 'LT-' + n : null; };

  function profileBits() {
    const p = State.activeProfile() || { name: 'Listener', color: '#8b7bff' };
    return { name: p.name, color: p.color, effect: p.effect || '', fc: typeof Friends !== 'undefined' ? Friends.myCode() : null };
  }

  function connect() {
    client = new MiniMqtt({
      urls: brokers(),
      clientId: 'aurora-lt-' + me.id,
      will: { topic: T('/members/' + me.id), payload: '', retain: true },
      onState: (s) => { S.conn = s; if (s === 'connected') { announce(); if (S.role === 'host') publishState(true); } emit(); },
      onMessage,
    });
    client.subscribe(T('/state'));
    client.subscribe(T('/members/+'));
    client.subscribe(T('/chat'));
    client.connect();
  }

  function announce() {
    if (!client) return;
    client.publish(T('/members/' + me.id), JSON.stringify({ ...profileBits(), role: S.role, ts: Date.now() }), { retain: true });
  }

  function onMessage(topic, payload) {
    const rest = topic.slice((NS + S.code.toLowerCase()).length);
    if (rest === '/state') {
      if (!payload) return;
      let st; try { st = JSON.parse(payload); } catch { return; }
      if (st.ended) { if (S.role === 'guest') { UI.toast('The host ended the session'); leave(true); } return; }
      if (S.role === 'guest') { S.hostState = st; S.recvAt = Date.now(); applyHostState(); }
      emit();
    } else if (rest.startsWith('/members/')) {
      const id = rest.slice(9);
      if (!payload) S.members.delete(id); else { try { S.members.set(id, JSON.parse(payload)); } catch {} }
      emit();
    } else if (rest === '/chat') {
      try { const m = JSON.parse(payload); S.chat.push(m); S.chat = S.chat.slice(-60); emit(); } catch {}
    }
  }

  // ---------------- host ----------------
  function host() {
    if (S.role) leave();
    S.role = 'host'; S.code = genCode(); S.members.clear(); S.chat = []; S.seq = 0;
    connect();
    hostBeat = setInterval(() => publishState(true), 3000);
    memberBeat = setInterval(announce, 30000);
    emit();
    return S.code;
  }

  async function hostTrackInfo(t) {
    let cover = t.coverUrl && /^https:/.test(t.coverUrl) ? t.coverUrl : null;
    try { const art = await native.art.lookup(t.title, t.artist); if (art && art.album) cover = art.album; } catch {}
    return { id: t.id, key: trackKey(t), title: t.title, artist: t.artist, album: t.album || '', duration: t.duration || 0, url: t.url || null, source: t.source || null, cover, kind: t.kind };
  }

  let lastTrackInfo = { id: null, info: null };
  async function publishState(beat = false) {
    if (S.role !== 'host' || !client) return;
    const t = Player.current;
    let track = null;
    if (t) {
      if (lastTrackInfo.id !== t.id) lastTrackInfo = { id: t.id, info: await hostTrackInfo(t) };
      track = lastTrackInfo.info;
    }
    const m = Player.media;
    const st = { v: 1, host: profileBits(), track, playing: Player.playing, position: m.currentTime || 0, duration: (isFinite(m.duration) && m.duration) || (t && t.duration) || 0, seq: ++S.seq, sentAt: Date.now(), beat };
    client.publish(T('/state'), JSON.stringify(st), { retain: true });
  }
  const publishSoon = debounce(() => publishState(false), 150);

  // ---------------- guest ----------------
  function join(code) {
    const c = cleanCode(code);
    if (!c) throw new Error('Session codes look like LT-ABC123.');
    if (S.role) leave();
    S.role = 'guest'; S.code = c; S.members.clear(); S.chat = []; S.following = true; S.hostState = null;
    S.sync = { status: 'waiting', drift: 0, note: 'Waiting for the host…' };
    connect();
    memberBeat = setInterval(announce, 30000);
    syncTimer = setInterval(syncTick, 500);
    emit();
    return c;
  }

  // Where the host is right now, compensating for the time since the message arrived.
  function hostPosition() {
    const st = S.hostState;
    if (!st) return 0;
    const elapsed = st.playing ? (Date.now() - S.recvAt) / 1000 + 0.12 : 0; // ~120 ms network latency
    return Math.min(st.duration || Infinity, st.position + elapsed);
  }

  function findLocal(track) {
    const all = State.allTracks();
    return all.find((t) => track.url && t.url === track.url) || all.find((t) => trackKey(t) === track.key) || null;
  }

  async function applyHostState() {
    const st = S.hostState;
    if (!st || !S.following) return;
    if (!st.track) { S.sync = { status: 'waiting', drift: 0, note: 'The host hasn\'t picked a song yet' }; Player.media.pause(); emit(); return; }
    const cur = Player.current;
    if (cur && trackKey(cur) === st.track.key) return syncTick();
    const local = findLocal(st.track);
    if (local) return loadAndSync(local.id);
    // We don't have it: get it and start as soon as it lands.
    if (S.pendingKey === st.track.key) return;
    S.pendingKey = st.track.key;
    S.sync = { status: 'fetching', drift: 0, note: `Getting "${st.track.title}"…`, progress: 0 };
    emit();
    // Straight from the host (exact same file; over Wi-Fi when you're on the same network).
    // iPhones always try this first; PCs do when the song has no YouTube/SoundCloud link.
    const canHost = st.host && st.host.fc && st.track.id && typeof FriendShare !== 'undefined';
    if (canHost && (native.platform === 'ios' || !st.track.url)) {
      const key = st.track.key;
      S.pendingJob = null;
      FriendShare.request(st.host.fc, { id: st.track.id, title: st.track.title }, {
        lt: S.code, quiet: true,
        onProgress: (p, phase) => { if (S.pendingKey !== key) return; S.sync = { status: 'fetching', drift: 0, note: `Getting "${st.track.title}" from ${st.host.name || 'the host'}${phase === 'lan' ? ' over Wi-Fi' : ''}…`, progress: Math.round(p * 100) }; emit(); },
        onDone: (track) => { if (S.pendingKey === key) loadAndSync(track.id); },
        onError: (msg) => { if (S.pendingKey !== key) return; S.pendingKey = null; fetchElsewhere(st, msg); },
      });
      return;
    }
    fetchElsewhere(st);
  }

  // Download the song from YouTube/SoundCloud (on iPhone: through your linked PC)
  async function fetchElsewhere(st, hostError) {
    S.pendingKey = st.track.key;
    try {
      const url = st.track.url || `ytsearch1:${st.track.artist && st.track.artist !== 'Unknown artist' ? st.track.artist + ' - ' : ''}${st.track.title} audio`;
      const jobs = await native.dl.add({ url, format: 'audio-m4a', dir: State.settings().downloadDir, playlist: false, addToLibrary: true });
      S.pendingJob = jobs[0] && jobs[0].id;
    } catch (e) {
      S.sync = { status: 'error', drift: 0, note: 'Couldn\'t get this song: ' + (hostError ? hostError + ' ' : '') + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') };
      S.pendingKey = null;
      emit();
    }
  }

  function loadAndSync(id) {
    ignoreTrackEvent = Date.now();
    Player.playContext({ key: 'together', name: 'Listen Together' }, [id], 0);
    S.pendingKey = null;
    setTimeout(syncTick, 300);
  }

  function syncTick() {
    if (S.role !== 'guest' || !S.following) return;
    const st = S.hostState, m = Player.media, cur = Player.current;
    if (!st || !st.track || !cur || trackKey(cur) !== st.track.key) return;
    const target = hostPosition();
    if (!isFinite(m.duration) || m.readyState < 2) { S.sync = { status: 'loading', drift: 0, note: 'Loading…' }; emit(); return; }
    if (!st.playing) {
      if (!m.paused) { ignoreTrackEvent = Date.now(); m.pause(); }
      if (Math.abs(m.currentTime - target) > 0.5) m.currentTime = target;
      S.sync = { status: 'paused', drift: 0, note: 'The host paused' };
      emit();
      return;
    }
    if (m.paused) { ignoreTrackEvent = Date.now(); m.play().catch(() => {}); }
    const drift = m.currentTime - target; // + = we're ahead
    if (Math.abs(drift) > 0.6) { m.currentTime = target; m.playbackRate = 1; }
    else if (Math.abs(drift) > 0.08) m.playbackRate = drift > 0 ? 0.96 : 1.04; // gently catch up / slow down
    else m.playbackRate = 1;
    S.sync = { status: 'synced', drift, note: Math.abs(drift) < 0.15 ? 'In sync' : 'Syncing…' };
    emit();
  }

  // host: may this guest download the song that's playing? (FriendShare asks before sending)
  function allowsFile(code, fromFc, trackId) {
    if (S.role !== 'host' || !code || cleanCode(code) !== S.code || !fromFc) return false;
    const n = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const member = [...S.members.values()].some((m) => m.fc && n(m.fc) === n(fromFc));
    const cur = Player.current;
    return member && !!cur && cur.id === trackId;
  }

  function resync() { S.following = true; applyHostState(); emit(); }

  // ---------------- common ----------------
  function say(text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text || !client) return;
    client.publish(T('/chat'), JSON.stringify({ ...profileBits(), id: me.id, text, ts: Date.now() }));
  }

  function leave(silent = false) {
    clearInterval(hostBeat); clearInterval(memberBeat); clearInterval(syncTimer);
    if (client) {
      try {
        client.publish(T('/members/' + me.id), '', { retain: true });
        if (S.role === 'host') { client.publish(T('/state'), JSON.stringify({ ended: true }), { retain: false }); client.publish(T('/state'), '', { retain: true }); }
      } catch {}
      const c = client; setTimeout(() => c.close(), 400);
    }
    Player.media.playbackRate = 1;
    client = null;
    Object.assign(S, { role: null, code: null, conn: 'off', hostState: null, pendingKey: null, sync: { status: 'idle', drift: 0, note: '' } });
    S.members.clear();
    emit();
    if (!silent) UI.toast('You left Listen Together');
  }

  function init() {
    // host: share every change right away
    Player.on('track', () => { if (S.role === 'host') { publishSoon(); emit(); } else if (S.role === 'guest' && Date.now() - ignoreTrackEvent > 1500 && S.following && Player.current && S.hostState && S.hostState.track && trackKey(Player.current) !== S.hostState.track.key) { S.following = false; S.sync = { status: 'paused', note: 'You picked another song. Press Resync to follow the host again.' }; emit(); } });
    Player.on('state', () => { if (S.role === 'host') { publishSoon(); emit(); } });
    Player.media.addEventListener('seeked', () => { if (S.role === 'host') publishSoon(); });
    // guest: the song we were missing just finished downloading
    native.dl.onFile(({ track }) => {
      if (S.role !== 'guest' || !S.hostState || !S.hostState.track || !S.pendingKey) return;
      setTimeout(() => { if (State.track(track.id)) loadAndSync(track.id); }, 200);
    });
    native.dl.onJob((j) => {
      if (S.role !== 'guest' || j.id !== S.pendingJob) return;
      if (j.status === 'downloading') { S.sync = { ...S.sync, status: 'fetching', progress: j.progress }; emit(); }
      if (j.status === 'error') { S.sync = { status: 'error', note: 'Couldn\'t get this song: ' + (j.error || 'download failed') }; S.pendingKey = null; emit(); }
    });
    window.addEventListener('beforeunload', () => { if (S.role) leave(true); });
    // title-bar chip
    onChange(() => {
      const chip = $('#lt-chip');
      if (!chip) return;
      chip.hidden = !S.role;
      if (S.role) {
        $('.lt-chip-label', chip).textContent = `${S.role === 'host' ? 'Hosting' : 'Listening together'} · ${Math.max(1, S.members.size)}`;
        chip.classList.toggle('warn', S.role === 'guest' && S.sync.status !== 'synced');
      }
      if (App._updateHubDot) App._updateHubDot();
    });
    const chip = $('#lt-chip');
    if (chip) chip.onclick = () => App.go('together');
  }

  return {
    init, host, join, leave, say, resync, onChange, hostPosition, cleanCode, allowsFile,
    get state() { return S; }, get inSession() { return !!S.role; }, get hostCode() { return S.role === 'host' ? S.code : null; }, me,
  };
})();
