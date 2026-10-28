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
  ];

  const FONTS = [
    { id: 'default', name: 'Aurora', desc: 'Poppins headlines with Inter body text.', sample: 'Aa', display: "'AuroraDisplay', 'AuroraSans', sans-serif", body: "'AuroraSans', 'Segoe UI', sans-serif" },
    { id: 'clean', name: 'Clean', desc: 'Inter everywhere. Neutral and very readable.', sample: 'Aa', display: "'AuroraSans', 'Segoe UI', sans-serif", body: "'AuroraSans', 'Segoe UI', sans-serif" },
    { id: 'friendly', name: 'Friendly', desc: 'Poppins everywhere for a round, playful feel.', sample: 'Aa', display: "'AuroraDisplay', sans-serif", body: "'AuroraDisplay', sans-serif" },
    { id: 'system', name: 'Windows', desc: 'Segoe UI, so Aurora matches the rest of Windows.', sample: 'Aa', display: "'Segoe UI Variable Display', 'Segoe UI', sans-serif", body: "'Segoe UI Variable Text', 'Segoe UI', sans-serif" },
    { id: 'terminal', name: 'Terminal', desc: 'Monospace type for a hacker look.', sample: 'Aa', display: "Consolas, 'Cascadia Code', monospace", body: "Consolas, 'Cascadia Code', monospace" },
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

  const sel = () => Object.assign({ theme: 'aurora-night', font: 'default', player: 'dock', effects: {}, custom: [] }, State.prefs().store || {});
  const save = (s) => { State.setPref('store', s); apply(); };
  const allThemes = () => [...THEMES, ...(sel().custom || [])];

  function themeCss(t) {
    return `:root{--accent:${t.accent};--accent-hover:${t.accent};--accent-2:${t.accent2};--bg:${t.bg};--bg-base:${t.base};--bg-elevated:${t.elev};--bg-highlight:${t.high};--menu-bg:${t.elev};--text-sub:${t.sub};--glow1:${t.glow1};--glow2:${t.glow2};}
body{background:radial-gradient(900px 500px at 12% -10%, var(--glow1), transparent 60%),radial-gradient(800px 500px at 95% 110%, var(--glow2), transparent 60%),var(--bg);}
.playerbar{background:color-mix(in srgb, var(--bg-base) 92%, transparent);}
.main-sticky-header{background:color-mix(in srgb, var(--hdr) 55%, var(--bg-base));}
.input:focus{background:var(--bg-highlight);}`;
  }

  function css() {
    const s = sel();
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

  function applyTheme(id) {
    const t = allThemes().find((x) => x.id === id);
    if (!t) return;
    State.setPref('accent', t.accent);
    save({ ...sel(), theme: id });
    App.applyTheme();
  }

  // album color glow: follow the current track's cover color
  async function updateAlbumColor() {
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
  }

  return { THEMES, FONTS, PLAYERS, EFFECTS, sel, save, apply, applyTheme, allThemes, exportTheme, importTheme, removeCustom, updateAlbumColor, init };
})();
