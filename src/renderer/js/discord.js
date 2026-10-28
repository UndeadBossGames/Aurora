// Discord Connection (renderer side): sends "now playing" to the main process,
// which shows it on your Discord profile as "Listening to Aurora".
const DiscordConn = (() => {
  let status = { state: 'off' };
  let art = { album: null, artist: null, key: null };
  const listeners = [];

  const opts = () => {
    const s = State.settings();
    return {
      enabled: !!s.discordEnabled,
      clientId: s.discordClientId || '',
      showProgress: s.discordShowProgress !== false,
      showPaused: !!s.discordShowPaused,
      showButton: s.discordShowButton !== false,
      lookupArt: s.discordLookupArt !== false,
    };
  };

  function nowPlaying() {
    const t = Player.current;
    if (!t) return null;
    const m = Player.media;
    return {
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: (isFinite(m.duration) && m.duration) || t.duration || 0,
      position: m.currentTime || 0,
      playing: Player.playing,
      coverUrl: t.coverUrl || null,
      url: t.url || null,
      source: t.source && t.source !== 'local' ? t.source : null,
    };
  }

  const push = debounce(() => {
    const o = opts();
    if (!o.enabled) return;
    const np = nowPlaying();
    const key = np ? np.title + '|' + np.artist : null;
    native.discord.nowPlaying(np, o).then((r) => {
      if (r && r.art) art = { ...r.art, key };
    }).catch(() => {});
  }, 600);

  async function apply() {
    const o = opts();
    status = await native.discord.configure({ enabled: o.enabled, clientId: o.clientId });
    emit();
    push();
  }

  function setEnabled(on) {
    State.setSetting('discordEnabled', !!on);
    return apply();
  }

  function setOption(key, value) {
    State.setSetting(key, value);
    if (key === 'discordClientId') apply(); else push();
  }

  function emit() { listeners.forEach((f) => { try { f(status); } catch {} }); }
  function onChange(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); }

  async function init() {
    native.discord.onStatus((s) => { status = s; emit(); if (s.state === 'connected') push(); });
    Player.on('track', push);
    Player.on('state', push);
    Player.on('meta', push);
    Player.media.addEventListener('seeked', push);
    State.on('profile', push);
    try { status = await native.discord.status(); } catch {}
    if (opts().enabled) apply();
  }

  // artwork found for the current song (only valid if it matches what is playing)
  function currentArt() {
    const np = nowPlaying();
    return np && art.key === np.title + '|' + np.artist ? art : { album: null, artist: null };
  }

  return { init, setEnabled, setOption, onChange, opts, nowPlaying, currentArt, get status() { return status; } };
})();
