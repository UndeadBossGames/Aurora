// Friends: share what you're listening to and see what your friends are playing.
// Every Aurora profile gets a friend code. Your "now playing" is published to a free public
// MQTT broker under that code; friends who add your code subscribe to it. No accounts or servers.
const Friends = (() => {
  // Everyone must use the same broker to see each other. EMQX's free public broker was the
  // only one that worked reliably in testing (Oct 2026).
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt'];
  const NS = 'aurora-player/v1/u/';
  const DM = 'aurora-player/v1/dm/'; // private inbox per friend code (library sharing)
  const dmListeners = [];
  let client = null;
  let state = 'off';
  const presence = new Map(); // code -> payload
  const listeners = [];
  let heartbeat = null;
  let lastPayload = '';
  let smallAvatar = { src: null, data: null };

  const pr = () => State.prefs();
  const emit = () => listeners.forEach((f) => { try { f(); } catch {} });
  const onChange = (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); };

  function genCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const r = crypto.getRandomValues(new Uint8Array(8));
    const s = [...r].map((x) => a[x % a.length]).join('');
    return `AUR-${s.slice(0, 4)}-${s.slice(4)}`;
  }
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^AUR/, '');
  const prettyCode = (c) => { const n = normCode(c); return n.length === 8 ? `AUR-${n.slice(0, 4)}-${n.slice(4)}` : null; };
  const topic = (code) => NS + normCode(code).toLowerCase();
  const dmTopic = (code) => DM + normCode(code).toLowerCase();

  function myCode() {
    if (!pr().friendCode) State.setPref('friendCode', genCode());
    return pr().friendCode;
  }
  const friends = () => pr().friends || [];
  const sharing = () => pr().shareActivity !== false;

  // 96px JPEG of the profile photo so friends see your picture
  async function avatarThumb(p) {
    if (!p || !p.avatar) return null;
    if (smallAvatar.src === p.avatar) return smallAvatar.data;
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = p.avatar; });
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    c.getContext('2d').drawImage(img, 0, 0, 96, 96);
    smallAvatar = { src: p.avatar, data: c.toDataURL('image/jpeg', 0.75) };
    return smallAvatar.data;
  }

  async function buildPayload() {
    const p = State.activeProfile() || { name: 'Aurora user', color: '#8b7bff' };
    const t = Player.current;
    const base = {
      v: 1, name: p.name, color: p.color, avatar: await avatarThumb(p), ts: Date.now(),
      // public profile card (what friends see when they open your profile)
      profile: {
        bio: p.bio || '', pronouns: p.pronouns || '', statusEmoji: p.statusEmoji || '', statusText: p.statusText || '',
        effect: p.effect || '', banner: p.banner && p.banner.type === 'gradient' ? p.banner : null,
        favSong: p.favSong ? { title: p.favSong.title, artist: p.favSong.artist, cover: p.favSong.coverUrl || null } : null,
        favAlbum: p.favAlbum ? { name: p.favAlbum.name, artist: p.favAlbum.artist, cover: p.favAlbum.coverUrl || null } : null,
        favArtist: p.favArtist ? { name: p.favArtist.name, cover: p.favArtist.coverUrl || null } : null,
      },
      together: typeof ListenTogether !== 'undefined' ? ListenTogether.hostCode : null,
    };
    if (!t) return { ...base, status: 'online' };
    let cover = t.coverUrl && /^https:/.test(t.coverUrl) ? t.coverUrl : null;
    try { const art = await native.art.lookup(t.title, t.artist); if (art && art.album) cover = art.album; } catch {}
    const m = Player.media;
    return {
      ...base,
      status: Player.playing ? 'listening' : 'paused',
      track: { title: t.title, artist: t.artist, album: t.album || '', cover, url: t.url || null, source: t.source && t.source !== 'local' ? t.source : null, duration: (isFinite(m.duration) && m.duration) || t.duration || 0, position: m.currentTime || 0, kind: t.kind },
    };
  }

  const publish = debounce(async (force = false) => {
    if (!client) return;
    if (!sharing()) return;
    const payload = JSON.stringify(await buildPayload());
    // skip identical updates (ignoring the timestamp) unless it's a heartbeat
    const sig = payload.replace(/"ts":\d+/, '').replace(/"position":[\d.]+/, '');
    if (!force && sig === lastPayload) return;
    lastPayload = sig;
    client.publish(topic(myCode()), payload, { retain: true });
  }, 800);

  function start() {
    stop();
    const code = myCode();
    const name = (State.activeProfile() || {}).name || 'Aurora user';
    client = new MiniMqtt({
      urls: window.AURORA_BROKER ? [window.AURORA_BROKER] : BROKERS,
      clientId: 'aurora-' + normCode(code).toLowerCase() + '-' + Math.random().toString(36).slice(2, 7),
      will: sharing() ? { topic: topic(code), payload: JSON.stringify({ v: 1, name, status: 'offline', ts: Date.now() }), retain: true } : null,
      onState: (s) => { state = s; if (s === 'connected') { lastPayload = ''; publish(true); } emit(); },
      onMessage: (t, payload) => {
        if (t.startsWith(DM)) {
          let m; try { m = JSON.parse(payload); } catch { return; }
          if (m && m.from) dmListeners.forEach((f) => { try { f(m); } catch (e) { console.warn(e); } });
          return;
        }
        const code = t.slice(NS.length).toUpperCase();
        if (!payload) { presence.delete(code); emit(); return; }
        try { presence.set(code, JSON.parse(payload)); } catch {}
        emit();
      },
    });
    for (const f of friends()) client.subscribe(topic(f.code));
    client.subscribe(dmTopic(code));
    client.connect();
    heartbeat = setInterval(() => publish(true), 60000);
  }

  function stop() {
    clearInterval(heartbeat);
    if (client) {
      try { if (sharing() && client.connected) client.publish(topic(myCode()), JSON.stringify({ v: 1, name: (State.activeProfile() || {}).name, status: 'offline', ts: Date.now() }), { retain: true }); } catch {}
      client.close();
    }
    client = null;
    state = 'off';
    presence.clear();
  }

  function addFriend(code, nickname = '') {
    const pc = prettyCode(code);
    if (!pc) throw new Error('That doesn\'t look like a friend code. It should look like AUR-XXXX-XXXX.');
    if (normCode(pc) === normCode(myCode())) throw new Error('That\'s your own code! Share it with a friend instead.');
    if (friends().some((f) => normCode(f.code) === normCode(pc))) throw new Error('You already added this friend.');
    State.setPref('friends', [...friends(), { code: pc, nickname: nickname.trim().slice(0, 40), addedAt: Date.now() }]);
    if (client) client.subscribe(topic(pc));
    emit();
    return pc;
  }

  function removeFriend(code) {
    State.setPref('friends', friends().filter((f) => normCode(f.code) !== normCode(code)));
    if (client) client.unsubscribe(topic(code));
    presence.delete(normCode(code));
    emit();
  }

  function renameFriend(code, nickname) {
    State.setPref('friends', friends().map((f) => (normCode(f.code) === normCode(code) ? { ...f, nickname: nickname.trim().slice(0, 40) } : f)));
    emit();
  }

  function setSharing(on) {
    State.setPref('shareActivity', !!on);
    if (!on && client) client.publish(topic(myCode()), '', { retain: true }); // clears your retained status
    start();
  }

  // presence for a friend, with "offline" worked out from the last heartbeat
  function statusOf(code) {
    const p = presence.get(normCode(code));
    if (!p) return { status: 'unknown' };
    const age = Date.now() - (p.ts || 0);
    if (p.status !== 'offline' && age > 3 * 60 * 1000) return { ...p, status: 'offline' };
    return p;
  }

  function listeningCount() {
    return friends().filter((f) => statusOf(f.code).status === 'listening').length;
  }

  // ---- direct messages between friends (used by FriendShare) ----
  const isFriend = (code) => friends().some((f) => normCode(f.code) === normCode(code));
  const friendByCode = (code) => friends().find((f) => normCode(f.code) === normCode(code)) || null;
  const onDM = (fn) => { dmListeners.push(fn); return () => dmListeners.splice(dmListeners.indexOf(fn), 1); };
  function send(code, msg) {
    if (!client) return false;
    client.publish(dmTopic(code), JSON.stringify({ ...msg, from: myCode(), fromName: (State.activeProfile() || {}).name || 'Aurora user' }));
    return client.connected;
  }

  function init() {
    myCode();
    start();
    Player.on('track', () => publish());
    Player.on('state', () => publish());
    if (typeof ListenTogether !== 'undefined') ListenTogether.onChange(() => publish());
    Player.media.addEventListener('seeked', () => publish(true));
    State.on('profile', () => start());
    State.on('profiles', () => publish(true));
    window.addEventListener('beforeunload', stop);
    setInterval(emit, 30000); // refresh "x min ago" labels and offline detection
  }

  return { init, onChange, myCode, isFriend, friendByCode, onDM, send, normCode, friends, addFriend, removeFriend, renameFriend, statusOf, sharing, setSharing, listeningCount, prettyCode, get state() { return state; }, restart: start };
})();
