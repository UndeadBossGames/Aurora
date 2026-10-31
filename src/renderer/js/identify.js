// Identify: name that song. Records about 10 seconds of whatever is playing (from the microphone,
// or on a PC straight from the computer's sound), asks a music recognition service (AudD) what it is,
// and lets you download it (as a song or a video) in one tap. Recognized songs are kept in a list.
const Identify = (() => {
  const SECONDS = 10;
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch {} });
  const onChange = (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  const S = { phase: 'idle', level: 0, progress: 0, error: '', result: null, source: 'mic' }; // idle | listening | thinking | found | nomatch | error
  let stopFn = null;
  // the service call (replaceable, e.g. for tests)
  const api = { recognize: (d) => native.identify.recognize(d) };

  const token = () => (State.settings().auddToken || '').trim();
  const history = () => State.prefs().identHistory || [];
  const canSystem = () => !!(window.native && native.platform !== 'ios' && native.identify && native.identify.systemAudio && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  function pickMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg'];
    return (window.MediaRecorder && MediaRecorder.isTypeSupported && types.find((t) => MediaRecorder.isTypeSupported(t))) || '';
  }

  async function getStream(source) {
    if (source === 'system') {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      s.getVideoTracks().forEach((t) => { t.stop(); s.removeTrack(t); });
      if (!s.getAudioTracks().length) throw new Error("Couldn't hear this PC's sound.");
      return s;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This device has no microphone access.');
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  }

  // record SECONDS of audio; reports the loudness for the animation
  async function record(source) {
    const stream = await getStream(source);
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    let ctx = null, raf = 0;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const t0 = performance.now();
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
        S.level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        S.progress = Math.min(1, (performance.now() - t0) / (SECONDS * 1000));
        emit();
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {}
    const done = new Promise((res) => { rec.onstop = res; });
    rec.start(250);
    let timer;
    await new Promise((res) => { timer = setTimeout(res, SECONDS * 1000); stopFn = () => { clearTimeout(timer); res(); }; });
    stopFn = null;
    if (rec.state !== 'inactive') rec.stop();
    await done;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    try { ctx && ctx.close(); } catch {}
    const type = rec.mimeType || mime || 'audio/webm';
    return new Blob(chunks, { type });
  }

  const b64 = (buf) => { const u8 = new Uint8Array(buf); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

  function parse(r) {
    if (!r || r.status !== 'success') {
      const code = r && r.error && r.error.error_code;
      if (code === 901 || code === 900) throw Object.assign(new Error('The free test limit for song recognition is used up. Add your own free key in Settings → Song recognition.'), { needKey: true });
      throw new Error((r && r.error && r.error.error_message) || 'Song recognition failed');
    }
    const x = r.result;
    if (!x || !x.title) return null;
    const am = x.apple_music || {}, sp = x.spotify || {}, dz = x.deezer || {};
    const art = (am.artwork && am.artwork.url ? am.artwork.url.replace('{w}', '600').replace('{h}', '600') : null)
      || (sp.album && sp.album.images && sp.album.images[0] && sp.album.images[0].url)
      || (dz.album && (dz.album.cover_xl || dz.album.cover_big)) || null;
    return { title: x.title, artist: x.artist, album: x.album || '', year: (x.release_date || '').slice(0, 4), link: x.song_link || '', art, at: Date.now() };
  }

  async function start(source = S.source) {
    if (S.phase === 'listening' || S.phase === 'thinking') return;
    Object.assign(S, { phase: 'listening', error: '', result: null, level: 0, progress: 0, source });
    emit();
    // don't identify our own music: pause it while listening on the microphone
    const wasPlaying = source === 'mic' && Player.playing;
    if (wasPlaying) Player.toggle();
    try {
      const clip = await record(source);
      S.phase = 'thinking'; emit();
      const data = { b64: b64(await clip.arrayBuffer()), mime: clip.type, token: token() };
      const r = parse(await api.recognize(data));
      if (!r) { S.phase = 'nomatch'; emit(); return null; }
      S.result = r; S.phase = 'found';
      State.setPref('identHistory', [r, ...history().filter((h) => !(h.title === r.title && h.artist === r.artist))].slice(0, 100));
      emit();
      return r;
    } catch (e) {
      S.phase = 'error';
      S.error = /Permission|NotAllowed|denied/i.test(String(e && (e.name + e.message))) ? (source === 'system' ? 'Aurora needs permission to hear this PC.' : 'Aurora needs microphone access. Allow it in Settings and try again.') : String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/^(TypeError: )?(fetch failed|Failed to fetch|Load failed|NetworkError.*)$/i, "Couldn't reach the song recognition service. Check your internet connection and try again.");
      S.needKey = !!(e && e.needKey);
      emit();
      return null;
    } finally {
      if (wasPlaying && !Player.playing) Player.toggle();
    }
  }
  function stop() { if (stopFn) stopFn(); }
  function reset() { Object.assign(S, { phase: 'idle', error: '', result: null }); emit(); }

  // is it already in the library?
  const norm = (s) => String(s || '').toLowerCase().replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/[^a-z0-9]+/g, '');
  function inLibrary(r) {
    const t = norm(r.title), a = norm(r.artist).slice(0, 6);
    return State.allTracks().find((x) => norm(x.title).includes(t) && (norm(x.artist).includes(a) || norm(x.title).includes(a))) || null;
  }
  // download it: the best match on YouTube, as a song or a video
  async function download(r, kind = 'song') {
    const q = kind === 'video' ? `${r.artist} - ${r.title} official video` : `${r.artist} - ${r.title} audio`;
    const fmt = kind === 'video' ? 'video-best' : (window.native && native.platform === 'ios' ? 'audio-m4a' : 'audio-mp3');
    const jobs = await native.dl.add({ url: `ytsearch1:${q}`, format: fmt, dir: State.settings().downloadDir, playlist: false, addToLibrary: true, meta: { title: r.title, artist: r.artist, cover: r.art || undefined } });
    UI.toast(`Downloading "${r.title}" as a ${kind === 'video' ? 'video' : 'song'}`);
    return jobs;
  }
  function removeFromHistory(r) { State.setPref('identHistory', history().filter((h) => !(h.title === r.title && h.artist === r.artist && h.at === r.at))); emit(); }

  return { api, state: S, start, stop, reset, onChange, history, inLibrary, download, removeFromHistory, canSystem, SECONDS, get hasKey() { return !!token(); } };
})();
