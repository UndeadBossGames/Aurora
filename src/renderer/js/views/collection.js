// Playlist / Favorites / Downloads / Artist page + expanded "Library" grid
Views.collection = {
  render(root, key) {
    const c = State.collection(key);
    if (!c) {
      root.appendChild(UI.emptyState({ iconName: 'music', title: "Couldn't find that", text: 'It may have been removed.', actionLabel: 'Go home', action: () => App.go('home') }));
      return;
    }
    const pr = State.prefs();
    const me = State.activeProfile();
    const total = c.items.reduce((s, i) => s + (i.track.duration || 0), 0);
    const sortKey = (pr.sorts || {})[key] || 'custom';
    let items = c.items.slice();
    const sorters = {
      title: (a, b) => a.track.title.localeCompare(b.track.title),
      artist: (a, b) => a.track.artist.localeCompare(b.track.artist),
      album: (a, b) => (a.track.album || '').localeCompare(b.track.album || ''),
      added: (a, b) => b.addedAt - a.addedAt,
      duration: (a, b) => (a.track.duration || 0) - (b.track.duration || 0),
    };
    if (sorters[sortKey]) items.sort(sorters[sortKey]);
    let filterText = '';

    const coverSrc = c.cover;
    const head = html(`<div class="coll-header">
      <div class="coll-cover-wrap ${c.editable ? 'editable' : ''}">${UI.coverHtml(coverSrc, 'coll-cover', c.round)}${c.editable ? `<div class="coll-cover-edit">${icon('edit', 48)}<span>Choose photo</span></div>` : ''}</div>
      <div class="coll-meta">
        <div class="coll-type">${c.type === 'Artist' ? `<span class="verified">${icon('checkCircle', 20)}</span> Artist in your library` : esc(c.type)}</div>
        <h1 class="coll-title ${c.name.length > 24 ? 'long' : ''} ${c.editable ? 'editable' : ''}">${esc(c.name)}</h1>
        ${c.description ? `<div class="coll-desc">${esc(c.description)}</div>` : ''}
        <div class="coll-info">
          ${c.type !== 'Artist' ? `${UI.avatarHtml(c.owner === (me && me.name) ? me : { name: c.owner, color: '#8b7bff' }, 24)}<b class="coll-owner">${esc(c.owner)}</b><span class="dot">•</span>` : ''}
          <span>${c.items.length} ${c.items.length === 1 ? 'item' : 'items'}${total ? `, ${c.items.length > 2 ? 'about ' : ''}${esc(fmtLong(total))}` : ''}</span>
        </div>
      </div>
    </div>`);
    root.appendChild(head);
    dominantColor(UI.firstCover(coverSrc)).then((col) => { if (App.current && App.current.param === key) App.setHeaderColor(col || colorFor(key)); });

    if (c.editable) {
      $('.coll-cover-wrap', head).onclick = () => Views.collection.editModal(c.playlist);
      $('.coll-title', head).onclick = () => Views.collection.editModal(c.playlist);
    }
    if ($('.coll-owner', head)) $('.coll-owner', head).onclick = () => me && App.go('profile', me.id);

    // ---- action bar ----
    const isCur = () => Player.isCurrentContext(key);
    const bar = html(`<div class="action-bar">
      <div class="ab-left"></div>
      <div class="ab-right">
        <div class="ab-filter"><button class="icon-btn small ab-search" data-icon="search" title="Search in playlist"></button><input placeholder="Search in ${c.type === 'Artist' ? 'artist' : 'playlist'}" /></div>
        <button class="ab-sort"><span>${{ custom: c.editable ? 'Custom order' : 'Date added', title: 'Title', artist: 'Artist', album: 'Album', added: 'Date added', duration: 'Duration' }[sortKey]}</span><span data-icon="list" data-icon-size="16"></span></button>
      </div>
    </div>`);
    const fab = UI.fab(() => App.playCollection(key), Player.playing && isCur());
    fab.dataset.ctx = key;
    const left = $('.ab-left', bar);
    left.appendChild(fab);
    const shuffleBtn = html(`<button class="icon-btn ab-icon ${Player.P.shuffle ? 'on' : ''}" title="${Player.P.shuffle ? 'Disable' : 'Enable'} shuffle" data-icon="shuffle" data-icon-size="32"></button>`);
    shuffleBtn.onclick = () => { Player.toggleShuffle(); shuffleBtn.classList.toggle('on', Player.P.shuffle); };
    left.appendChild(shuffleBtn);
    if (c.type === 'Artist') {
      const pinned = State.isPinned(key);
      const follow = html(`<button class="btn-outline sm follow">${pinned ? 'Pinned' : 'Pin'}</button>`);
      follow.onclick = () => State.togglePin(key);
      left.appendChild(follow);
    } else if (key === 'downloads' || key === 'videos') {
      const dl = html(`<button class="icon-btn ab-icon" title="Video Downloader" data-icon="downloadCircle" data-icon-size="32"></button>`);
      dl.onclick = () => App.go('downloader');
      left.appendChild(dl);
    }
    const more = html(`<button class="icon-btn ab-icon" title="More options" data-icon="dotsH" data-icon-size="32"></button>`);
    more.onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); App.collectionMenu(key, r.left, r.bottom); };
    left.appendChild(more);
    root.appendChild(bar);

    const fi = $('.ab-filter input', bar);
    $('.ab-search', bar).onclick = () => { $('.ab-filter', bar).classList.add('open'); fi.focus(); };
    fi.addEventListener('blur', () => { if (!fi.value) $('.ab-filter', bar).classList.remove('open'); });
    fi.addEventListener('input', () => { filterText = fi.value.toLowerCase(); drawList(); });
    $('.ab-sort', bar).onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const set = (k) => { State.setPref('sorts', { ...(pr.sorts || {}), [key]: k }); App.render(); };
      UI.menu([
        { header: 'Sort by' },
        { label: c.editable ? 'Custom order' : 'Date added', checked: sortKey === 'custom', action: () => set('custom') },
        { label: 'Title', checked: sortKey === 'title', action: () => set('title') },
        { label: 'Artist', checked: sortKey === 'artist', action: () => set('artist') },
        { label: 'Album', checked: sortKey === 'album', action: () => set('album') },
        { label: 'Date added', checked: sortKey === 'added', action: () => set('added') },
        { label: 'Duration', checked: sortKey === 'duration', action: () => set('duration') },
      ], r.right, r.bottom + 4, { alignRight: true, minWidth: 180 });
    };

    // ---- track list ----
    const listHost = html('<div class="coll-list"></div>');
    root.appendChild(listHost);
    const drawList = () => {
      listHost.innerHTML = '';
      const shown = filterText ? items.filter((i) => `${i.track.title} ${i.track.artist} ${i.track.album}`.toLowerCase().includes(filterText)) : items;
      if (!c.items.length) {
        if (key === 'liked') listHost.appendChild(UI.emptyState({ iconName: 'heart', title: 'Your favorite songs will appear here', text: 'Tap the heart on any song to save it here.', actionLabel: 'Find songs', action: () => App.go('search', '') }));
        else if (c.editable) listHost.appendChild(findForPlaylist(c.playlist));
        else listHost.appendChild(UI.emptyState({ iconName: 'download', title: 'Nothing here yet', text: 'Use the Video Downloader to save music and videos.', actionLabel: 'Open Video Downloader', action: () => App.go('downloader') }));
        return;
      }
      listHost.appendChild(UI.trackTable(shown, { contextKey: key, contextName: c.name, playlistId: c.playlist && c.playlist.id, showAlbum: true }));
      if (c.editable) listHost.appendChild(findForPlaylist(c.playlist, true));
    };
    drawList();

    // ---- sticky header (appears when scrolling) ----
    const sticky = $('#main-sticky');
    sticky.innerHTML = '';
    const sfab = UI.fab(() => App.playCollection(key), Player.playing && isCur(), 48);
    sfab.dataset.ctx = key;
    sticky.appendChild(sfab);
    sticky.appendChild(html(`<span class="sticky-title">${esc(c.name)}</span>`));
    const scroller = $('#main-scroll');
    const onScroll = () => sticky.classList.toggle('show', scroller.scrollTop > head.offsetHeight - 40);
    scroller.addEventListener('scroll', onScroll);
    return () => scroller.removeEventListener('scroll', onScroll);
  },

  editModal(pl) {
    let cover = pl.cover || null;
    const body = html(`<div class="edit-details">
      <div class="ed-cover">${UI.coverHtml(cover ? (cover.startsWith('data:') ? cover : native.fileUrl(cover)) : State.playlistCover(pl), 'ed-cover-img')}<div class="ed-cover-edit">${icon('edit', 40)}<span>Choose photo</span></div></div>
      <div class="ed-fields">
        <input class="input" name="name" placeholder="Add a name" value="${esc(pl.name)}" maxlength="100" />
        <textarea class="input" name="desc" placeholder="Add an optional description" maxlength="300">${esc(pl.description || '')}</textarea>
      </div>
      <p class="ed-note">By proceeding, you agree to give Aurora access to the image you choose to upload. Please make sure you have the right to upload the image.</p>
    </div>`);
    $('.ed-cover', body).onclick = async () => {
      const img = await native.dialog.image();
      if (!img) return;
      cover = img;
      $('.ed-cover', body).querySelector('.cover').outerHTML = UI.coverHtml(img, 'ed-cover-img');
    };
    UI.modal({
      title: 'Edit details', body, width: 524,
      actions: [{ label: 'Save', primary: true, action: async () => {
        let coverPath = pl.cover;
        if (cover && cover !== pl.cover && cover.startsWith('data:')) coverPath = await native.library.saveCover('pl-' + pl.id, cover);
        State.updatePlaylist(pl.id, { name: $('[name=name]', body).value.trim() || pl.name, description: $('[name=desc]', body).value.trim(), cover: coverPath });
      } }],
    });
  },
};

// "Let's find something for your playlist" section
function findForPlaylist(pl, compact = false) {
  const el = html(`<div class="find-more ${compact ? 'compact' : ''}">
    ${compact ? '<hr/>' : ''}
    <h2>Let's find something for your playlist</h2>
    <div class="find-input"><span data-icon="search" data-icon-size="16"></span><input placeholder="Search your library" /></div>
    <div class="find-results"></div>
  </div>`);
  const input = $('input', el);
  const results = $('.find-results', el);
  const have = new Set(pl.items.map((i) => i.id));
  const draw = () => {
    const q = input.value.toLowerCase().trim();
    results.innerHTML = '';
    const list = State.allTracks().filter((t) => !have.has(t.id) && (!q || `${t.title} ${t.artist}`.toLowerCase().includes(q))).slice(0, q ? 20 : 8);
    for (const t of list) {
      const row = html(`<div class="find-row">${UI.coverHtml(UI.coverSrc(t), 'tl-cover')}<div class="tl-text"><div class="tl-name">${esc(t.title)}</div><div class="tl-artist">${esc(t.artist)}</div></div><div class="find-album">${esc(t.album || '')}</div><button class="btn-outline sm">Add</button></div>`);
      $('button', row).onclick = () => { State.addToPlaylist(pl.id, [t.id]); };
      row.ondblclick = () => Player.playContext({ key: 'find', name: pl.name }, [t.id], 0);
      results.appendChild(row);
    }
    if (!list.length) results.appendChild(html(`<div class="muted find-empty">${q ? 'No matches in your library.' : 'Your library is empty.'} <a class="link-btn">Download "${esc(q || 'something')}"</a></div>`)).querySelector('a').onclick = () => App.go('downloader', q);
  };
  input.addEventListener('input', debounce(draw, 120));
  draw();
  return el;
}

// Expanded library (grid of everything)
Views.library = {
  render(root) {
    root.appendChild(html(`<div class="lib-page-head"><h1>Library</h1><button class="pill-btn" data-icon="plus">Create</button></div>`));
    $('.lib-page-head .pill-btn', root).onclick = (e) => App.newPlaylist();
    const entries = State.libraryEntries().sort((a, b) => (b.pinned - a.pinned) || b.at - a.at);
    const cards = entries.map((e) => UI.card({ title: e.name, sub: esc(e.sub), cover: e.cover, round: e.round, key: e.key, playing: Player.playing && Player.isCurrentContext(e.key), onOpen: () => App.go('collection', e.key), onPlay: () => App.playCollection(e.key) }));
    root.appendChild(UI.shelf('', cards, { wrap: true }));
  },
};
