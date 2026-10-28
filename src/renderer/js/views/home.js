// Home view
Views.home = {
  render(root) {
    const me = State.activeProfile() || { name: 'you' };
    const pr = State.prefs();
    const filter = pr.homeFilter || 'all';
    const all = State.allTracks();
    App.setHeaderColor(pr.accent ? hexToRgba(pr.accent, 0.28) : null);

    // ---- filter chips ----
    const chips = html(`<div class="home-chips"></div>`);
    [['all', 'All'], ['music', 'Music'], ['videos', 'Videos'], ['downloads', 'Downloads']].forEach(([k, label]) => {
      const c = html(`<button class="chip ${filter === k ? 'active' : ''}">${label}</button>`);
      c.onclick = () => { State.setPref('homeFilter', k); App.render(); };
      chips.appendChild(c);
    });

    // ---- hero ----
    if (!pr.heroHidden && filter === 'all') root.appendChild(hero());
    root.appendChild(chips);

    if (!all.length) {
      root.appendChild(UI.emptyState({
        iconName: 'sparkle',
        title: `Welcome, ${me.name}!`,
        text: 'Your library is empty. Download music and videos from YouTube, SoundCloud, Spotify links and more — or add files that are already on your computer.',
        actionLabel: 'Open Video Downloader', action: () => App.go('downloader'),
        secondLabel: 'Import a folder', secondAction: () => App.importFolder(),
      }));
      return;
    }

    const pick = (t) => filter === 'all' ? true : filter === 'music' ? t.kind === 'audio' : filter === 'videos' ? t.kind === 'video' : t.source !== 'local';
    const tracks = all.filter(pick);

    // ---- shortcut grid ----
    let entries = State.libraryEntries().filter((e) => filter === 'all' || (filter === 'videos' ? e.kind === 'video' || e.key === 'videos' : filter === 'downloads' ? e.kind === 'download' : e.kind !== 'video'));
    entries.sort((a, b) => b.at - a.at);
    const grid = html(`<div class="shortcut-grid"></div>`);
    entries.slice(0, 8).forEach((e) => {
      const playing = Player.playing && Player.isCurrentContext(e.key);
      const sc = html(`<div class="shortcut ${playing ? 'playing' : ''}" data-key="${esc(e.key)}">
        ${UI.coverHtml(e.cover, 'sc-cover', false)}
        <div class="sc-name">${esc(e.name)}</div>
        ${playing ? `<span class="sc-eq"><i></i><i></i><i></i></span>` : ''}
        <button class="fab sc-play" data-icon="${playing ? 'pause' : 'play'}" data-icon-size="16" title="Play"></button>
      </div>`);
      sc.onclick = () => App.go('collection', e.key);
      $('.sc-play', sc).onclick = (ev) => { ev.stopPropagation(); App.playCollection(e.key); };
      sc.addEventListener('mouseenter', async () => { const c = await dominantColor(UI.firstCover(e.cover)); if (c && App.current.view === 'home') App.setHeaderColor(c); });
      sc.addEventListener('contextmenu', (ev) => { ev.preventDefault(); App.collectionMenu(e.key, ev.clientX, ev.clientY); });
      grid.appendChild(sc);
    });
    if (entries.length) root.appendChild(grid);

    const trackCard = (t, list, ctxKey, ctxName) => UI.card({
      title: t.title,
      sub: esc(t.artist),
      cover: UI.coverSrc(t),
      playing: Player.playing && Player.P.current === t.id,
      onOpen: () => Player.playContext({ key: ctxKey, name: ctxName }, list.map((x) => x.id), list.indexOf(t)),
      onPlay: () => (Player.P.current === t.id ? Player.toggle() : Player.playContext({ key: ctxKey, name: ctxName }, list.map((x) => x.id), list.indexOf(t))),
    });

    // ---- Jump back in (recently played tracks) ----
    const recent = State.S.p.recents.filter((r) => r.kind === 'track').map((r) => State.track(r.id)).filter((t) => t && pick(t)).slice(0, 10);
    if (recent.length) root.appendChild(UI.shelf('Jump back in', recent.map((t) => trackCard(t, recent, 'downloads', 'Recently played'))));

    // ---- Made for <name>: auto mixes per artist ----
    const artists = State.artists().filter((a) => a.count >= 1).sort((a, b) => (State.S.p.plays[b.name] || 0) - (State.S.p.plays[a.name] || 0) || b.count - a.count).slice(0, 8);
    const mixes = artists.map((a, i) => UI.card({
      title: `${a.name} Mix`,
      sub: esc(`${a.name} and more`),
      cover: a.cover ? native.fileUrl(a.cover) : genCover(a.name, a.name),
      key: 'artist:' + a.name,
      playing: Player.playing && Player.isCurrentContext('artist:' + a.name),
      onOpen: () => App.go('collection', 'artist:' + a.name),
      onPlay: () => App.playCollection('artist:' + a.name),
    }));
    if (mixes.length && filter !== 'videos') root.appendChild(UI.shelf(`Made for ${me.name}`, mixes));

    // ---- Recently added ----
    const added = tracks.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 10);
    root.appendChild(UI.shelf(filter === 'videos' ? 'Recently added videos' : 'Recently added', added.map((t) => trackCard(t, added, 'downloads', 'Recently added')), { onMore: () => App.go('collection', filter === 'videos' ? 'videos' : 'downloads') }));

    // ---- Music videos ----
    const vids = all.filter((t) => t.kind === 'video').sort((a, b) => b.addedAt - a.addedAt).slice(0, 10);
    if (vids.length && filter !== 'videos') root.appendChild(UI.shelf('Your music videos', vids.map((t) => trackCard(t, vids, 'videos', 'Videos')), { onMore: () => App.go('collection', 'videos') }));

    // ---- Your playlists ----
    const pls = State.playlists();
    if (pls.length && filter === 'all') root.appendChild(UI.shelf('Your playlists', pls.slice(0, 10).map((p) => UI.card({
      title: p.name, sub: esc(`By ${me.name}`), cover: State.playlistCover(p), key: 'pl:' + p.id,
      playing: Player.playing && Player.isCurrentContext('pl:' + p.id),
      onOpen: () => App.go('collection', 'pl:' + p.id), onPlay: () => App.playCollection('pl:' + p.id),
    }))));

    // ---- Top artists ----
    const top = State.artists().sort((a, b) => b.count - a.count).slice(0, 10);
    if (top.length && filter !== 'videos') root.appendChild(UI.shelf('Your top artists', top.map((a) => UI.card({
      title: a.name, sub: 'Artist', round: true, key: 'artist:' + a.name,
      cover: a.cover ? native.fileUrl(a.cover) : genCover(a.name, a.name),
      onOpen: () => App.go('collection', 'artist:' + a.name), onPlay: () => App.playCollection('artist:' + a.name),
    }))));

    root.appendChild(html(`<div class="view-footer"></div>`));
  },
};

function hero() {
  const art = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 466 262"><defs><linearGradient id="a" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#1a1240"/><stop offset=".5" stop-color="#123f5a"/><stop offset="1" stop-color="#3b1f6b"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b7bff" stop-opacity="0"/><stop offset=".4" stop-color="#8b7bff" stop-opacity=".9"/><stop offset=".7" stop-color="#2de2c9" stop-opacity=".8"/><stop offset="1" stop-color="#9b6bff" stop-opacity="0"/></linearGradient></defs><rect width="466" height="262" fill="url(#a)"/><path d="M-20 170 C 80 60, 160 220, 260 110 S 420 40, 500 120" stroke="url(#b)" stroke-width="38" fill="none" opacity=".7"/><path d="M-20 200 C 90 120, 170 250, 280 150 S 430 90, 500 160" stroke="url(#b)" stroke-width="18" fill="none" opacity=".45"/><g fill="#fff" font-family="Inter,Segoe UI,sans-serif" font-weight="900"><text x="222" y="98" font-size="34" letter-spacing="-1">DOWNLOAD</text><text x="222" y="136" font-size="34" letter-spacing="-1">ANYTHING</text><text x="224" y="166" font-size="12.5" font-weight="600" opacity=".85">YouTube · SoundCloud · Spotify</text></g><circle cx="120" cy="131" r="62" fill="#000" opacity=".35"/><path d="M120 95v52m0 0-20-20m20 20 20-20M92 160h56" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`)}`;
  const el = html(`<div class="hero">
    <div class="hero-top">${UI.coverHtml(genCover('aurora-hero', '', 'sparkle'), 'hero-logo')}<div><div class="hero-brand">Aurora</div><div class="hero-label">Featured</div></div></div>
    <div class="hero-art"><img src="${art}" draggable="false" /></div>
    <h1 class="hero-title">Paste a link. Keep it forever.</h1>
    <div class="hero-actions"><button class="btn-hero">Open downloader</button><button class="icon-btn hero-more" data-icon="dotsH" data-icon-size="20"></button></div>
  </div>`);
  $('.btn-hero', el).onclick = () => App.go('downloader');
  $('.hero-more', el).onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    UI.menu([{ label: 'Hide this', icon: 'close', action: () => { State.setPref('heroHidden', true); App.render(); } }], r.left, r.bottom + 4);
  };
  return el;
}

function hexToRgba(hex, a) {
  const m = String(hex).replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return null;
  return `rgba(${parseInt(m[0], 16)}, ${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${a})`;
}
