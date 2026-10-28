// Aurora - application shell: routing, top bar, Library sidebar, right panel, player bar.
// Views registry is created in util.js

const App = (() => {
  const hist = [];
  let hIndex = -1;
  let current = null; // { view, param }
  let cleanup = null;
  let rpMode = 'nowplaying'; // nowplaying | queue

  // ================= ROUTER =================
  function go(view, param = null, { replace = false, noHistory = false } = {}) {
    if (!Views[view]) view = 'home';
    const same = current && current.view === view && current.param === param;
    if (!noHistory && !same) {
      if (replace && hIndex >= 0) hist[hIndex] = { view, param };
      else { hist.splice(hIndex + 1); hist.push({ view, param }); hIndex = hist.length - 1; }
    }
    current = { view, param };
    render(true);
  }

  function render(scrollTop = false) {
    if (!current) return;
    const scroller = $('#main-scroll');
    const keep = scrollTop ? 0 : scroller.scrollTop;
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    const view = $('#view');
    view.innerHTML = '';
    view.className = 'view view-' + current.view;
    $('#main-sticky').innerHTML = '';
    $('#main-sticky').classList.remove('show');
    setHeaderColor(null);
    const r = Views[current.view].render(view, current.param);
    cleanup = typeof r === 'function' ? r : null;
    hydrateIcons(view);
    scroller.scrollTop = keep;
    updateNav();
    if (current.view !== 'search' && document.activeElement !== $('#search-input')) $('#search-input').value = '';
    $('#btn-home').classList.toggle('active', current.view === 'home');
    $('#btn-browse').classList.toggle('active', current.view === 'search' && !current.param);
    markLibraryActive();
  }

  const rerender = debounce(() => {
    if (!current) return;
    const v = Views[current.view];
    if (v && v.live === false) return; // view handles its own updates
    render(false);
  }, 120);

  function back() { if (hIndex > 0) { hIndex--; current = hist[hIndex]; render(true); } }
  function forward() { if (hIndex < hist.length - 1) { hIndex++; current = hist[hIndex]; render(true); } }
  function updateNav() {
    $('#btn-back').disabled = hIndex <= 0;
    $('#btn-fwd').disabled = hIndex >= hist.length - 1;
  }

  function setHeaderColor(color) {
    const main = $('#main');
    main.style.setProperty('--hdr', color || 'transparent');
    main.classList.toggle('has-hdr', !!color);
  }

  // ================= ACCENT / THEME =================
  function applyTheme() {
    const pr = State.prefs();
    document.documentElement.style.setProperty('--accent', pr.accent || '#8b7bff');
    document.documentElement.style.setProperty('--accent-hover', lighten(pr.accent || '#8b7bff'));
    $('#user-css').textContent = (State.settings().customCss || '') + '\n' + (App._fileCss || '');
    $('#app').classList.toggle('no-right', !pr.showRightPanel);
    $('#app').style.setProperty('--sidebar-w', (pr.sidebarCollapsed ? 72 : pr.sidebarWidth || 420) + 'px');
    $('#app').style.setProperty('--rp-w', (pr.rpWidth || 420) + 'px');
    $('#app').classList.toggle('lib-collapsed', !!pr.sidebarCollapsed);
  }
  function lighten(hex) {
    const m = hex.replace('#', '').match(/.{2}/g);
    if (!m) return hex;
    return '#' + m.map((x) => Math.min(255, parseInt(x, 16) + 18).toString(16).padStart(2, '0')).join('');
  }

  // ================= TOP BAR =================
  function initTopbar() {
    $('#btn-back').onclick = back;
    $('#btn-fwd').onclick = forward;
    $('#btn-home').onclick = () => go('home');
    $('#btn-brand').onclick = () => go('home');
    $('#btn-browse').onclick = () => go('search', '');
    const input = $('#search-input');
    input.addEventListener('focus', () => { if (!current || current.view !== 'search') go('search', input.value || ''); });
    input.addEventListener('input', debounce(() => go('search', input.value, { replace: current && current.view === 'search' }), 180));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && isUrl(input.value)) { const u = input.value.trim(); input.value = ''; go('downloader', u); }
      if (e.key === 'Escape') input.blur();
    });
    $('#search-pill').addEventListener('click', (e) => { if (e.target.closest('.browse-btn')) return; input.focus(); });
    $('#btn-hub').onclick = (e) => { e.stopPropagation(); hubMenu(e.currentTarget); };
    $('#btn-menu').onclick = (e) => mainMenu(e.currentTarget);
    $('#topbar').addEventListener('dblclick', (e) => { if (e.target === $('#topbar')) native.app.fullscreen(); });
  }

  function renderAvatar() {
    const p = State.activeProfile();
    $('#top-avatar').innerHTML = UI.avatarHtml(p, 30);
    $('#hub-name').textContent = p ? p.name : '';
    $('#btn-hub').title = p ? `${p.name} · Menu` : 'Menu';
    $('#top-avatar').dataset.effect = (p && p.effect) || '';
  }

  function avatarMenu(btn) {
    const r = btn.getBoundingClientRect();
    const me = State.activeProfile();
    const others = State.profiles().filter((p) => p.id !== me.id);
    UI.menu([
      { label: 'Profile', icon: 'user', action: () => go('profile', me.id) },
      { label: 'Switch profile', icon: 'users', sub: [
        ...State.profiles().map((p) => ({ label: p.name, iconHtml: UI.avatarHtml(p, 20), checked: p.id === me.id, action: () => switchProfile(p.id) })),
        { divider: true },
        { label: 'Add profile', icon: 'plus', action: () => Views.profile.createModal() },
        { label: 'Manage profiles', icon: 'edit', action: () => showProfilePicker({ manage: true }) },
      ] },
      { label: 'Video Downloader', icon: 'download', action: () => go('downloader') },
      { label: 'Friends', icon: 'users', action: () => go('friends') },
      { label: 'Discover', icon: 'search', action: () => go('discover') },
      { label: 'Aurora Store', icon: 'bag', action: () => go('store') },
      { label: 'Discord Connection', icon: 'discord', action: () => go('discord') },
      { label: 'Settings', icon: 'settings', action: () => go('settings') },
      { divider: true },
      { label: 'Log out', icon: 'logout', action: () => showProfilePicker() },
    ], r.right, r.bottom + 8, { alignRight: true, minWidth: 196 });
  }

  // ---- the one menu at the top right: profile, every feature, updates ----
  function hubAlerts() {
    const u = Updates.state;
    const friends = Friends.listeningCount();
    const dl = typeof DL !== 'undefined' ? [...DL.jobs.values()].filter((j) => ['queued', 'downloading', 'preparing'].includes(j.status)).length : 0;
    return { update: u.phase === 'available' || u.phase === 'ready' || u.phase === 'downloading', updateReady: u.phase === 'ready', friends, dl };
  }
  function updateHubDot() {
    const a = hubAlerts();
    const n = (a.update ? 1 : 0) + (a.friends ? 1 : 0) + (a.dl ? 1 : 0);
    const dot = $('#hub-dot');
    if (dot) { dot.hidden = !n; dot.classList.toggle('upd', a.update); }
  }

  function hubMenu(btn) {
    const existing = $('.hub-panel');
    if (existing) { existing.remove(); return; }
    UI.closeMenu();
    const me = State.activeProfile();
    const a = hubAlerts();
    const u = Updates.state;
    const tiles = [
      ['discover', 'search', 'Discover', 'Search & download'],
      ['friends', 'users', 'Friends', a.friends ? `${a.friends} listening now` : 'See what friends play'],
      ['together', 'headphones', 'Listen Together', ListenTogether.inSession ? 'In a session' : 'Same song, same time'],
      ['store', 'bag', 'Store', 'Themes & effects'],
      ['downloader', 'download', 'Downloader', a.dl ? `${a.dl} downloading` : 'Paste any link'],
      ['discord', 'discord', 'Discord', DiscordConn.opts().enabled ? 'Connected' : 'Show your music'],
    ];
    const updLabel = { available: `Update to ${u.info && u.info.latest}`, downloading: `Downloading update ${Math.round(u.ratio * 100)}%`, ready: 'Restart to update', installing: 'Updating…', checking: 'Checking…', uptodate: "You're up to date" }[u.phase] || 'Check for updates';
    const panel = html(`<div class="hub-panel">
      <button class="hub-profile">
        <span class="hub-av" data-effect="${esc(me.effect || '')}">${UI.avatarHtml(me, 52)}</span>
        <span class="hub-pt"><b>${esc(me.name)}</b><small>${me.statusText ? `${esc(me.statusEmoji || '')} ${esc(me.statusText)}` : 'View profile'}</small></span>
        <span data-icon="chevronRight" data-icon-size="16"></span>
      </button>
      <div class="hub-tiles">${tiles.map(([v, ic, t, s]) => `<button class="hub-tile" data-v="${v}"><span class="ht-ic">${icon(ic, 22)}</span><b>${t}</b><small>${esc(s)}</small>${(v === 'friends' && a.friends) || (v === 'downloader' && a.dl) || (v === 'together' && ListenTogether.inSession) ? '<i class="ht-dot"></i>' : ''}</button>`).join('')}</div>
      <div class="hub-list">
        <button class="hub-item hub-upd ${a.update ? 'hot' : ''}">${icon('refresh', 16)}<span>${esc(updLabel)}</span>${a.update ? '<i class="ht-dot"></i>' : ''}</button>
        <button class="hub-item" data-act="new">${icon('bell', 16)}<span>What's new</span></button>
        <button class="hub-item" data-act="settings">${icon('settings', 16)}<span>Settings</span></button>
      </div>
      <div class="hub-switch">
        <span class="muted">Switch profile</span>
        <div class="hub-profiles">${State.profiles().map((p) => `<button class="hub-pf ${p.id === me.id ? 'on' : ''}" data-id="${p.id}" title="${esc(p.name)}">${UI.avatarHtml(p, 30)}</button>`).join('')}<button class="hub-pf add" title="Add profile">${icon('plus', 16)}</button></div>
      </div>
      <div class="hub-foot"><button class="hub-item" data-act="logout">${icon('logout', 16)}<span>Log out</span></button><span class="muted">Aurora ${esc(State.S.info.version)}</span></div>
    </div>`);
    const close = () => { panel.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc1); };
    const outside = (e) => { if (!panel.contains(e.target) && !btn.contains(e.target)) close(); };
    const esc1 = (e) => { if (e.key === 'Escape') close(); };
    $('.hub-profile', panel).onclick = () => { close(); go('profile', me.id); };
    $$('.hub-tile', panel).forEach((t) => t.onclick = () => { close(); go(t.dataset.v); });
    $('.hub-upd', panel).onclick = () => { close(); if (u.phase === 'ready') Updates.install(); else Updates.open(); };
    $$('.hub-item[data-act]', panel).forEach((b) => b.onclick = () => { close(); ({ new: whatsNew, settings: () => go('settings'), logout: () => showProfilePicker() })[b.dataset.act](); });
    $$('.hub-pf[data-id]', panel).forEach((b) => b.onclick = () => { close(); if (b.dataset.id !== me.id) switchProfile(b.dataset.id); });
    $('.hub-pf.add', panel).onclick = () => { close(); Views.profile.createModal(); };
    document.body.appendChild(panel);
    hydrateIcons(panel);
    const r = btn.getBoundingClientRect();
    panel.style.top = r.bottom + 8 + 'px';
    panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc1); });
  }

  function mainMenu(btn) {
    const r = btn.getBoundingClientRect();
    UI.menu([
      { label: 'File', sub: [
        { label: 'New Playlist', hint: 'Ctrl+N', action: () => newPlaylist() },
        { label: 'Import files…', action: importFiles },
        { label: 'Import folder…', action: importFolder },
        { divider: true },
        { label: 'Download from link…', action: () => go('downloader') },
        { divider: true },
        { label: 'Log out', action: () => showProfilePicker() },
        { label: 'Exit', action: () => native.app.quit() },
      ] },
      { label: 'Edit', sub: [
        { label: 'Undo', hint: 'Ctrl+Z', action: () => document.execCommand('undo') },
        { label: 'Redo', hint: 'Ctrl+Y', action: () => document.execCommand('redo') },
        { divider: true },
        { label: 'Cut', hint: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: 'Copy', hint: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: 'Paste', hint: 'Ctrl+V', action: () => document.execCommand('paste') },
        { divider: true },
        { label: 'Settings', action: () => go('settings') },
      ] },
      { label: 'View', sub: [
        { label: 'Library', checked: !State.prefs().sidebarCollapsed, action: toggleSidebar },
        { label: 'Now Playing view', checked: State.prefs().showRightPanel, action: () => toggleRightPanel('nowplaying') },
        { label: 'Queue', action: () => toggleRightPanel('queue') },
        { divider: true },
        { label: 'Full screen', hint: 'F11', action: () => native.app.fullscreen() },
        { label: 'Reload', hint: 'Ctrl+Shift+R', action: () => native.app.reload() },
      ] },
      { label: 'Playback', sub: [
        { label: Player.playing ? 'Pause' : 'Play', hint: 'Space', action: Player.toggle },
        { label: 'Next', hint: 'Ctrl+→', action: () => Player.next() },
        { label: 'Previous', hint: 'Ctrl+←', action: Player.prev },
        { label: 'Shuffle', checked: Player.P.shuffle, hint: 'Ctrl+S', action: Player.toggleShuffle },
        { label: 'Repeat', checked: Player.P.repeat !== 'off', hint: 'Ctrl+R', action: Player.cycleRepeat },
      ] },
      { label: 'Help', sub: [
        { label: 'About Aurora', action: about },
        { label: 'Check for updates…', action: () => Updates.onClick() },
        { label: "What's new", action: whatsNew },
        { label: 'Keyboard shortcuts', action: shortcuts },
        { divider: true },
        { label: 'GitHub repository', action: () => native.shell.openExternal(App.REPO) },
        { label: 'Open custom theme folder', action: () => native.shell.openPath(State.S.info.customDir) },
        { label: 'Developer tools', hint: 'Ctrl+Shift+I', action: () => native.app.devtools() },
      ] },
    ], r.left, r.bottom + 6, { minWidth: 180 });
  }

  // ================= YOUR LIBRARY =================
  const LIB_FILTERS = [
    { key: 'playlist', label: 'Playlists' },
    { key: 'artist', label: 'Artists' },
    { key: 'download', label: 'Downloaded' },
    { key: 'video', label: 'Videos' },
  ];
  let libQuery = '';

  function initSidebar() {
    $('#lib-title').onclick = toggleSidebar;
    $('#btn-create').onclick = (e) => createMenu(e.currentTarget);
    $('#btn-lib-expand').onclick = () => go('library');
    $('#btn-lib-search').onclick = () => { $('#lib-search').classList.add('open'); $('#lib-search-input').focus(); };
    $('#lib-search-input').addEventListener('input', (e) => { libQuery = e.target.value.toLowerCase(); renderLibrary(); });
    $('#lib-search-input').addEventListener('blur', (e) => { if (!e.target.value) $('#lib-search').classList.remove('open'); });
    $('#btn-lib-sort').onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const cur = State.prefs().libSort;
      const set = (k) => { State.setPref('libSort', k); renderLibrary(); };
      UI.menu([
        { header: 'Sort by' },
        { label: 'Recents', checked: cur === 'recents', action: () => set('recents') },
        { label: 'Recently Added', checked: cur === 'added', action: () => set('added') },
        { label: 'Alphabetical', checked: cur === 'alpha', action: () => set('alpha') },
        { label: 'Creator', checked: cur === 'creator', action: () => set('creator') },
        { divider: true },
        { header: 'View as' },
        { label: 'Compact', checked: State.prefs().libView === 'compact', action: () => { State.setPref('libView', 'compact'); renderLibrary(); } },
        { label: 'List', checked: State.prefs().libView !== 'compact', action: () => { State.setPref('libView', 'list'); renderLibrary(); } },
      ], r.right, r.bottom + 6, { alignRight: true, minWidth: 190 });
    };
    // resizer
    dragResize($('#sidebar-resizer'), (dx, start) => {
      const w = Math.max(280, Math.min(640, start + dx));
      $('#app').style.setProperty('--sidebar-w', w + 'px');
      return w;
    }, () => State.prefs().sidebarCollapsed ? 72 : State.prefs().sidebarWidth || 420, (w) => { State.setPref('sidebarWidth', w); if (State.prefs().sidebarCollapsed) { State.setPref('sidebarCollapsed', false); applyTheme(); } });
    // drop files on the library
    $('#lib-list').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.lib-item')) return;
      e.preventDefault();
      createMenuAt(e.clientX, e.clientY);
    });
  }

  function dragResize(handle, onMove, getStart, onEnd, invert = false) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const x0 = e.clientX, start = getStart();
      let last = start;
      document.body.classList.add('resizing');
      const move = (ev) => { last = onMove(invert ? x0 - ev.clientX : ev.clientX - x0, start); };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        document.body.classList.remove('resizing');
        onEnd(last);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  function toggleSidebar() {
    State.setPref('sidebarCollapsed', !State.prefs().sidebarCollapsed);
    applyTheme();
    renderLibrary();
  }

  function createMenu(btn) {
    const r = btn.getBoundingClientRect();
    createMenuAt(r.left, r.bottom + 6);
  }
  function createMenuAt(x, y) {
    UI.menu([
      { label: 'Playlist', icon: 'playlistAdd', hint: 'Create a playlist with songs or videos', action: () => newPlaylist() },
      { label: 'Import local files', icon: 'import', action: importFiles },
      { label: 'Import a folder', icon: 'folder', action: importFolder },
      { label: 'Download from a link', icon: 'download', action: () => go('downloader') },
    ], x, y, { minWidth: 260 });
  }

  function newPlaylist(trackIds = []) {
    if (!Array.isArray(trackIds) || !trackIds.length) return Views.collection.createModal();
    const pl = State.createPlaylist({ trackIds });
    go('collection', 'pl:' + pl.id);
    return pl;
  }

  function renderLibrary() {
    const pr = State.prefs();
    // chips
    const chips = $('#lib-chips');
    chips.innerHTML = '';
    if (pr.libFilter) {
      const x = html(`<button class="chip chip-x" title="Clear filters" data-icon="close" data-icon-size="14"></button>`);
      x.onclick = () => { State.setPref('libFilter', null); renderLibrary(); };
      chips.appendChild(x);
    }
    const entriesAll = State.libraryEntries();
    for (const f of LIB_FILTERS) {
      if (pr.libFilter && pr.libFilter !== f.key) continue;
      if (!pr.libFilter && !entriesAll.some((e) => e.kind === f.key || (f.key === 'playlist' && e.kind !== 'artist'))) continue;
      const c = html(`<button class="chip ${pr.libFilter === f.key ? 'active' : ''}">${f.label}</button>`);
      c.onclick = () => { State.setPref('libFilter', pr.libFilter === f.key ? null : f.key); renderLibrary(); };
      chips.appendChild(c);
    }
    // entries
    let entries = entriesAll;
    if (pr.libFilter === 'playlist') entries = entries.filter((e) => e.kind !== 'artist');
    else if (pr.libFilter) entries = entries.filter((e) => e.kind === pr.libFilter);
    if (libQuery) entries = entries.filter((e) => e.name.toLowerCase().includes(libQuery));
    const sorters = {
      recents: (a, b) => b.at - a.at,
      added: (a, b) => b.at - a.at,
      alpha: (a, b) => a.name.localeCompare(b.name),
      creator: (a, b) => a.sub.localeCompare(b.sub) || a.name.localeCompare(b.name),
    };
    entries.sort(sorters[pr.libSort] || sorters.recents);
    entries.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    $('#lib-sort-label').textContent = { recents: 'Recents', added: 'Recently Added', alpha: 'Alphabetical', creator: 'Creator' }[pr.libSort] || 'Recents';

    const list = $('#lib-list');
    list.classList.toggle('compact', pr.libView === 'compact');
    list.innerHTML = '';
    if (!entries.length) {
      list.appendChild(html(`<div class="lib-empty"><b>Create your first playlist</b><span>It's easy, we'll help you.</span><button class="btn-white sm">Create playlist</button></div>`));
      $('.lib-empty button', list).onclick = () => newPlaylist();
      list.appendChild(html(`<div class="lib-empty"><b>Download something to listen to</b><span>Paste a YouTube, SoundCloud or Spotify link.</span><button class="btn-white sm">Open Video Downloader</button></div>`));
      $$('.lib-empty button', list)[1].onclick = () => go('downloader');
      return;
    }
    for (const e of entries) {
      const playingHere = Player.isCurrentContext(e.key);
      const el = html(`<div class="lib-item ${playingHere ? 'playing' : ''}" data-key="${esc(e.key)}" title="${esc(e.name)}">
        <div class="lib-cover-wrap">${UI.coverHtml(e.cover, 'lib-cover', e.round)}<button class="lib-play" data-icon="${playingHere && Player.playing ? 'pause' : 'play'}" data-icon-size="16"></button></div>
        <div class="lib-text">
          <div class="lib-name">${esc(e.name)}</div>
          <div class="lib-sub">${e.pinned ? `<span class="pin" data-icon="pin" data-icon-size="12"></span>` : ''}${esc(e.sub)}</div>
        </div>
        ${playingHere && Player.playing ? `<span class="lib-speaker" data-icon="volHigh" data-icon-size="16"></span>` : ''}
      </div>`);
      el.onclick = () => go('collection', e.key);
      $('.lib-play', el).onclick = (ev) => { ev.stopPropagation(); playCollection(e.key); };
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); collectionMenu(e.key, ev.clientX, ev.clientY); });
      list.appendChild(el);
    }
    markLibraryActive();
  }

  function markLibraryActive() {
    $$('#lib-list .lib-item').forEach((el) => el.classList.toggle('active', !!current && current.view === 'collection' && current.param === el.dataset.key));
  }

  function playCollection(key, shuffle = false) {
    if (Player.isCurrentContext(key) && Player.P.current) return Player.toggle();
    const c = State.collection(key);
    if (!c || !c.items.length) return UI.toast('Nothing to play here yet.');
    if (shuffle && !Player.P.shuffle) Player.toggleShuffle();
    Player.playContext({ key, name: c.name }, c.items.map((i) => i.track.id), Player.P.shuffle ? -1 : 0);
  }

  function collectionMenu(key, x, y) {
    const c = State.collection(key);
    if (!c) return;
    const pinned = State.isPinned(key);
    const items = [
      { label: 'Play', icon: 'play', action: () => playCollection(key) },
      { label: 'Add to queue', icon: 'queue', action: () => { Player.addToQueue(c.items.map((i) => i.track.id)); UI.toast('Added to queue'); } },
      { divider: true },
      { label: pinned ? 'Unpin playlist' : 'Pin playlist', icon: 'pin', action: () => State.togglePin(key) },
    ];
    if (c.playlist) {
      items.push(
        { label: 'Edit details', icon: 'edit', action: () => Views.collection.editModal(c.playlist) },
        { label: 'Delete', icon: 'trash', danger: true, action: async () => {
          if (!(await native.dialog.confirm({ message: `Delete "${c.name}" from Library?`, ok: 'Delete' }))) return;
          State.deletePlaylist(c.playlist.id);
          if (current && current.param === key) go('home', null, { replace: true });
          UI.toast('Removed from Library');
        } },
      );
    }
    items.push({ divider: true }, { label: 'Create playlist', icon: 'playlistAdd', action: () => newPlaylist() });
    UI.menu(items, x, y);
  }

  // ================= IMPORT =================
  async function importFiles() {
    const files = await native.dialog.files();
    if (!files.length) return;
    const tracks = await native.library.readFiles(files);
    const n = State.addTracks(tracks);
    UI.toast(`Added ${n} item${n === 1 ? '' : 's'} to your library`);
    fillDurations(tracks);
  }
  async function importFolder(dir) {
    if (typeof dir !== 'string') dir = await native.dialog.folder('Import a music folder');
    if (!dir) return;
    UI.toast('Scanning folder…');
    const tracks = await native.library.scan(dir);
    const n = State.addTracks(tracks);
    const s = State.settings();
    if (!s.musicFolders.includes(dir)) State.setSetting('musicFolders', [...s.musicFolders, dir]);
    UI.toast(`Found ${tracks.length} file${tracks.length === 1 ? '' : 's'} (${n} new)`);
    fillDurations(tracks);
  }
  async function rescanFolders() {
    for (const dir of State.settings().musicFolders) {
      try { const tracks = await native.library.scan(dir); State.addTracks(tracks.filter((t) => !State.anyTrack(t.id))); fillDurations(tracks); } catch {}
    }
  }
  // read durations for files that don't have one yet (metadata only, very fast)
  async function fillDurations(tracks) {
    const probe = document.createElement('audio');
    probe.preload = 'metadata';
    for (const t of tracks) {
      const cur = State.track(t.id);
      if (!cur || cur.duration) continue;
      await new Promise((res) => {
        const done = () => { probe.onloadedmetadata = probe.onerror = null; res(); };
        probe.onloadedmetadata = () => { if (isFinite(probe.duration)) State.updateTrack(t.id, { duration: probe.duration }); done(); };
        probe.onerror = done;
        probe.src = native.fileUrl(t.path);
        setTimeout(done, 4000);
      });
    }
    probe.removeAttribute('src');
    rerender();
  }

  function initDragDrop() {
    let depth = 0;
    const hint = html('<div class="drop-hint"><div><span data-icon="import" data-icon-size="40"></span><b>Drop to add to Library</b></div></div>');
    document.body.appendChild(hint);
    window.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { depth++; hint.classList.add('show'); } });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hint.classList.remove('show'); });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0; hint.classList.remove('show');
      const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (!e.dataTransfer.files.length && text && isUrl(text)) return go('downloader', text.trim());
      const paths = [...e.dataTransfer.files].map((f) => native.pathForFile(f)).filter(Boolean);
      if (!paths.length) return;
      const tracks = await native.library.readFiles(paths);
      // folders: scan them
      const files = new Set(tracks.map((t) => t.path));
      for (const p of paths) if (!files.has(p) && !/\.[a-z0-9]{2,4}$/i.test(p)) await importFolder(p);
      if (tracks.length) { const n = State.addTracks(tracks); UI.toast(`Added ${n} item${n === 1 ? '' : 's'} to your library`); fillDurations(tracks); }
    });
  }

  // ================= RIGHT PANEL =================
  function toggleRightPanel(mode) {
    const pr = State.prefs();
    if (pr.showRightPanel && rpMode === mode) State.setPref('showRightPanel', false);
    else { State.setPref('showRightPanel', true); rpMode = mode; }
    applyTheme();
    renderRightPanel();
  }

  function placeMedia() {
    const t = Player.current;
    const media = Player.media;
    const fs = $('#fullscreen-view');
    let target = $('#media-host');
    if (!fs.classList.contains('hidden') && t && t.kind === 'video') target = $('.fs-video-slot', fs) || target;
    else if (State.prefs().showRightPanel && rpMode === 'nowplaying' && t && t.kind === 'video') target = $('#rp-video-slot') || target;
    if (media.parentNode !== target) target.appendChild(media);
  }

  function renderRightPanel() {
    const rp = $('#rp-content');
    const pr = State.prefs();
    $('#btn-nowplaying').classList.toggle('on', pr.showRightPanel && rpMode === 'nowplaying');
    $('#btn-queue').classList.toggle('on', pr.showRightPanel && rpMode === 'queue');
    if (!pr.showRightPanel) { rp.innerHTML = ''; placeMedia(); return; }
    const t = Player.current;
    if (rpMode === 'queue') {
      rp.innerHTML = '';
      const head = html(`<div class="rp-head"><h3>Queue</h3><button class="icon-btn small" data-icon="close" title="Close"></button></div>`);
      $('button', head).onclick = () => toggleRightPanel('queue');
      rp.appendChild(head);
      if (t) {
        rp.appendChild(html(`<div class="rp-label">Now playing</div>`));
        rp.appendChild(queueRow(t, -1, true));
      }
      const up = Player.upNext(60);
      if (up.length) {
        rp.appendChild(html(`<div class="rp-label">Next ${Player.P.context ? 'from: ' + esc(Player.P.context.name || '') : 'up'}</div>`));
        up.forEach((u, i) => rp.appendChild(queueRow(State.track(u.id), i)));
      } else if (!t) {
        rp.appendChild(html(`<div class="rp-empty"><b>Add to your queue</b><span>Tap "Add to queue" from a track's menu to see it here</span></div>`));
      }
      placeMedia();
      return;
    }
    // ----- Now playing -----
    if (!t) {
      rp.innerHTML = `<div class="rp-head"><h3>Now playing</h3></div><div class="rp-empty"><span data-icon="music" data-icon-size="48"></span><b>Nothing playing yet</b><span>Pick something from Library or download a track to start listening.</span></div>`;
      hydrateIcons(rp);
      placeMedia();
      return;
    }
    const liked = State.isLiked(t.id);
    const ctxName = Player.P.context ? Player.P.context.name : t.album || 'Now playing';
    const nxt = Player.upNext(1)[0];
    const nt = nxt && State.track(nxt.id);
    rp.innerHTML = '';
    const el = html(`<div class="np">
      <div class="rp-head"><h3 class="np-ctx" title="${esc(ctxName)}">${esc(ctxName)}</h3>
        <div class="rp-head-actions"><button class="icon-btn small np-more" data-icon="dotsH" title="More options"></button><button class="icon-btn small np-close" data-icon="close" title="Close"></button></div></div>
      <div class="np-media ${t.kind === 'video' ? 'is-video' : ''}">
        ${t.kind === 'video' ? '<div id="rp-video-slot" class="rp-video-slot"></div>' : `<img src="${esc(UI.coverSrc(t))}" draggable="false" />`}
      </div>
      <div class="np-info">
        <div class="np-text"><div class="np-title" title="${esc(t.title)}">${esc(t.title)}</div><a class="np-artist">${esc(t.artist)}</a></div>
        <div class="np-actions"><button class="icon-btn small np-like ${liked ? 'on' : ''}" title="${liked ? 'Remove from Favorites' : 'Save to Favorites'}">${liked ? icon('heartFilled', 24) : icon('heart', 24)}</button></div>
      </div>
      <div class="np-card about">
        <div class="np-card-img" style="background-image:url('${esc(UI.coverSrc(t))}')"><span>About this ${t.kind === 'video' ? 'video' : 'track'}</span></div>
        <div class="np-card-body">
          <div class="np-card-title">${esc(t.artist)}</div>
          <div class="np-meta">${t.source && t.source !== 'local' ? `Downloaded from <b>${esc(t.source)}</b>` : 'Local file'} · ${t.duration ? fmtTime(t.duration) : ''} · played ${State.S.p.plays[t.id] || 0}×</div>
          <div class="np-path" title="${esc(t.path)}"><bdi>${esc(t.path)}</bdi></div>
          <div class="np-card-actions">
            <button class="btn-outline sm np-folder">Show in folder</button>
            ${t.url ? '<button class="btn-outline sm np-src">Open source</button>' : ''}
          </div>
        </div>
      </div>
      ${nt ? `<div class="np-card next">
        <div class="np-next-head"><b>Next in queue</b><button class="link-btn np-openq">Open queue</button></div>
        <div class="np-next-row">${UI.coverHtml(UI.coverSrc(nt), 'np-next-cover')}<div><div class="np-next-title">${esc(nt.title)}</div><div class="np-next-artist">${esc(nt.artist)}</div></div></div>
      </div>` : ''}
    </div>`);
    rp.appendChild(el);
    $('.np-close', el).onclick = () => toggleRightPanel('nowplaying');
    $('.np-more', el).onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); UI.trackMenu(t, r.left, r.bottom); };
    $('.np-like', el).onclick = () => State.toggleLike(t.id);
    $('.np-artist', el).onclick = () => t.artist !== 'Unknown artist' && go('collection', 'artist:' + t.artist);
    $('.np-ctx', el).onclick = () => Player.P.context && go('collection', Player.P.context.key);
    $('.np-folder', el).onclick = () => native.shell.showItem(t.path);
    if ($('.np-src', el)) $('.np-src', el).onclick = () => native.shell.openExternal(t.url);
    if ($('.np-openq', el)) $('.np-openq', el).onclick = () => toggleRightPanel('queue');
    if ($('.np-next-row', el)) $('.np-next-row', el).ondblclick = () => Player.jumpToUpNext(0);
    placeMedia();
  }

  function queueRow(t, i, isCurrent = false) {
    const el = html(`<div class="q-row ${isCurrent ? 'current' : ''}">${UI.coverHtml(UI.coverSrc(t), 'q-cover')}<div class="q-text"><div class="q-title">${esc(t.title)}</div><div class="q-artist">${esc(t.artist)}</div></div></div>`);
    if (!isCurrent) el.ondblclick = () => Player.jumpToUpNext(i);
    el.oncontextmenu = (e) => { e.preventDefault(); UI.trackMenu(t, e.clientX, e.clientY); };
    return el;
  }

  function initRightPanel() {
    dragResize($('#rp-resizer'), (dx, start) => {
      const w = Math.max(280, Math.min(560, start + dx));
      $('#app').style.setProperty('--rp-w', w + 'px');
      return w;
    }, () => State.prefs().rpWidth || 420, (w) => State.setPref('rpWidth', w), true);
  }

  // ================= PLAYER BAR =================
  function slider(el, { onInput, onCommit }) {
    let dragging = false;
    const ratioAt = (x) => { const r = $('.slider-track', el).getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); };
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
      const v = ratioAt(e.clientX);
      setSlider(el, v);
      onInput && onInput(v);
    });
    el.addEventListener('pointermove', (e) => { if (!dragging) return; const v = ratioAt(e.clientX); setSlider(el, v); onInput && onInput(v); });
    el.addEventListener('pointerup', (e) => { if (!dragging) return; dragging = false; el.classList.remove('dragging'); onCommit && onCommit(ratioAt(e.clientX)); });
    return { get dragging() { return dragging; } };
  }
  function setSlider(el, v) { el.style.setProperty('--p', (Math.max(0, Math.min(1, v)) * 100).toFixed(3) + '%'); }

  let seekCtl;
  function initPlayerBar() {
    $('#btn-play').onclick = Player.toggle;
    $('#btn-next').onclick = () => Player.next();
    $('#btn-prev').onclick = Player.prev;
    $('#btn-shuffle').onclick = Player.toggleShuffle;
    $('#btn-repeat').onclick = Player.cycleRepeat;
    $('#btn-mute').onclick = Player.toggleMute;
    $('#btn-nowplaying').onclick = () => toggleRightPanel('nowplaying');
    $('#btn-queue').onclick = () => toggleRightPanel('queue');
    $('#btn-device').onclick = () => { const t = Player.current; if (t) native.shell.showItem(t.path); else UI.toast('Nothing playing'); };
    $('#btn-mini').onclick = async () => {
      const t = Player.current;
      if (!t || t.kind !== 'video') return UI.toast('The pop-out player is available for videos.');
      try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await Player.media.requestPictureInPicture(); } catch { UI.toast('Pop-out player unavailable'); }
    };
    $('#btn-fullscreen').onclick = toggleFullscreenView;
    seekCtl = slider($('#seek'), {
      onInput: (v) => { $('#time-cur').textContent = fmtTime(v * (Player.media.duration || 0)); },
      onCommit: (v) => Player.seekRatio(v),
    });
    slider($('#volume'), { onInput: (v) => Player.setVolume(v) });

    Player.on('track', () => { renderNowPlayingBar(); renderRightPanel(); UI.markPlaying(); renderLibraryPlaying(); updateFsView(); updateTitle(); });
    Player.on('state', () => {
      const playing = Player.playing;
      setIcon($('#btn-play'), playing ? 'pause' : 'play');
      $('#btn-play').title = playing ? 'Pause' : 'Play';
      UI.markPlaying();
      renderLibraryPlaying();
      $$('.big-fab[data-ctx]').forEach((b) => { const on = playing && Player.isCurrentContext(b.dataset.ctx); setIcon(b, on ? 'pause' : 'play'); b.classList.toggle('is-playing', on); });
      $$('.card[data-key]').forEach((c) => { const b = $('.play-fab', c); const on = playing && Player.isCurrentContext(c.dataset.key); if (b) { setIcon(b, on ? 'pause' : 'play'); b.classList.toggle('is-playing', on); } });
      $$('.shortcut[data-key]').forEach((c) => { const on = playing && Player.isCurrentContext(c.dataset.key); c.classList.toggle('playing', on); const b = $('.sc-play', c); if (b) setIcon(b, on ? 'pause' : 'play'); });
      updateFsView();
      updateTitle();
    });
    Player.on('time', () => {
      const m = Player.media;
      const d = m.duration || (Player.current && Player.current.duration) || 0;
      if (!seekCtl.dragging) {
        $('#time-cur').textContent = fmtTime(m.currentTime);
        setSlider($('#seek'), d ? m.currentTime / d : 0);
      }
      $('#time-total').textContent = fmtTime(d);
      const fsBar = $('#fs-seek');
      if (fsBar) { setSlider(fsBar, d ? m.currentTime / d : 0); $('#fs-cur').textContent = fmtTime(m.currentTime); $('#fs-total').textContent = fmtTime(d); }
    });
    Player.on('volume', () => {
      const v = Player.P.muted ? 0 : Player.P.volume;
      setSlider($('#volume'), v);
      setIcon($('#btn-mute'), v === 0 ? 'volMute' : v < 0.5 ? 'volLow' : 'volHigh');
      $('#btn-mute').title = v === 0 ? 'Unmute' : 'Mute';
    });
    Player.on('mode', () => {
      $('#btn-shuffle').classList.toggle('on', Player.P.shuffle);
      $('#btn-shuffle').title = Player.P.shuffle ? 'Disable shuffle' : 'Enable shuffle';
      setIcon($('#btn-repeat'), Player.P.repeat === 'one' ? 'repeatOne' : 'repeat');
      $('#btn-repeat').classList.toggle('on', Player.P.repeat !== 'off');
      $('#btn-repeat').title = Player.P.repeat === 'off' ? 'Enable repeat' : Player.P.repeat === 'all' ? 'Enable repeat one' : 'Disable repeat';
    });
    Player.on('queue', () => { if (rpMode === 'queue') renderRightPanel(); });
    Player.on('meta', () => { if (Player.current && Player.current.kind === 'video') { renderRightPanel(); renderNowPlayingBar(); } });
  }

  function updateTitle() {
    const t = Player.current;
    document.title = t && Player.playing ? `${t.title} • ${t.artist}` : 'Aurora';
  }

  function renderLibraryPlaying() {
    $$('#lib-list .lib-item').forEach((el) => {
      const on = Player.isCurrentContext(el.dataset.key);
      el.classList.toggle('playing', on);
      const b = $('.lib-play', el);
      if (b) setIcon(b, on && Player.playing ? 'pause' : 'play');
      const sp = $('.lib-speaker', el);
      if (on && Player.playing && !sp) el.appendChild(html(`<span class="lib-speaker" data-icon="volHigh" data-icon-size="16"></span>`));
      if ((!on || !Player.playing) && sp) sp.remove();
    });
  }

  function renderNowPlayingBar() {
    const t = Player.current;
    const left = $('#pb-left');
    if (!t) { left.innerHTML = ''; return; }
    const liked = State.isLiked(t.id);
    left.innerHTML = '';
    const el = html(`<div class="pb-track">
      <button class="pb-cover" title="Now playing view">${UI.coverHtml(UI.coverSrc(t), 'pb-cover-img')}</button>
      <div class="pb-text"><a class="pb-title" title="${esc(t.title)}">${esc(t.title)}</a><a class="pb-artist">${esc(t.artist)}</a></div>
      <button class="icon-btn small pb-like ${liked ? 'on' : ''}" title="${liked ? 'Remove from Favorites' : 'Save to Favorites'}">${liked ? icon('heartFilled', 16) : icon('heart', 16)}</button>
    </div>`);
    left.appendChild(el);
    $('.pb-cover', el).onclick = () => toggleRightPanel('nowplaying');
    $('.pb-title', el).onclick = () => Player.P.context && go('collection', Player.P.context.key);
    $('.pb-artist', el).onclick = () => t.artist !== 'Unknown artist' && go('collection', 'artist:' + t.artist);
    $('.pb-like', el).onclick = () => { const v = State.toggleLike(t.id); UI.toast(v ? 'Added to Favorites' : 'Removed from Favorites'); };
    el.oncontextmenu = (e) => { e.preventDefault(); UI.trackMenu(t, e.clientX, e.clientY); };
  }

  // ================= FULLSCREEN VIEW =================
  function toggleFullscreenView() {
    const fs = $('#fullscreen-view');
    const open = fs.classList.contains('hidden');
    if (open && !Player.current) return UI.toast('Play something first');
    fs.classList.toggle('hidden', !open);
    native.app.fullscreen(open);
    if (open) buildFsView(); else { fs.innerHTML = ''; placeMedia(); renderRightPanel(); }
  }

  function buildFsView() {
    const fs = $('#fullscreen-view');
    const t = Player.current;
    if (!t) return;
    fs.innerHTML = '';
    const el = html(`<div class="fs-inner ${t.kind === 'video' ? 'video' : 'audio'}">
      <div class="fs-bg" style="background-image:url('${esc(UI.coverSrc(t))}')"></div>
      <div class="fs-top"><span class="fs-logo">${icon('aurora', 28)}</span><span class="fs-ctx">${Player.P.context ? 'PLAYING FROM ' + esc((Player.P.context.name || '').toUpperCase()) : ''}</span><button class="icon-btn fs-exit" data-icon="exitFullscreen" title="Exit full screen"></button></div>
      ${t.kind === 'video' ? '<div class="fs-video-slot"></div>' : `<div class="fs-art"><img src="${esc(UI.coverSrc(t))}" /></div>`}
      <div class="fs-bottom">
        <div class="fs-meta"><div class="fs-title">${esc(t.title)}</div><div class="fs-artist">${esc(t.artist)}</div></div>
        <div class="pb-progress fs-progress"><span class="time" id="fs-cur">0:00</span><div class="slider" id="fs-seek"><div class="slider-track"><div class="slider-fill"></div></div><div class="slider-knob"></div></div><span class="time" id="fs-total">0:00</span></div>
        <div class="pb-controls fs-controls">
          <button class="icon-btn ctrl fs-shuffle ${Player.P.shuffle ? 'on' : ''}" data-icon="shuffle" data-icon-size="22"></button>
          <button class="icon-btn ctrl fs-prev" data-icon="prev" data-icon-size="22"></button>
          <button class="play-btn fs-play" data-icon="${Player.playing ? 'pause' : 'play'}" data-icon-size="22"></button>
          <button class="icon-btn ctrl fs-next" data-icon="next" data-icon-size="22"></button>
          <button class="icon-btn ctrl fs-repeat ${Player.P.repeat !== 'off' ? 'on' : ''}" data-icon="${Player.P.repeat === 'one' ? 'repeatOne' : 'repeat'}" data-icon-size="22"></button>
        </div>
      </div>
    </div>`);
    fs.appendChild(el);
    $('.fs-exit', el).onclick = toggleFullscreenView;
    $('.fs-play', el).onclick = Player.toggle;
    $('.fs-next', el).onclick = () => Player.next();
    $('.fs-prev', el).onclick = Player.prev;
    $('.fs-shuffle', el).onclick = () => { Player.toggleShuffle(); buildFsView(); };
    $('.fs-repeat', el).onclick = () => { Player.cycleRepeat(); buildFsView(); };
    slider($('#fs-seek', el), { onCommit: (v) => Player.seekRatio(v) });
    if (t.kind === 'video') { const slot = $('.fs-video-slot', el); slot.onclick = Player.toggle; }
    placeMedia();
  }
  function updateFsView() {
    const fs = $('#fullscreen-view');
    if (fs.classList.contains('hidden')) return;
    const b = $('.fs-play', fs);
    if (b && b.dataset.trackId !== Player.P.current) buildFsView();
    const bb = $('.fs-play', fs);
    if (bb) { setIcon(bb, Player.playing ? 'pause' : 'play'); bb.dataset.trackId = Player.P.current; }
  }

  // ================= PROFILES =================
  async function switchProfile(id) {
    Player.stop();
    await State.switchProfile(id);
    afterProfileChange();
    UI.toast(`Switched to ${State.activeProfile().name}`);
  }

  function afterProfileChange() {
    applyTheme();
    renderAvatar();
    renderLibrary();
    Player.restore();
    renderRightPanel();
    hist.length = 0; hIndex = -1;
    go('home');
  }

  // "Who's listening?" screen - also used at first run and for "Log out"
  function showProfilePicker({ manage = false, firstRun = false } = {}) {
    UI.closeModal();
    const root = $('#overlay-root');
    $$('.picker', root).forEach((p) => p.remove());
    const el = html(`<div class="picker">
      <div class="picker-logo">${icon('aurora', 44)}<span>Aurora</span></div>
      <h1>${firstRun ? 'Welcome to Aurora' : manage ? 'Manage profiles' : "Who's listening?"}</h1>
      ${firstRun ? '<p class="picker-sub">Create your profile to get started. You can add more profiles and switch between them any time.</p>' : ''}
      <div class="picker-grid"></div>
      ${!firstRun ? `<div class="picker-actions"><button class="btn-outline picker-manage">${manage ? 'Done' : 'Manage profiles'}</button></div>` : ''}
    </div>`);
    const grid = $('.picker-grid', el);
    if (firstRun) {
      const form = html(`<div class="picker-form">
        <div class="picker-avatar-edit" title="Choose photo"><span class="pa-preview">${UI.avatarHtml({ name: 'L', color: '#8b7bff' }, 120)}</span><span class="pa-edit">${icon('edit', 28)}<span>Choose photo</span></span></div>
        <input class="input big" placeholder="Your name" maxlength="40" value="" />
        <button class="btn-accent big">Start listening</button>
      </div>`);
      let avatar = null;
      const color = '#8b7bff';
      const input = $('input', form);
      const preview = () => { $('.pa-preview', form).innerHTML = UI.avatarHtml({ name: input.value || 'L', color, avatar }, 120); };
      input.addEventListener('input', preview);
      $('.picker-avatar-edit', form).onclick = async () => { const a = await pickPhoto(); if (a) { avatar = a; preview(); } };
      const go2 = async () => {
        const p = await State.createProfile({ name: input.value || 'Listener', avatar, color });
        await State.switchProfile(p.id);
        el.remove();
        afterProfileChange();
      };
      $('button', form).onclick = go2;
      input.addEventListener('keydown', (e) => e.key === 'Enter' && go2());
      grid.appendChild(form);
      setTimeout(() => input.focus(), 50);
    } else {
      for (const p of State.profiles()) {
        const item = html(`<div class="picker-item ${manage ? 'manage' : ''}">
          <div class="picker-av">${UI.avatarHtml(p, 148)}${manage ? `<span class="picker-edit">${icon('edit', 36)}</span>` : ''}</div>
          <div class="picker-name">${esc(p.name)}</div>
        </div>`);
        item.onclick = async () => {
          if (manage) return Views.profile.editModal(p, () => { el.remove(); showProfilePicker({ manage: true }); });
          el.remove();
          if (p.id !== State.S.profiles.activeId) await switchProfile(p.id); else afterProfileChange();
        };
        grid.appendChild(item);
      }
      const add = html(`<div class="picker-item add"><div class="picker-av"><span class="picker-add">${icon('plus', 64)}</span></div><div class="picker-name">Add profile</div></div>`);
      add.onclick = () => Views.profile.createModal((p) => { el.remove(); showProfilePicker({ manage }); });
      grid.appendChild(add);
      $('.picker-manage', el).onclick = () => { el.remove(); showProfilePicker({ manage: !manage }); };
      if (State.activeProfile()) {
        const close = html(`<button class="icon-btn picker-close" data-icon="close" title="Close"></button>`);
        close.onclick = () => el.remove();
        el.appendChild(close);
      }
    }
    hydrateIcons(el);
    root.appendChild(el);
  }

  // ================= DIALOGS =================
  function about() {
    UI.modal({
      title: 'About Aurora',
      width: 460,
      body: `<div class="about-box">
        <div class="about-logo">${icon('aurora', 72)}</div>
        <h2>Aurora</h2>
        <p>Version ${esc(State.S.info.version)} · Electron ${esc(State.S.info.electron)}</p>
        <p class="muted">A music &amp; video player with profiles and a built-in downloader powered by yt-dlp and ffmpeg. Aurora is open source — fork it, theme it and make it yours.</p>
        <p class="muted small">Inter typeface © The Inter Project Authors (SIL OFL 1.1). yt-dlp (Unlicense), FFmpeg (GPL).</p>
      </div>`,
      actions: [{ label: 'GitHub', action: () => native.shell.openExternal(App.REPO) }, { label: 'Close', primary: true }],
    });
  }
  function whatsNew() {
    UI.modal({
      title: "What's New",
      body: `<div class="whatsnew">
        <div class="wn-item"><span class="wn-dot"></span><div><b>Aurora ${esc(State.S.info.version)}</b><p>Profiles you can switch any time, the Video Downloader (YouTube, SoundCloud, Spotify links and 1000+ sites), playlists, Favorites, video playback, full screen mode and custom themes.</p></div></div>
        <div class="wn-item"><span class="wn-dot"></span><div><b>Make it yours</b><p>Settings → Appearance lets you change the accent colour and add custom CSS. Power users can edit <code>user.css</code> and <code>user.js</code> in the custom folder.</p></div></div>
      </div>`,
      actions: [{ label: 'Got it', primary: true }],
    });
  }
  function shortcuts() {
    const rows = [['Play / Pause', 'Space'], ['Next', 'Ctrl + →'], ['Previous', 'Ctrl + ←'], ['Volume up / down', 'Ctrl + ↑ / ↓'], ['Shuffle', 'Ctrl + S'], ['Repeat', 'Ctrl + R'], ['Search', 'Ctrl + K'], ['New playlist', 'Ctrl + N'], ['Back / Forward', 'Alt + ← / →'], ['Like current track', 'Alt + Shift + B'], ['Full screen', 'F11'], ['Video Downloader', 'Ctrl + D']];
    UI.modal({ title: 'Keyboard shortcuts', body: `<div class="kbd-list">${rows.map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>` });
  }

  // ================= KEYBOARD =================
  function initKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = e.target.matches('input, textarea, select, [contenteditable]');
      const k = e.key;
      if (k === 'F11') { e.preventDefault(); toggleFullscreenView(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'l' || k === 'f')) { e.preventDefault(); $('#search-input').focus(); $('#search-input').select(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'I' || k === 'i')) { native.app.devtools(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'R' || k === 'r')) { native.app.reload(); return; }
      if (typing) return;
      if (k === ' ') { e.preventDefault(); Player.toggle(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'ArrowRight') Player.next();
      else if ((e.ctrlKey || e.metaKey) && k === 'ArrowLeft') Player.prev();
      else if ((e.ctrlKey || e.metaKey) && k === 'ArrowUp') { e.preventDefault(); Player.setVolume(Player.P.volume + 0.1); }
      else if ((e.ctrlKey || e.metaKey) && k === 'ArrowDown') { e.preventDefault(); Player.setVolume(Player.P.volume - 0.1); }
      else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); Player.toggleShuffle(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'r') { e.preventDefault(); Player.cycleRepeat(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); newPlaylist(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); go('downloader'); }
      else if (e.altKey && k === 'ArrowLeft') back();
      else if (e.altKey && k === 'ArrowRight') forward();
      else if (e.altKey && e.shiftKey && (k === 'B' || k === 'b')) { if (Player.current) State.toggleLike(Player.current.id); }
      else if (k === 'Escape' && !$('#fullscreen-view').classList.contains('hidden')) toggleFullscreenView();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 3) back(); if (e.button === 4) forward(); });
    native.app.onFullscreen((on) => { if (!on && !$('#fullscreen-view').classList.contains('hidden')) { $('#fullscreen-view').classList.add('hidden'); $('#fullscreen-view').innerHTML = ''; placeMedia(); renderRightPanel(); } });
  }

  // ================= DOWNLOADS -> LIBRARY =================
  function initDownloads() {
    native.dl.onFile(({ track, addToLibrary }) => {
      if (!addToLibrary) return;
      State.addTracks([track]);
      UI.toast(`Added "${track.title}" to your library`);
    });
  }

  // ================= CUSTOM USER CODE =================
  async function loadCustom() {
    try {
      const { css, js } = await native.app.customFiles();
      App._fileCss = css || '';
      applyTheme();
      if (js && js.replace(/\/\/.*$/gm, '').trim()) {
        const s = document.createElement('script');
        s.textContent = js;
        document.body.appendChild(s);
      }
    } catch (e) { console.warn('custom code failed', e); }
  }

  // ================= BOOT =================
  async function boot() {
    hydrateIcons(document);
    const { firstRun } = await State.init();
    initTopbar();
    initSidebar();
    initRightPanel();
    initPlayerBar();
    initKeys();
    initDragDrop();
    initDownloads();
    Updates.init();
    DiscordConn.init();
    Store.init();
    Friends.init();
    ListenTogether.init();
    Friends.onChange(updateHubDot);
    Updates.onChange(updateHubDot);
    State.on('library', () => { renderLibrary(); rerender(); });
    State.on('likes', () => { renderNowPlayingBar(); renderRightPanel(); });
    State.on('profiles', renderAvatar);
    State.on('profile', renderAvatar);
    applyTheme();
    await loadCustom();
    if (firstRun) {
      showProfilePicker({ firstRun: true });
      go('home');
    } else {
      renderAvatar();
      renderLibrary();
      Player.restore();
      renderRightPanel();
      go('home');
      if (State.S.profiles.askOnStartup && State.profiles().length > 1) showProfilePicker();
    }
    rescanFolders();
    $('#app').classList.add('ready');
  }

  return {
    REPO: 'https://github.com/UndeadBossGames/Aurora',
    go, back, forward, render, rerender, setHeaderColor, applyTheme, renderLibrary, renderRightPanel,
    refreshNowPlaying: () => { renderNowPlayingBar(); renderRightPanel(); },
    playCollection, collectionMenu, newPlaylist, importFiles, importFolder, rescanFolders,
    switchProfile, showProfilePicker, afterProfileChange, toggleRightPanel, about,
    _updateHubDot: () => updateHubDot(),
    get current() { return current; },
    boot,
  };
})();

window.Aurora = { App, State, Player, UI, Views, icon, ICONS };
document.addEventListener('DOMContentLoaded', () => App.boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${esc(e.stack || e)}</pre>`); }));
