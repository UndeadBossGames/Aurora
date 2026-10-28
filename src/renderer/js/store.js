// Aurora Store: free customizations (themes, fonts, player styles, effects).
// Each profile keeps its own picks in prefs.store. Everything is plain CSS, so you can also
// export a theme to a .json file, share it and import it again.
const Store = (() => {
  const THEMES = [
    { id: 'aurora-night', name: 'Aurora Night', tag: 'Default', desc: 'Violet and teal northern lights over a deep night sky.', accent: '#8b7bff', accent2: '#2de2c9', bg: '#07080d', base: '#10121a', elev: '#191c27', high: '#232737', sub: '#a5abc3', glow1: 'rgba(139,123,255,.16)', glow2: 'rgba(45,226,201,.10)' },
    { id: 'midnight-mono', name: 'Midnight Mono', tag: 'Minimal', desc: 'Pure black and crisp white. No distractions.', accent: '#f2f2f2', accent2: '#9a9a9a', bg: '#000000', base: '#0e0e0e', elev: '#1a1a1a', high: '#262626', sub: '#a0a0a0', glow1: 'rgba(255,255,255,.04)', glow2: 'rgba(255,255,255,.03)' },
    { id: 'sunset-drive', name: 'Sunset Drive', tag: 'Warm', desc: 'Orange and magenta, like a late drive down the coast.', accent: '#ff7a59', accent2: '#ff3fa4', bg: '#0f0710', base: '#1a0e1a', elev: '#251526', high: '#321d33', sub: '#c9a9b8', glow1: 'rgba(255,122,89,.18)', glow2: 'rgba(255,63,164,.12)' },
    { id: 'ocean-depths', name: 'Ocean Depths', tag: 'Cool', desc: 'Calm blues and aqua from deep under the waves.', accent: '#3fa9ff', accent2: '#2df0e0', bg: '#040b14', base: '#0a1522', elev: '#11202f', high: '#182b3e', sub: '#9db4c9', glow1: 'rgba(63,169,255,.18)', glow2: 'rgba(45,240,224,.10)' },
    { id: 'sakura', name: 'Sakura', tag: 'Soft', desc: 'Cherry-blossom pinks on dark plum.', accent: '#ff8fb8', accent2: '#ffc4dd', bg: '#100a0e', base: '#1b1118', elev: '#261823', high: '#33202e', sub: '#c8aebd', glow1: 'rgba(255,143,184,.16)', glow2: 'rgba(255,196,221,.08)' },
    { id: 'forest', name: 'Evergreen', tag: 'Nature', desc: 'Deep pine greens with a fresh lime glow.', accent: '#4ade80', accent2: '#a3e635', bg: '#050c08', base: '#0c1711', elev: '#132219', high: '#1b2e22', sub: '#a3bdac', glow1: 'rgba(74,222,128,.14)', glow2: 'rgba(163,230,53,.08)' },
    { id: 'neon-arcade', name: 'Neon Arcade', tag: 'Bold', desc: 'Hot magenta and electric cyan, straight from the arcade.', accent: '#ff2bd6', accent2: '#00e5ff', bg: '#06030c', base: '#0f0a1a', elev: '#181026', high: '#221735', sub: '#b6a8d6', glow1: 'rgba(255,43,214,.18)', glow2: 'rgba(0,229,255,.14)' },
    { id: 'golden-hour', name: 'Golden Hour', tag: 'Warm', desc: 'Amber and gold, warm like the last light of the day.', accent: '#ffb547', accent2: '#ffd98a', bg: '#0d0a05', base: '#18130b', elev: '#221b10', high: '#2e2416', sub: '#c7b89c', glow1: 'rgba(255,181,71,.15)', glow2: 'rgba(255,217,138,.08)' },
    { id: 'lavender-haze', name: 'Lavender Haze', tag: 'New', desc: 'Dreamy lilac and soft periwinkle.', accent: '#c4a7ff', accent2: '#8fb8ff', bg: '#0b0912', base: '#15111f', elev: '#1f192d', high: '#2a223b', sub: '#b9afcf', glow1: 'rgba(196,167,255,.18)', glow2: 'rgba(143,184,255,.10)' },
    { id: 'crimson-night', name: 'Crimson Night', tag: 'New', desc: 'Deep red and ember orange for late-night sessions.', accent: '#ff4d5e', accent2: '#ff9f43', bg: '#0c0506', base: '#180b0d', elev: '#231114', high: '#30171b', sub: '#c9a3a7', glow1: 'rgba(255,77,94,.17)', glow2: 'rgba(255,159,67,.09)' },
    { id: 'arctic', name: 'Arctic', tag: 'New', desc: 'Icy whites and glacier blue, crisp and clean.', accent: '#9be7ff', accent2: '#e0f7ff', bg: '#060a0e', base: '#0d141b', elev: '#141e27', high: '#1c2934', sub: '#a7bccb', glow1: 'rgba(155,231,255,.14)', glow2: 'rgba(224,247,255,.06)' },
    { id: 'cyber-lime', name: 'Cyber Lime', tag: 'New', desc: 'Acid green on carbon black, built for speed.', accent: '#c6ff00', accent2: '#00ffa3', bg: '#050604', base: '#0d0f0b', elev: '#151912', high: '#1e2419', sub: '#aab59c', glow1: 'rgba(198,255,0,.12)', glow2: 'rgba(0,255,163,.08)' },
    { id: 'coffee-house', name: 'Coffee House', tag: 'New', desc: 'Mocha, caramel and cream. Cozy lo-fi energy.', accent: '#d9a066', accent2: '#f3d3a7', bg: '#0c0806', base: '#17110d', elev: '#211913', high: '#2c221a', sub: '#c3ae9b', glow1: 'rgba(217,160,102,.14)', glow2: 'rgba(243,211,167,.07)' },
    { id: 'retro-wave', name: 'Retro Wave', tag: 'New', desc: '80s grid sunsets: hot pink, purple and chrome.', accent: '#ff4fd8', accent2: '#ffb86c', bg: '#0a0414', base: '#140a24', elev: '#1e1033', high: '#291745', sub: '#c3a9df', glow1: 'rgba(255,79,216,.20)', glow2: 'rgba(255,184,108,.12)' },
    { id: 'matrix', name: 'Matrix', tag: 'New', desc: 'Green code rain on pitch black.', accent: '#22ff66', accent2: '#0aff9d', bg: '#000300', base: '#050b06', elev: '#0b140c', high: '#112014', sub: '#8fbf98', glow1: 'rgba(34,255,102,.10)', glow2: 'rgba(10,255,157,.06)' },
  ];

  const FONTS = [
    { id: 'default', name: 'Aurora', desc: 'Poppins headlines with Inter body text.', sample: 'Aa', display: "'AuroraDisplay', 'AuroraSans', sans-serif", body: "'AuroraSans', 'Segoe UI', sans-serif" },
    { id: 'clean', name: 'Clean', desc: 'Inter everywhere. Neutral and very readable.', sample: 'Aa', display: "'AuroraSans', 'Segoe UI', sans-serif", body: "'AuroraSans', 'Segoe UI', sans-serif" },
    { id: 'friendly', name: 'Friendly', desc: 'Poppins everywhere for a round, playful feel.', sample: 'Aa', display: "'AuroraDisplay', sans-serif", body: "'AuroraDisplay', sans-serif" },
    { id: 'system', name: 'Windows', desc: 'Segoe UI, so Aurora matches the rest of Windows.', sample: 'Aa', display: "'Segoe UI Variable Display', 'Segoe UI', sans-serif", body: "'Segoe UI Variable Text', 'Segoe UI', sans-serif" },
    { id: 'terminal', name: 'Terminal', desc: 'Monospace type for a hacker look.', sample: 'Aa', display: "Consolas, 'Cascadia Code', monospace", body: "Consolas, 'Cascadia Code', monospace" },
    { id: 'editorial', name: 'Editorial', tag: 'New', desc: 'Elegant Georgia serif headlines, like a music magazine.', sample: 'Aa', display: "Georgia, 'Times New Roman', serif", body: "'AuroraSans', 'Segoe UI', sans-serif" },
    { id: 'modern', name: 'Modern', tag: 'New', desc: 'Bahnschrift: condensed, techy and sharp.', sample: 'Aa', display: "Bahnschrift, 'DIN Alternate', 'AuroraSans', sans-serif", body: "Bahnschrift, 'AuroraSans', sans-serif" },
    { id: 'handwritten', name: 'Handwritten', tag: 'New', desc: 'Segoe Print headlines, like notes in a journal.', sample: 'Aa', display: "'Segoe Print', 'Bradley Hand', cursive", body: "'AuroraSans', 'Segoe UI', sans-serif" },
    { id: 'poster', name: 'Poster', tag: 'New', desc: 'Huge Impact headlines for a concert-poster look.', sample: 'Aa', display: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif", body: "'AuroraSans', 'Segoe UI', sans-serif" },
    { id: 'playful', name: 'Playful', tag: 'New', desc: 'Trebuchet MS: friendly and a little quirky.', sample: 'Aa', display: "'Trebuchet MS', 'AuroraDisplay', sans-serif", body: "'Trebuchet MS', 'AuroraSans', sans-serif" },
  ];

  // animated rings/sparkles around your profile picture (friends see them too)
  const PROFILE_EFFECTS = [
    { id: '', name: 'None', desc: 'Keep it simple.' },
    { id: 'glow', name: 'Soft glow', desc: 'A calm glow in your accent color.' },
    { id: 'rainbow', name: 'Rainbow ring', desc: 'A spinning rainbow ring.' },
    { id: 'aurora', name: 'Aurora ring', desc: 'Violet and teal light orbiting your picture.' },
    { id: 'pulse', name: 'Heartbeat', desc: 'Pulses like a beat drop.' },
    { id: 'sparkle', name: 'Sparkles', desc: 'Twinkling stars around you.' },
    { id: 'fire', name: 'On fire', desc: 'Flickering flames for hot takes.' },
    { id: 'frost', name: 'Frost', desc: 'An icy, shimmering halo.' },
    { id: 'neon', name: 'Neon sign', desc: 'Buzzing pink and cyan neon.' },
    { id: 'orbit', name: 'Orbit', desc: 'Little planets circling your picture.' },
  ];

  // effects for the song player bar
  const PLAYER_FX = [
    { id: 'glowbar', name: 'Glowing progress', desc: 'The progress bar glows while music plays.' },
    { id: 'rainbowbar', name: 'Rainbow progress', desc: 'A flowing rainbow progress bar.' },
    { id: 'eq', name: 'Equalizer bars', desc: 'Dancing equalizer bars behind the player.' },
    { id: 'vinyl', name: 'Spinning vinyl', desc: 'The cover art spins like a record.' },
    { id: 'backdrop', name: 'Album backdrop', desc: 'A blurred copy of the cover fills the player.' },
    { id: 'pulseplay', name: 'Pulsing play button', desc: 'The play button pulses to the beat.' },
    { id: 'wave', name: 'Sound wave', desc: 'An animated wave along the top of the player.' },
  ];

  // one-click looks that combine a theme, font and effects
  const BUNDLES = [
    { id: 'synthwave', name: 'Synthwave Night Drive', desc: 'Retro Wave colors, Poster type, neon profile, rainbow progress and an EQ.', theme: 'retro-wave', font: 'poster', profileEffect: 'neon', effects: { animatedBg: true }, playerFx: { rainbowbar: true, eq: true } },
    { id: 'lofi', name: 'Lo-fi Study Room', desc: 'Coffee House colors, handwritten headlines, spinning vinyl and soft glow.', theme: 'coffee-house', font: 'handwritten', profileEffect: 'glow', effects: { glass: true }, playerFx: { vinyl: true, backdrop: true } },
    { id: 'hacker', name: 'Hacker Terminal', desc: 'Matrix greens, monospace type, glowing bars and a sound wave.', theme: 'matrix', font: 'terminal', profileEffect: 'orbit', effects: {}, playerFx: { glowbar: true, wave: true } },
    { id: 'dreamy', name: 'Dreamy Clouds', desc: 'Lavender Haze, Friendly type, sparkles, glass and album glow.', theme: 'lavender-haze', font: 'friendly', profileEffect: 'sparkle', effects: { glass: true, albumGlow: true, rounded: true }, playerFx: { pulseplay: true, backdrop: true } },
  ];

  const PLAYERS = [
    { id: 'dock', name: 'Floating dock', desc: 'A rounded player that floats at the bottom.' },
    { id: 'classic', name: 'Classic bar', desc: 'A flat, full-width bar with no border.' },
    { id: 'compact', name: 'Compact', desc: 'A slimmer player that leaves more room for music.' },
  ];

  const EFFECTS = [
    { id: 'animatedBg', name: 'Moving aurora', desc: 'The background glow slowly drifts and shimmers.' },
    { id: 'glass', name: 'Glass panels', desc: 'See-through, frosted panels show the glow behind them.' },
    { id: 'albumGlow', name: 'Album color glow', desc: 'The background tints to match the cover of the song that\'s playing.' },
    { id: 'rounded', name: 'Extra round', desc: 'Even softer corners everywhere.' },
    { id: 'bigArt', name: 'Big artwork', desc: 'Larger covers on cards and in the player.' },
  ];

  const sel = () => Object.assign({ theme: 'aurora-night', font: 'default', player: 'dock', effects: {}, playerFx: {}, custom: [] }, State.prefs().store || {});
  const save = (s) => { State.setPref('store', s); apply(); };
  const allThemes = () => [...THEMES, ...(sel().custom || [])];

  function themeCss(t) {
    return `:root{--accent:${t.accent};--accent-hover:${t.accent};--accent-2:${t.accent2};--bg:${t.bg};--bg-base:${t.base};--bg-elevated:${t.elev};--bg-highlight:${t.high};--menu-bg:${t.elev};--text-sub:${t.sub};--glow1:${t.glow1};--glow2:${t.glow2};}
body{background:radial-gradient(900px 500px at 12% -10%, var(--glow1), transparent 60%),radial-gradient(800px 500px at 95% 110%, var(--glow2), transparent 60%),var(--bg);}
.playerbar{background:color-mix(in srgb, var(--bg-base) 92%, transparent);}
.main-sticky-header{background:color-mix(in srgb, var(--hdr) 55%, var(--bg-base));}
.input:focus{background:var(--bg-highlight);}`;
  }

  function css(s = sel()) {
    const t = allThemes().find((x) => x.id === s.theme) || THEMES[0];
    const f = FONTS.find((x) => x.id === s.font) || FONTS[0];
    let out = themeCss(t);
    out += `\n:root{--display:${f.display};--font:${f.body};}`;
    if (s.player === 'classic') out += `\n.playerbar{margin:0 calc(var(--gap) * -1);border-radius:0;border:0;border-top:var(--panel-border);background:var(--bg);backdrop-filter:none;}`;
    if (s.player === 'compact') out += `\n:root{--player-h:66px;} .pb-cover-img{width:44px;height:44px;} .pb-center{gap:2px;} .play-btn{width:30px;height:30px;}`;
    const e = s.effects || {};
    if (e.animatedBg) out += `\nbody::before{content:'';position:fixed;inset:-20%;z-index:-1;pointer-events:none;background:radial-gradient(40% 35% at 20% 20%, var(--glow1), transparent 70%),radial-gradient(35% 30% at 80% 70%, var(--glow2), transparent 70%),radial-gradient(30% 25% at 60% 15%, var(--glow1), transparent 70%);filter:blur(30px) saturate(1.4);animation:auroraDrift 26s ease-in-out infinite alternate;} body{isolation:isolate;} @keyframes auroraDrift{0%{transform:translate(0,0) rotate(0)}50%{transform:translate(4%,-3%) rotate(6deg)}100%{transform:translate(-3%,4%) rotate(-5deg)}}`;
    if (e.glass) out += `\n.panel{background:color-mix(in srgb, var(--bg-base) 72%, transparent);backdrop-filter:blur(18px) saturate(1.3);} .rp-head{background:transparent;}`;
    if (e.albumGlow) out += `\nbody{background:radial-gradient(1000px 600px at 50% -10%, color-mix(in srgb, var(--album, var(--accent)) 30%, transparent), transparent 65%),radial-gradient(800px 500px at 95% 110%, var(--glow2), transparent 60%),var(--bg) !important; transition: background 1s;}`;
    if (e.rounded) out += `\n:root{--radius:20px;} .card{border-radius:22px;} .card-cover{border-radius:18px;} .lib-cover,.tl-cover{border-radius:12px;} .playerbar{border-radius:26px;} .chip,.btn-white,.btn-accent,.btn-outline,.pill-btn,.search-pill,.home-btn,.avatar-btn{border-radius:999px;}`;
    const fx = s.playerFx || {};
    if (fx.glowbar) out += `\nbody.is-playing .slider:not(.volume) .slider-fill{background:var(--grad);box-shadow:0 0 10px var(--accent),0 0 22px color-mix(in srgb, var(--accent-2) 60%, transparent);}`;
    if (fx.rainbowbar) out += `\n.slider:not(.volume) .slider-fill{background:linear-gradient(90deg,#ff3b3b,#ffb23b,#f9ff3b,#3bff6b,#3bd8ff,#7b3bff,#ff3bd8,#ff3b3b) 0 0/200% 100% !important;animation:rainbowFlow 3s linear infinite;} @keyframes rainbowFlow{to{background-position:200% 0}}`;
    if (fx.eq) out += `\n.playerbar{position:relative;overflow:hidden;} .playerbar::before{content:'';position:absolute;left:0;right:0;bottom:0;height:70%;pointer-events:none;opacity:0;transition:opacity .4s;background:repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 35%, transparent) 0 6px, transparent 6px 12px);-webkit-mask:linear-gradient(transparent, #000);mask:linear-gradient(transparent,#000);transform-origin:bottom;} body.is-playing .playerbar::before{opacity:.35;animation:eqBounce .45s ease-in-out infinite alternate;} @keyframes eqBounce{0%{transform:scaleY(.35)}50%{transform:scaleY(.8)}100%{transform:scaleY(.5)}} .playerbar>*{position:relative;z-index:1;}`;
    if (fx.vinyl) out += `\n.pb-cover-img{border-radius:50% !important;box-shadow:0 0 0 3px #111,0 0 0 4px rgba(255,255,255,.15);} body.is-playing .pb-cover-img{animation:vinylSpin 6s linear infinite;} @keyframes vinylSpin{to{transform:rotate(360deg)}} .pb-cover{position:relative;} .pb-cover::after{content:'';position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--bg);box-shadow:0 0 0 2px rgba(255,255,255,.2);pointer-events:none;}`;
    if (fx.backdrop) out += `\n.playerbar{position:relative;overflow:hidden;} .playerbar::after{content:'';position:absolute;inset:-30px;background:var(--np-cover, none) center/cover;filter:blur(28px) saturate(1.4) brightness(.45);opacity:.85;pointer-events:none;z-index:0;} .playerbar>*{position:relative;z-index:1;}`;
    if (fx.pulseplay) out += `\nbody.is-playing #btn-play{animation:playPulse 1s ease-in-out infinite;} @keyframes playPulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent)}50%{box-shadow:0 0 0 10px transparent;transform:scale(1.06)}}`;
    if (fx.wave) out += `\n.playerbar{position:relative;} .pb-center::before{content:'';position:absolute;left:0;right:0;top:-8px;height:6px;opacity:0;transition:opacity .4s;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='6'%3E%3Cpath d='M0 3 Q10 0 20 3 T40 3' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='.8'/%3E%3C/svg%3E") repeat-x;} body.is-playing .pb-center::before{opacity:.6;animation:waveMove 1.2s linear infinite;} .pb-center{position:relative;} @keyframes waveMove{to{background-position:40px 0}}`;
    if (e.bigArt) out += `\n.shelf-row{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));} .pb-cover-img{width:64px;height:64px;} .lib-cover,.lib-cover-wrap{width:56px;height:56px;}`;
    return out;
  }

  function apply() {
    let el = document.getElementById('store-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'store-css';
      document.head.insertBefore(el, document.getElementById('user-css'));
    }
    el.textContent = css();
  }

  function applyBundle(id) {
    const b = BUNDLES.find((x) => x.id === id);
    if (!b) return;
    const t = allThemes().find((x) => x.id === b.theme);
    if (t) State.setPref('accent', t.accent);
    save({ ...sel(), theme: b.theme, font: b.font, effects: { ...b.effects }, playerFx: { ...b.playerFx } });
    const me = State.activeProfile();
    if (me) State.updateProfile(me.id, { effect: b.profileEffect });
    App.applyTheme();
  }

  // Try a theme for a moment without committing
  let previewFrom = null;
  function previewTheme(id) {
    if (!previewFrom) previewFrom = { theme: sel().theme, accent: State.prefs().accent };
    const t = allThemes().find((x) => x.id === id);
    if (!t) return;
    document.documentElement.style.setProperty('--accent', t.accent);
    const el = document.getElementById('store-css');
    const s = { ...sel(), theme: id };
    el.textContent = css(s);
  }
  function endPreview(keep) {
    if (!previewFrom) return;
    previewFrom = null;
    if (!keep) { apply(); App.applyTheme(); }
  }

  function applyTheme(id) {
    const t = allThemes().find((x) => x.id === id);
    if (!t) return;
    State.setPref('accent', t.accent);
    save({ ...sel(), theme: id });
    App.applyTheme();
  }

  // album color glow: follow the current track's cover color
  async function updateAlbumColor() {
    const t0 = Player.current;
    document.querySelector('.playerbar') && document.querySelector('.playerbar').style.setProperty('--np-cover', t0 ? `url('${UI.coverSrc(t0)}')` : 'none');
    if (!(sel().effects || {}).albumGlow) return;
    const t = Player.current;
    const col = t ? await dominantColor(UI.coverSrc(t)) : null;
    document.documentElement.style.setProperty('--album', col || 'var(--accent)');
  }

  function exportTheme() {
    const s = sel();
    const t = allThemes().find((x) => x.id === s.theme) || THEMES[0];
    const data = { aurora_theme: 1, ...t, id: undefined, font: s.font, player: s.player, effects: s.effects };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t.name.replace(/[^\w -]/g, '')}.aurora-theme.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importTheme(file) {
    return file.text().then((txt) => {
      const d = JSON.parse(txt);
      const need = ['accent', 'accent2', 'bg', 'base', 'elev', 'high', 'sub'];
      if (!d || !need.every((k) => typeof d[k] === 'string' && /^#|^rgba?\(/.test(d[k]))) throw new Error('This file isn\'t an Aurora theme.');
      const clean = (v) => String(v).replace(/[;{}<>]/g, '');
      const t = { id: 'custom-' + uid(6), name: String(d.name || 'My theme').slice(0, 40), tag: 'Imported', desc: String(d.desc || 'Imported theme').slice(0, 120), glow1: clean(d.glow1 || 'rgba(255,255,255,.06)'), glow2: clean(d.glow2 || 'rgba(255,255,255,.04)') };
      need.forEach((k) => (t[k] = clean(d[k])));
      const s = sel();
      save({ ...s, custom: [...(s.custom || []), t] });
      return t;
    });
  }

  function removeCustom(id) {
    const s = sel();
    save({ ...s, custom: (s.custom || []).filter((t) => t.id !== id), theme: s.theme === id ? 'aurora-night' : s.theme });
    App.applyTheme();
  }

  function init() {
    apply();
    State.on('profile', apply);
    Player.on('track', updateAlbumColor);
    Player.on('state', () => document.body.classList.toggle('is-playing', Player.playing));
  }

  return { THEMES, FONTS, PLAYERS, EFFECTS, PROFILE_EFFECTS, PLAYER_FX, BUNDLES, applyBundle, previewTheme, endPreview, sel, save, apply, applyTheme, allThemes, exportTheme, importTheme, removeCustom, updateAlbumColor, init };
})();
