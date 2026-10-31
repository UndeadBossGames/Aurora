// Reusable UI building blocks: covers, cards, track rows, menus, modals, toasts.
const UI = (() => {
  // ---------- toast ----------
  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- covers ----------
  function coverSrc(track) {
    if (!track) return genCover('none');
    if (track.cover) return native.fileUrl(track.cover);
    return genCover(track.album || track.title || track.id, '', track.kind === 'video' ? 'video' : 'music');
  }

  function coverHtml(cover, cls = '', round = false) {
    if (cover && typeof cover === 'object' && cover.mosaic) {
      return `<div class="cover mosaic ${cls} ${round ? 'round' : ''}">${cover.mosaic.slice(0, 4).map((s) => `<img src="${esc(s)}" draggable="false" loading="lazy" />`).join('')}</div>`;
    }
    return `<div class="cover ${cls} ${round ? 'round' : ''}"><img src="${esc(cover || genCover('x'))}" draggable="false" loading="lazy" onerror="this.onerror=null;this.src='${genCover('broken')}'" /></div>`;
  }

  const firstCover = (cover) => (cover && typeof cover === 'object' && cover.mosaic ? cover.mosaic[0] : cover);

  function avatarHtml(profile, size = 32) {
    if (!profile) return '';
    const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px;background:${profile.avatar ? '#282828' : profile.color}`;
    return `<span class="avatar-img" style="${style}">${profile.avatar ? `<img src="${esc(profile.avatar)}" draggable="false" />` : esc((profile.name || '?').trim()[0] || '?').toUpperCase()}</span>`;
  }

  // ---------- context / dropdown menus ----------
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }

  // items: [{label, icon, action, danger, checked, sub:[...], divider:true, disabled}]
  function menu(items, x, y, opts = {}) {
    closeMenu();
    const m = buildMenu(items);
    m.classList.add('ctx-menu');
    if (opts.minWidth) m.style.minWidth = opts.minWidth + 'px';
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (opts.alignRight) x = x - r.width;
    m.style.left = Math.max(8, Math.min(x, vw - r.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, vh - r.height - 8)) + 'px';
    openMenu = m;
    return m;
  }

  function buildMenu(items) {
    const m = document.createElement('div');
    m.className = 'menu';
    for (const it of items) {
      if (!it) continue;
      if (it.divider) { m.appendChild(html('<div class="menu-divider"></div>')); continue; }
      if (it.header) { m.appendChild(html(`<div class="menu-header">${esc(it.header)}</div>`)); continue; }
      const row = html(`<button class="menu-item ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''} ${it.checked ? 'checked' : ''}">
        ${it.iconHtml ? `<span class="mi-icon">${it.iconHtml}</span>` : it.icon ? `<span class="mi-icon" data-icon="${it.icon}" data-icon-size="16"></span>` : ''}
        <span class="mi-label">${esc(it.label)}</span>
        ${it.checked ? `<span class="mi-check" data-icon="check" data-icon-size="16"></span>` : ''}
        ${it.sub ? `<span class="mi-arrow" data-icon="chevronRight" data-icon-size="14"></span>` : ''}
        ${it.hint ? `<span class="mi-hint">${esc(it.hint)}</span>` : ''}
      </button>`);
      if (it.sub) {
        let subEl = null;
        row.addEventListener('mouseenter', () => {
          $$('.menu.sub', m.parentNode || document).forEach((s) => s.remove());
          subEl = buildMenu(it.sub);
          subEl.classList.add('sub', 'ctx-menu');
          document.body.appendChild(subEl);
          const rr = row.getBoundingClientRect();
          const sr = subEl.getBoundingClientRect();
          let left = rr.right + 4;
          if (left + sr.width > window.innerWidth - 8) left = rr.left - sr.width - 4;
          subEl.style.left = left + 'px';
          subEl.style.top = Math.min(rr.top - 4, window.innerHeight - sr.height - 8) + 'px';
          subEl.addEventListener('mousedown', (e) => e.stopPropagation());
        });
      } else {
        row.addEventListener('mouseenter', () => { if (!m.classList.contains('sub')) $$('.menu.sub').forEach((s) => s.remove()); });
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if (it.disabled) return;
          closeAll();
          it.action && it.action();
        });
      }
      m.appendChild(row);
    }
    m.addEventListener('mousedown', (e) => e.stopPropagation());
    return m;
  }

  function closeAll() { closeMenu(); $$('.menu.sub').forEach((s) => s.remove()); }

  document.addEventListener('mousedown', closeAll);
  window.addEventListener('blur', closeAll);
  window.addEventListener('resize', closeAll);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); closeModal(); } });

  // ---------- track context menu ----------
  function trackMenu(track, x, y, ctx = {}) {
    const pls = State.playlists();
    const liked = State.isLiked(track.id);
    const items = [
      { label: 'Add to playlist', icon: 'plus', sub: [
        { label: 'New playlist', icon: 'plus', action: () => { const pl = State.createPlaylist({ trackIds: [track.id] }); toast(`Added to ${pl.name}`); } },
        pls.length ? { divider: true } : null,
        ...pls.map((p) => ({ label: p.name, action: () => { const n = State.addToPlaylist(p.id, [track.id]); toast(n ? `Added to ${p.name}` : `Already in ${p.name}`); } })),
      ] },
      ctx.playlistId ? { label: 'Remove from this playlist', icon: 'trash', action: () => State.removeFromPlaylist(ctx.playlistId, track.id) } : null,
      { label: liked ? 'Remove from your Favorites' : 'Save to your Favorites', iconHtml: liked ? `<span class="accent">${icon('heartFilled', 16)}</span>` : icon('heart', 16), action: () => { const v = State.toggleLike(track.id); toast(v ? 'Added to Favorites' : 'Removed from Favorites'); } },
      { label: 'Add to queue', icon: 'queue', action: () => { Player.addToQueue([track.id]); toast('Added to queue'); } },
      { divider: true },
      track.artist && track.artist !== 'Unknown artist' ? { label: 'Go to artist', icon: 'user', action: () => App.go('collection', 'artist:' + track.artist) } : null,
      { label: 'Show in folder', icon: 'folder', action: () => native.shell.showItem(track.path) },
      track.url ? { label: 'Open source page', icon: 'external', action: () => native.shell.openExternal(track.url) } : null,
      { label: 'Edit details', icon: 'edit', action: () => editTrackModal(track) },
      State.profiles().length > 1 ? { label: 'Send to another profile…', icon: 'transfer', action: () => Views.transfer.open([track.id]) } : null,
      { divider: true },
      { label: 'Remove from library', icon: 'close', action: () => { State.removeTracks([track.id]); toast('Removed from library'); } },
      { label: 'Delete file', icon: 'trash', danger: true, action: async () => {
        if (!(await native.dialog.confirm({ message: `Delete "${track.title}"?`, detail: 'The file will be moved to the Recycle Bin.', ok: 'Delete' }))) return;
        await native.library.deleteFile(track.path);
        State.removeTracks([track.id]);
        toast('File moved to Recycle Bin');
      } },
    ];
    menu(items, x, y);
  }

  // ---------- modal ----------
  function modal({ title, body, actions = [], width = 524, onClose }) {
    closeModal();
    const root = $('#overlay-root');
    const el = html(`<div class="modal-backdrop">
      <div class="modal" style="width:${width}px">
        <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn small modal-x" data-icon="close" title="Close"></button></div>
        <div class="modal-body"></div>
        ${actions.length ? '<div class="modal-actions"></div>' : ''}
      </div></div>`);
    const b = $('.modal-body', el);
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    hydrateIcons(b);
    for (const a of actions) {
      const btn = html(`<button class="${a.primary ? 'btn-white' : 'btn-ghost'}">${esc(a.label)}</button>`);
      btn.addEventListener('click', async () => { const r = a.action ? await a.action(el) : true; if (r !== false) closeModal(); });
      $('.modal-actions', el).appendChild(btn);
    }
    $('.modal-x', el).addEventListener('click', closeModal);
    el.addEventListener('mousedown', (e) => { if (e.target === el) closeModal(); });
    el._onClose = onClose;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    const first = $('input, textarea', el);
    if (first) setTimeout(() => first.focus(), 50);
    return el;
  }
  function closeModal() {
    $$('#overlay-root .modal-backdrop').forEach((m) => { m._onClose && m._onClose(); m.remove(); });
  }

  function editTrackModal(track) {
    const body = html(`<div class="form">
      <label>Title<input class="input" name="title" value="${esc(track.title)}" /></label>
      <label>Artist<input class="input" name="artist" value="${esc(track.artist)}" /></label>
      <label>Album<input class="input" name="album" value="${esc(track.album || '')}" /></label>
    </div>`);
    modal({
      title: 'Edit details', body, actions: [{ label: 'Save', primary: true, action: () => {
        State.updateTrack(track.id, { title: $('[name=title]', body).value.trim() || track.title, artist: $('[name=artist]', body).value.trim() || 'Unknown artist', album: $('[name=album]', body).value.trim() });
        State.emit('library');
        if (Player.P.current === track.id) App.refreshNowPlaying();
      } }],
    });
  }

  // ---------- cards ----------
  function card({ title, sub, cover, round, onOpen, onPlay, playing, key }) {
    const el = html(`<div class="card" ${key ? `data-key="${esc(key)}"` : ''}>
      <div class="card-img">${coverHtml(cover, 'card-cover', round)}
        <button class="fab play-fab ${playing ? 'is-playing' : ''}" title="Play" data-icon="${playing ? 'pause' : 'play'}" data-icon-size="20"></button>
      </div>
      <div class="card-title" title="${esc(title)}">${esc(title)}</div>
      <div class="card-sub">${sub || ''}</div>
    </div>`);
    el.addEventListener('click', () => onOpen && onOpen());
    $('.play-fab', el).addEventListener('click', (e) => { e.stopPropagation(); onPlay && onPlay(); });
    return el;
  }

  function shelf(title, cards, opts = {}) {
    if (!cards.length) return document.createDocumentFragment();
    const el = html(`<section class="shelf">
      <div class="shelf-head"><h2 class="shelf-title ${opts.onMore ? 'link' : ''}">${esc(title)}</h2>${opts.onMore ? '<button class="shelf-more">Show all</button>' : ''}</div>
      ${opts.subtitle ? `<div class="shelf-subtitle">${esc(opts.subtitle)}</div>` : ''}
      <div class="shelf-row ${opts.wrap ? 'wrap' : ''}"></div>
    </section>`);
    const row = $('.shelf-row', el);
    cards.forEach((c) => row.appendChild(c));
    if (opts.onMore) { $('.shelf-more', el).addEventListener('click', opts.onMore); $('.shelf-title', el).addEventListener('click', opts.onMore); }
    return el;
  }

  // ---------- track list (table) ----------
  function trackTable(items, { contextKey, contextName, playlistId, showAlbum = true, showAdded = true, startIndex = 1, compact = false } = {}) {
    const ids = items.map((i) => i.track.id);
    const wrap = html(`<div class="tracklist ${compact ? 'compact' : ''} ${showAlbum ? '' : 'no-album'} ${showAdded ? '' : 'no-added'}">
      ${compact ? '' : `<div class="tl-head">
        <div class="tl-num">#</div><div>Title</div>${showAlbum ? '<div class="tl-album">Album</div>' : ''}${showAdded ? '<div class="tl-added">Date added</div>' : ''}
        <div class="tl-dur" data-icon="clock" data-icon-size="16"></div>
      </div>`}
      <div class="tl-body"></div>
    </div>`);
    const body = $('.tl-body', wrap);
    items.forEach((it, i) => {
      const t = it.track;
      const row = html(`<div class="tl-row" data-id="${t.id}" tabindex="0">
        <div class="tl-num"><span class="n">${i + startIndex}</span><span class="eq"><i></i><i></i><i></i><i></i></span><button class="tl-play" data-icon="play" data-icon-size="14"></button></div>
        <div class="tl-title">${coverHtml(coverSrc(t), 'tl-cover')}<div class="tl-text"><div class="tl-name">${esc(t.title)}${t.kind === 'video' ? '<span class="badge">VIDEO</span>' : ''}</div><div class="tl-artist">${t.source && t.source !== 'local' ? `<span class="src-badge" title="${esc(t.source)}">${esc(t.source[0])}</span>` : ''}<a class="artist-link">${esc(t.artist)}</a></div></div></div>
        ${showAlbum ? `<div class="tl-album">${esc(t.album || '')}</div>` : ''}
        ${showAdded ? `<div class="tl-added">${esc(fmtDate(it.addedAt))}</div>` : ''}
        <div class="tl-dur"><button class="tl-like ${State.isLiked(t.id) ? 'on' : ''}" title="Save to Favorites">${State.isLiked(t.id) ? icon('heartFilled', 16) : icon('heart', 16)}</button><span>${t.duration ? fmtTime(t.duration) : '–:––'}</span><button class="tl-more" data-icon="dotsH" data-icon-size="16" title="More options"></button></div>
      </div>`);
      const play = () => {
        if (Player.P.current === t.id && Player.isCurrentContext(contextKey)) return Player.toggle();
        Player.playContext({ key: contextKey, name: contextName }, ids, i);
      };
      row.addEventListener('dblclick', play);
      $('.tl-play', row).addEventListener('click', (e) => { e.stopPropagation(); play(); });
      // touch screens (iPhone, tablets): one tap plays, like in the big streaming apps; mouse: click selects, double-click plays
      row.addEventListener('click', (e) => {
        $$('.tl-row.selected', body).forEach((r) => r.classList.remove('selected')); row.classList.add('selected');
        if (TOUCH() && !e.target.closest('button, a')) play();
      });
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); trackMenu(t, e.clientX, e.clientY, { playlistId }); });
      $('.tl-more', row).addEventListener('click', (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); trackMenu(t, r.right, r.bottom, { playlistId }); });
      $('.tl-like', row).addEventListener('click', (e) => { e.stopPropagation(); const v = State.toggleLike(t.id); toast(v ? 'Added to Favorites' : 'Removed from Favorites'); });
      $('.artist-link', row).addEventListener('click', (e) => { e.stopPropagation(); if (t.artist && t.artist !== 'Unknown artist') App.go('collection', 'artist:' + t.artist); });
      body.appendChild(row);
    });
    markPlaying(wrap);
    return wrap;
  }

  const TOUCH = () => document.body.classList.contains('mobile') || (window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);

  function markPlaying(root = document) {
    const cur = Player.P.current;
    const playing = Player.playing;
    $$('.tl-row', root).forEach((r) => {
      const is = r.dataset.id === cur;
      r.classList.toggle('current', is);
      r.classList.toggle('is-playing', is && playing);
      const b = $('.tl-play', r);
      if (b) setIcon(b, is && playing ? 'pause' : 'play');
    });
  }

  function fab(onClick, playing = false, size = 56) {
    const b = html(`<button class="fab big-fab ${playing ? 'is-playing' : ''}" style="width:${size}px;height:${size}px" title="${playing ? 'Pause' : 'Play'}" data-icon="${playing ? 'pause' : 'play'}" data-icon-size="${Math.round(size * 0.43)}"></button>`);
    b.addEventListener('click', onClick);
    return b;
  }

  function emptyState({ iconName = 'music', title, text, actionLabel, action, secondLabel, secondAction }) {
    const el = html(`<div class="empty-state">
      <div class="empty-icon" data-icon="${iconName}" data-icon-size="56"></div>
      <h2>${esc(title)}</h2><p>${esc(text || '')}</p>
      <div class="empty-actions">${actionLabel ? `<button class="btn-white a1">${esc(actionLabel)}</button>` : ''}${secondLabel ? `<button class="btn-outline a2">${esc(secondLabel)}</button>` : ''}</div>
    </div>`);
    if (action) $('.a1', el).addEventListener('click', action);
    if (secondAction) $('.a2', el).addEventListener('click', secondAction);
    return el;
  }

  return { toast, coverSrc, coverHtml, firstCover, avatarHtml, menu, closeMenu: closeAll, trackMenu, modal, closeModal, editTrackModal, card, shelf, trackTable, markPlaying, fab, emptyState };
})();
