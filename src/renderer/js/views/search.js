// Search / Browse view
Views.search = {
  render(root, query) {
    const q = String(query || '').trim();
    const input = $('#search-input');
    if (document.activeElement !== input) input.value = q;

    if (!q) return browse(root);

    if (isUrl(q)) {
      const el = html(`<div class="url-card">
        <div class="url-icon" data-icon="link" data-icon-size="28"></div>
        <div class="url-text"><b>Download this link?</b><span>${esc(q)}</span></div>
        <button class="btn-accent">Download</button>
      </div>`);
      $('button', el).onclick = () => { input.value = ''; App.go('downloader', q); };
      root.appendChild(el);
      return;
    }

    const ql = q.toLowerCase();
    const score = (t) => {
      const s = `${t.title} ${t.artist} ${t.album}`.toLowerCase();
      if (!s.includes(ql)) return ql.split(/\s+/).every((w) => s.includes(w)) ? 1 : 0;
      return t.title.toLowerCase().startsWith(ql) ? 4 : t.artist.toLowerCase().startsWith(ql) ? 3 : 2;
    };
    const tracks = State.allTracks().map((t) => [t, score(t)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const artists = State.artists().filter((a) => a.name.toLowerCase().includes(ql));
    const pls = State.playlists().filter((p) => p.name.toLowerCase().includes(ql));

    // chips
    const chips = html(`<div class="home-chips sticky-chips"></div>`);
    ['All', 'Songs', 'Videos', 'Artists', 'Playlists'].forEach((c, i) => chips.appendChild(html(`<button class="chip ${i === 0 ? 'active' : ''}">${c}</button>`)));
    root.appendChild(chips);
    let mode = 'All';
    $$('.chip', chips).forEach((c) => c.onclick = () => { mode = c.textContent; $$('.chip', chips).forEach((x) => x.classList.toggle('active', x === c)); draw(); });

    const body = html('<div class="search-body"></div>');
    root.appendChild(body);

    const draw = () => {
      body.innerHTML = '';
      if (!tracks.length && !artists.length && !pls.length) {
        const el = UI.emptyState({ iconName: 'search', title: `No results found for "${q}"`, text: 'Check the spelling, or search the web and download it.', actionLabel: 'Search YouTube & download', action: () => App.go('downloader', q) });
        body.appendChild(el);
        return;
      }
      if (mode === 'All') {
        const top = artists[0] && (!tracks[0] || score(tracks[0]) < 3) ? { kind: 'artist', a: artists[0] } : tracks[0] ? { kind: 'track', t: tracks[0] } : null;
        const row = html(`<div class="search-top"><section class="top-result"><h2>Top result</h2></section><section class="top-songs"><h2>Songs</h2></section></div>`);
        if (top) {
          const t = top.t;
          const card = html(top.kind === 'artist'
            ? `<div class="top-card">${UI.coverHtml(top.a.cover ? native.fileUrl(top.a.cover) : genCover(top.a.name, top.a.name), 'top-cover', true)}<div class="top-name">${esc(top.a.name)}</div><div class="top-sub">Artist</div><button class="fab top-fab" data-icon="play" data-icon-size="22"></button></div>`
            : `<div class="top-card">${UI.coverHtml(UI.coverSrc(t), 'top-cover')}<div class="top-name">${esc(t.title)}</div><div class="top-sub">${t.kind === 'video' ? 'Video' : 'Song'} • <b>${esc(t.artist)}</b></div><button class="fab top-fab" data-icon="play" data-icon-size="22"></button></div>`);
          card.onclick = () => (top.kind === 'artist' ? App.go('collection', 'artist:' + top.a.name) : Player.playContext({ key: 'search', name: `Search: ${q}` }, tracks.map((x) => x.id), 0));
          $('.top-fab', card).onclick = (e) => { e.stopPropagation(); top.kind === 'artist' ? App.playCollection('artist:' + top.a.name) : Player.playContext({ key: 'search', name: `Search: ${q}` }, tracks.map((x) => x.id), 0); };
          $('.top-result', row).appendChild(card);
        }
        $('.top-songs', row).appendChild(UI.trackTable(tracks.slice(0, 4).map((t) => ({ track: t, addedAt: t.addedAt })), { contextKey: 'search', contextName: `Search: ${q}`, compact: true, showAlbum: false, showAdded: false }));
        body.appendChild(row);
        if (artists.length) body.appendChild(UI.shelf('Artists', artists.slice(0, 10).map((a) => UI.card({ title: a.name, sub: 'Artist', round: true, cover: a.cover ? native.fileUrl(a.cover) : genCover(a.name, a.name), onOpen: () => App.go('collection', 'artist:' + a.name), onPlay: () => App.playCollection('artist:' + a.name) }))));
        if (pls.length) body.appendChild(UI.shelf('Playlists', pls.map((p) => UI.card({ title: p.name, sub: esc('By ' + State.activeProfile().name), cover: State.playlistCover(p), onOpen: () => App.go('collection', 'pl:' + p.id), onPlay: () => App.playCollection('pl:' + p.id) }))));
        body.appendChild(webSearchRow(q));
      } else if (mode === 'Songs' || mode === 'Videos') {
        const list = tracks.filter((t) => (mode === 'Videos' ? t.kind === 'video' : true));
        body.appendChild(UI.trackTable(list.map((t) => ({ track: t, addedAt: t.addedAt })), { contextKey: 'search', contextName: `Search: ${q}`, showAdded: false }));
      } else if (mode === 'Artists') {
        body.appendChild(UI.shelf('', artists.map((a) => UI.card({ title: a.name, sub: 'Artist', round: true, cover: a.cover ? native.fileUrl(a.cover) : genCover(a.name, a.name), onOpen: () => App.go('collection', 'artist:' + a.name), onPlay: () => App.playCollection('artist:' + a.name) })), { wrap: true }));
      } else {
        body.appendChild(UI.shelf('', pls.map((p) => UI.card({ title: p.name, sub: 'Playlist', cover: State.playlistCover(p), onOpen: () => App.go('collection', 'pl:' + p.id), onPlay: () => App.playCollection('pl:' + p.id) })), { wrap: true }));
      }
      hydrateIcons(body);
    };
    draw();
  },
};

function webSearchRow(q) {
  const el = html(`<div class="web-search"><span data-icon="download" data-icon-size="20"></span><div><b>Not what you're looking for?</b><span>Search YouTube for "${esc(q)}" and download the best match.</span></div><button class="btn-outline sm">Find &amp; download</button></div>`);
  $('button', el).onclick = () => App.go('downloader', q);
  return el;
}

function browse(root) {
  root.appendChild(html(`<h2 class="browse-title">Browse all</h2>`));
  const grid = html(`<div class="browse-grid"></div>`);
  const tiles = [
    { name: 'Liked Songs', color: '#5038a0', key: 'liked', img: likedCover() },
    { name: 'Downloads', color: '#006450', key: 'downloads', img: downloadsCover() },
    { name: 'Videos', color: '#8d0f5f', key: 'videos', img: videosCover() },
    { name: 'Local Files', color: '#477d95', key: 'local', img: genCover('local', '', 'folder') },
    { name: 'Video Downloader', color: '#e13300', view: 'downloader', img: genCover('dl-tile', '', 'download') },
    { name: 'Your Profile', color: '#1e3264', view: 'profile', img: genCover('profile-tile', '', 'user') },
    { name: 'Settings', color: '#535353', view: 'settings', img: genCover('settings-tile', '', 'settings') },
  ];
  for (const a of State.artists().slice(0, 12)) tiles.push({ name: a.name, color: colorFor(a.name), key: 'artist:' + a.name, img: a.cover ? native.fileUrl(a.cover) : genCover(a.name, a.name) });
  for (const p of State.playlists()) tiles.push({ name: p.name, color: colorFor(p.id), key: 'pl:' + p.id, img: UI.firstCover(State.playlistCover(p)) });
  for (const t of tiles) {
    const el = html(`<div class="browse-tile" style="background:${t.color}"><span>${esc(t.name)}</span><img src="${esc(t.img)}" draggable="false" /></div>`);
    el.onclick = () => (t.view ? App.go(t.view, t.view === 'profile' ? State.S.profiles.activeId : null) : App.go('collection', t.key));
    grid.appendChild(el);
  }
  root.appendChild(grid);
}
