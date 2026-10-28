// Profile tab: view/edit the active profile and switch between profiles at any time.
Views.profile = {
  render(root, id) {
    const p = State.profiles().find((x) => x.id === id) || State.activeProfile();
    if (!p) return;
    const isActive = p.id === State.S.profiles.activeId;
    const data = State.S.p;
    const pls = isActive ? State.playlists() : [];
    const likedCount = isActive ? Object.keys(data.liked).filter((k) => State.track(k)).length : 0;
    App.setHeaderColor(p.avatar ? null : p.color);
    if (p.avatar) dominantColor(p.avatar).then((c) => App.current.view === 'profile' && App.setHeaderColor(c || p.color));

    const head = html(`<div class="coll-header profile-header">
      <div class="profile-avatar" title="Choose photo">${UI.avatarHtml(p, 232)}<div class="pa-hover">${icon('edit', 48)}<span>Choose photo</span></div></div>
      <div class="coll-meta">
        <div class="coll-type">Profile${isActive ? '' : ' (not active)'}</div>
        <h1 class="coll-title profile-name ${p.name.length > 14 ? 'long' : ''}">${esc(p.name)}</h1>
        <div class="coll-info"><span>${pls.length} Playlist${pls.length === 1 ? '' : 's'}</span><span class="dot">•</span><span>${likedCount} Favorite${likedCount === 1 ? '' : 's'}</span><span class="dot">•</span><span>${State.profiles().length} Profile${State.profiles().length === 1 ? '' : 's'} on this PC</span></div>
      </div>
    </div>`);
    root.appendChild(head);
    $('.profile-avatar', head).onclick = () => Views.profile.editModal(p);
    $('.profile-name', head).onclick = () => Views.profile.editModal(p);

    const bar = html(`<div class="action-bar"><div class="ab-left"></div></div>`);
    if (!isActive) {
      const sw = html(`<button class="btn-accent">Switch to ${esc(p.name)}</button>`);
      sw.onclick = () => App.switchProfile(p.id);
      $('.ab-left', bar).appendChild(sw);
    }
    const more = html(`<button class="icon-btn ab-icon" data-icon="dotsH" data-icon-size="32" title="More options"></button>`);
    more.onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu([
        { label: 'Edit profile', icon: 'edit', action: () => Views.profile.editModal(p) },
        { label: 'Switch profile', icon: 'users', action: () => App.showProfilePicker() },
        { label: 'Add profile', icon: 'plus', action: () => Views.profile.createModal() },
        { divider: true },
        { label: 'Delete profile', icon: 'trash', danger: true, disabled: State.profiles().length <= 1, action: () => Views.profile.deleteProfile(p) },
      ], r.left, r.bottom + 4);
    };
    $('.ab-left', bar).appendChild(more);
    root.appendChild(bar);

    // ---- Switch profile (always visible on this tab) ----
    const sw = html(`<section class="shelf profiles-shelf">
      <div class="shelf-head"><h2 class="shelf-title">Switch profile</h2><button class="shelf-more">Manage profiles</button></div>
      <div class="shelf-subtitle">Each profile has its own Favorites, playlists, history and theme.</div>
      <div class="shelf-row profile-row"></div>
    </section>`);
    $('.shelf-more', sw).onclick = () => App.showProfilePicker({ manage: true });
    const row = $('.profile-row', sw);
    for (const q of State.profiles()) {
      const active = q.id === State.S.profiles.activeId;
      const card = html(`<div class="card profile-card ${active ? 'active' : ''}">
        <div class="card-img">${UI.avatarHtml(q, 160)}${active ? '<span class="profile-badge">Active</span>' : ''}</div>
        <div class="card-title">${esc(q.name)}</div>
        <div class="card-sub">${active ? 'Listening now' : 'Click to switch'}</div>
      </div>`);
      card.onclick = () => (active ? App.go('profile', q.id) : App.switchProfile(q.id));
      card.oncontextmenu = (e) => {
        e.preventDefault();
        UI.menu([
          { label: active ? 'Current profile' : 'Switch to this profile', icon: 'users', disabled: active, action: () => App.switchProfile(q.id) },
          { label: 'Edit profile', icon: 'edit', action: () => Views.profile.editModal(q) },
          { label: 'Delete profile', icon: 'trash', danger: true, disabled: State.profiles().length <= 1, action: () => Views.profile.deleteProfile(q) },
        ], e.clientX, e.clientY);
      };
      row.appendChild(card);
    }
    const add = html(`<div class="card profile-card add"><div class="card-img"><span class="add-circle">${icon('plus', 56)}</span></div><div class="card-title">Add profile</div><div class="card-sub">For family &amp; friends</div></div>`);
    add.onclick = () => Views.profile.createModal();
    row.appendChild(add);
    root.appendChild(sw);

    // ---- startup option ----
    const opt = html(`<label class="toggle-row"><span>Ask "Who's listening?" when Aurora starts</span><input type="checkbox" class="toggle" ${State.S.profiles.askOnStartup ? 'checked' : ''} /></label>`);
    $('input', opt).onchange = (e) => { State.S.profiles.askOnStartup = e.target.checked; native.store.write('profiles', State.S.profiles); };
    root.appendChild(opt);

    if (!isActive) return;

    // ---- Top tracks this month ----
    const top = Object.entries(data.plays).map(([tid, n]) => [State.track(tid), n]).filter(([t]) => t).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) {
      const s = html(`<section class="shelf"><div class="shelf-head"><h2 class="shelf-title">Top tracks</h2></div><div class="shelf-subtitle">Only visible to you</div></section>`);
      s.appendChild(UI.trackTable(top.map(([t]) => ({ track: t, addedAt: t.addedAt })), { contextKey: 'top', contextName: 'Top tracks', showAdded: false, compact: true }));
      root.appendChild(s);
    }
    // ---- Top artists ----
    const artistPlays = {};
    for (const [tid, n] of Object.entries(data.plays)) { const t = State.track(tid); if (t && t.artist !== 'Unknown artist') artistPlays[t.artist] = (artistPlays[t.artist] || 0) + n; }
    const arts = Object.entries(artistPlays).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => State.artists().find((a) => a.name === name)).filter(Boolean);
    if (arts.length) root.appendChild(UI.shelf('Top artists', arts.map((a) => UI.card({ title: a.name, sub: 'Artist', round: true, cover: a.cover ? native.fileUrl(a.cover) : genCover(a.name, a.name), onOpen: () => App.go('collection', 'artist:' + a.name), onPlay: () => App.playCollection('artist:' + a.name) })), { subtitle: 'Only visible to you' }));
    // ---- Playlists ----
    if (pls.length) root.appendChild(UI.shelf('Playlists', pls.map((pl) => UI.card({ title: pl.name, sub: `${pl.items.length} item${pl.items.length === 1 ? '' : 's'}`, cover: State.playlistCover(pl), key: 'pl:' + pl.id, onOpen: () => App.go('collection', 'pl:' + pl.id), onPlay: () => App.playCollection('pl:' + pl.id) }))));
    root.appendChild(html('<div class="view-footer"></div>'));
  },

  profileForm(p = {}) {
    let avatar = p.avatar || null;
    let color = p.color || State.PROFILE_COLORS[State.profiles().length % State.PROFILE_COLORS.length];
    const body = html(`<div class="edit-details profile-edit">
      <div class="ed-cover round"><span class="ed-av">${UI.avatarHtml({ name: p.name || '?', color, avatar }, 180)}</span><div class="ed-cover-edit">${icon('edit', 40)}<span>Choose photo</span></div></div>
      <div class="ed-fields">
        <input class="input" name="name" placeholder="Profile name" maxlength="40" value="${esc(p.name || '')}" />
        <div class="color-row">${State.PROFILE_COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
        <button class="link-btn remove-photo" ${avatar ? '' : 'hidden'}>Remove photo</button>
      </div>
    </div>`);
    const nameIn = $('[name=name]', body);
    const redraw = () => { $('.ed-av', body).innerHTML = UI.avatarHtml({ name: nameIn.value || '?', color, avatar }, 180); $('.remove-photo', body).hidden = !avatar; };
    nameIn.addEventListener('input', redraw);
    $('.ed-cover', body).onclick = async () => { const a = await native.dialog.image(); if (a) { avatar = a; redraw(); } };
    $('.remove-photo', body).onclick = () => { avatar = null; redraw(); };
    $$('.swatch', body).forEach((s) => s.onclick = () => { color = s.dataset.c; $$('.swatch', body).forEach((x) => x.classList.toggle('on', x === s)); redraw(); });
    return { body, get: () => ({ name: nameIn.value.trim(), avatar, color }) };
  },

  createModal(cb) {
    const f = Views.profile.profileForm({});
    UI.modal({
      title: 'Add profile', body: f.body,
      actions: [{ label: 'Create profile', primary: true, action: async () => {
        const v = f.get();
        if (!v.name) { UI.toast('Give the profile a name'); return false; }
        const p = await State.createProfile(v);
        UI.toast(`Profile "${p.name}" created`);
        if (cb) cb(p);
        else if (await native.dialog.confirm({ message: `Switch to ${p.name} now?`, ok: 'Switch' })) App.switchProfile(p.id);
        else App.render();
      } }],
    });
  },

  editModal(p, cb) {
    const f = Views.profile.profileForm(p);
    UI.modal({
      title: 'Profile details', body: f.body,
      actions: [
        State.profiles().length > 1 ? { label: 'Delete', action: () => { Views.profile.deleteProfile(p, cb); } } : null,
        { label: 'Save', primary: true, action: () => {
          const v = f.get();
          State.updateProfile(p.id, { name: v.name || p.name, avatar: v.avatar, color: v.color });
          App.render();
          cb && cb();
        } },
      ].filter(Boolean),
    });
  },

  async deleteProfile(p, cb) {
    if (State.profiles().length <= 1) return;
    if (!(await native.dialog.confirm({ message: `Delete profile "${p.name}"?`, detail: 'Its playlists, Favorites and history will be removed. Downloaded files stay on your computer.', ok: 'Delete' }))) return;
    const wasActive = p.id === State.S.profiles.activeId;
    await State.deleteProfile(p.id);
    UI.toast('Profile deleted');
    if (wasActive) App.afterProfileChange(); else App.render();
    cb && cb();
  },
};
