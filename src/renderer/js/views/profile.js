// Profile tab: view/edit the active profile and switch between profiles at any time.
Views.profile = {
  render(root, id) {
    const p = State.profiles().find((x) => x.id === id) || State.activeProfile();
    if (!p) return;
    const isActive = p.id === State.S.profiles.activeId;
    const data = State.S.p;
    const pls = isActive ? State.playlists() : [];
    const likedCount = isActive ? Object.keys(data.liked).filter((k) => State.track(k)).length : 0;
    App.setHeaderColor(null);
    root.appendChild(Views.profile.card(p, { isActive, pls: pls.length, liked: likedCount, editable: true }));

    const bar = html(`<div class="action-bar"><div class="ab-left"></div></div>`);
    const ed = html(`<button class="btn-accent">${icon('edit', 16)} Customize profile</button>`);
    ed.onclick = () => Views.profile.customize(p);
    $('.ab-left', bar).appendChild(ed);
    if (!isActive) {
      const sw = html(`<button class="btn-outline">Switch to ${esc(p.name)}</button>`);
      sw.onclick = () => App.switchProfile(p.id);
      $('.ab-left', bar).appendChild(sw);
    }
    const more = html(`<button class="icon-btn ab-icon" data-icon="dotsH" data-icon-size="32" title="More options"></button>`);
    more.onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu([
        { label: 'Customize profile', icon: 'edit', action: () => Views.profile.customize(p) },
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
    $('.ed-cover', body).onclick = async () => { const a = await pickPhoto(); if (a) { avatar = a; redraw(); } };
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

// ======================================================================
//  Profile personalization: banner, bio, pronouns, status, favorites,
//  profile effects. Shared with friends through the Friends feature.
// ======================================================================
const PROFILE_BANNERS = [
  ['aurora', 'linear-gradient(120deg,#3b2a8a,#1c6e8c 55%,#2de2c9)'],
  ['sunset', 'linear-gradient(120deg,#ff7a59,#ff3fa4 60%,#7b2ff7)'],
  ['ocean', 'linear-gradient(120deg,#0b3d91,#1fa2ff 60%,#12d8fa)'],
  ['forest', 'linear-gradient(120deg,#0f3d2e,#2f8f5b 60%,#a3e635)'],
  ['candy', 'linear-gradient(120deg,#ff9a9e,#fad0c4 50%,#a18cd1)'],
  ['night', 'linear-gradient(120deg,#0f0c29,#302b63 55%,#24243e)'],
  ['gold', 'linear-gradient(120deg,#7a4b00,#ffb547 55%,#ffe29a)'],
  ['neon', 'linear-gradient(120deg,#ff2bd6,#7a00ff 50%,#00e5ff)'],
];
const bannerCss = (b, fallbackColor) => {
  if (b && b.type === 'image' && b.value) return `url('${native.fileUrl(b.value)}') center/cover`;
  if (b && b.type === 'gradient') return (PROFILE_BANNERS.find((x) => x[0] === b.value) || PROFILE_BANNERS[0])[1];
  return `linear-gradient(120deg, ${fallbackColor || '#8b7bff'}, color-mix(in srgb, ${fallbackColor || '#8b7bff'} 30%, #0b0b14))`;
};

Object.assign(Views.profile, {
  // big header card used on the Profile page (and, with friend data, in the friend viewer)
  card(p, { isActive = true, pls = 0, liked = 0, editable = false, friend = null } = {}) {
    const fav = (x) => x || null;
    const favSong = fav(p.favSong), favAlbum = fav(p.favAlbum), favArtist = fav(p.favArtist);
    const img = (local, remote, seed, ic) => (local ? native.fileUrl(local) : remote || genCover(seed || 'x', '', ic));
    const el = html(`<div class="pf">
      <div class="pf-banner" style="background:${bannerCss(p.banner, p.color)}">${editable ? `<button class="pf-banner-edit">${icon('edit', 14)} Edit banner</button>` : ''}</div>
      <div class="pf-body">
        <div class="pf-av-wrap" data-effect="${esc(p.effect || '')}">${friend ? (friend.avatar ? `<span class="avatar-img" style="width:150px;height:150px"><img src="${esc(friend.avatar)}"></span>` : UI.avatarHtml({ name: p.name, color: p.color }, 150)) : UI.avatarHtml(p, 150)}<span class="pf-fx"></span>${editable ? `<button class="pf-av-edit" title="Change photo">${icon('edit', 20)}</button>` : ''}</div>
        <div class="pf-id">
          <div class="pf-name-row"><h1 class="pf-name">${esc(p.name)}</h1>${p.pronouns ? `<span class="pf-pronouns">${esc(p.pronouns)}</span>` : ''}</div>
          ${p.statusText || p.statusEmoji ? `<div class="pf-status">${esc(p.statusEmoji || '')} ${esc(p.statusText || '')}</div>` : ''}
          ${p.bio ? `<div class="pf-bio">${esc(p.bio)}</div>` : editable ? `<div class="pf-bio muted pf-bio-empty">Add a bio so friends know what you're about ✨</div>` : ''}
          ${friend ? '' : `<div class="pf-stats"><span><b>${pls}</b> playlists</span><span><b>${liked}</b> favorites</span><span><b>${Object.values(State.S.p.plays || {}).reduce((a, b) => a + b, 0)}</b> plays</span></div>`}
        </div>
      </div>
      ${favSong || favAlbum || favArtist ? `<div class="pf-favs">
        ${favSong ? `<div class="pf-fav song" data-k="song"><img src="${esc(img(favSong.cover, favSong.coverUrl, favSong.title, 'music'))}"><div><small>${icon('heartFilled', 12)} Favorite song</small><b>${esc(favSong.title)}</b><span>${esc(favSong.artist || '')}</span></div>${favSong.id && State.track(favSong.id) ? `<button class="fab pf-play">${icon('play', 16)}</button>` : ''}</div>` : ''}
        ${favAlbum ? `<div class="pf-fav album" data-k="album"><img src="${esc(img(favAlbum.cover, favAlbum.coverUrl, favAlbum.name, 'music'))}"><div><small>${icon('library', 12)} Favorite album</small><b>${esc(favAlbum.name)}</b><span>${esc(favAlbum.artist || '')}</span></div></div>` : ''}
        ${favArtist ? `<div class="pf-fav artist" data-k="artist"><img class="round" src="${esc(img(favArtist.cover, favArtist.coverUrl, favArtist.name, 'user'))}"><div><small>${icon('user', 12)} Favorite artist</small><b>${esc(favArtist.name)}</b><span>Artist</span></div></div>` : ''}
      </div>` : editable ? `<button class="pf-favs-empty">${icon('plus', 16)} Show off your favorite song, album and artist</button>` : ''}
    </div>`);
    if (editable) {
      $('.pf-banner-edit', el).onclick = () => Views.profile.customize(p, 'look');
      $('.pf-av-edit', el).onclick = () => Views.profile.customize(p, 'look');
      $('.pf-name', el).onclick = () => Views.profile.customize(p, 'about');
      const be = $('.pf-bio-empty', el); if (be) be.onclick = () => Views.profile.customize(p, 'about');
      const fe = $('.pf-favs-empty', el); if (fe) fe.onclick = () => Views.profile.customize(p, 'favorites');
      const play = $('.pf-play', el);
      if (play) play.onclick = () => Player.playContext({ key: 'downloads', name: 'Favorite song' }, [favSong.id], 0);
      const fa = $('.pf-fav.artist', el);
      if (fa && State.artists().some((a) => a.name === favArtist.name)) fa.onclick = () => App.go('collection', 'artist:' + favArtist.name);
    } else {
      $$('.pf-fav', el).forEach((f) => f.onclick = () => {
        const k = f.dataset.k;
        const q = k === 'song' ? `${favSong.artist || ''} ${favSong.title}` : k === 'album' ? `${favAlbum.artist || ''} ${favAlbum.name}` : favArtist.name;
        UI.closeModal();
        App.go('discover', q.trim());
      });
    }
    return el;
  },

  // tabbed "Customize profile" window
  customize(p, tab = 'about') {
    const draft = {
      name: p.name, pronouns: p.pronouns || '', bio: p.bio || '', statusEmoji: p.statusEmoji || '', statusText: p.statusText || '',
      avatar: p.avatar || null, color: p.color, banner: p.banner || null, effect: p.effect || '',
      favSong: p.favSong || null, favAlbum: p.favAlbum || null, favArtist: p.favArtist || null,
    };
    let bannerData = null; // newly uploaded banner image (data URL)
    const body = html(`<div class="cz">
      <div class="cz-tabs"><button data-t="about">About</button><button data-t="look">Look</button><button data-t="favorites">Favorites</button><button data-t="effects">Effects</button></div>
      <div class="cz-grid"><div class="cz-pane"></div><div class="cz-preview"><div class="muted cz-prev-label">Preview</div><div class="cz-prev-host"></div></div></div>
    </div>`);
    const pane = $('.cz-pane', body);
    const preview = () => {
      const host = $('.cz-prev-host', body);
      host.innerHTML = '';
      const tmp = { ...p, ...draft, banner: bannerData ? { type: 'image-data', value: bannerData } : draft.banner };
      const card = Views.profile.card(tmp, { isActive: true, pls: State.playlists().length, liked: Object.keys(State.S.p.liked).length, editable: false });
      if (bannerData) $('.pf-banner', card).style.background = `url('${bannerData}') center/cover`;
      card.classList.add('mini');
      host.appendChild(card);
    };
    const tabs = {
      about() {
        pane.innerHTML = '';
        const el = html(`<div class="form">
          <label>Display name<input class="input" data-f="name" maxlength="40" value="${esc(draft.name)}"></label>
          <label>Pronouns <span class="muted">(optional)</span><input class="input" data-f="pronouns" maxlength="24" placeholder="e.g. he/him, she/her, they/them" value="${esc(draft.pronouns)}"></label>
          <label>Status</label>
          <div class="cz-status"><button class="cz-emoji">${esc(draft.statusEmoji || '😀')}</button><input class="input" data-f="statusText" maxlength="60" placeholder="What's your vibe right now?" value="${esc(draft.statusText)}"></div>
          <div class="cz-emoji-grid" hidden>${['🎧', '🎶', '🔥', '😎', '💜', '🌙', '☕', '🎮', '📚', '💤', '🚗', '🏋️', '🎉', '🌊', '✨', '😀', '🥳', '🤘'].map((e) => `<button>${e}</button>`).join('')}<button class="cz-noemoji">✕</button></div>
          <label>Bio <span class="muted cz-count"></span><textarea class="input" data-f="bio" maxlength="300" placeholder="Tell friends about your music taste, what you're into…">${esc(draft.bio)}</textarea></label>
        </div>`);
        $$('[data-f]', el).forEach((i) => i.addEventListener('input', () => { draft[i.dataset.f] = i.value; if (i.dataset.f === 'bio') count(); preview(); }));
        const count = () => { $('.cz-count', el).textContent = `${draft.bio.length}/300`; };
        count();
        $('.cz-emoji', el).onclick = () => { $('.cz-emoji-grid', el).hidden = !$('.cz-emoji-grid', el).hidden; };
        $$('.cz-emoji-grid button', el).forEach((b) => b.onclick = () => { draft.statusEmoji = b.classList.contains('cz-noemoji') ? '' : b.textContent; $('.cz-emoji', el).textContent = draft.statusEmoji || '😀'; $('.cz-emoji-grid', el).hidden = true; preview(); });
        pane.appendChild(el);
      },
      look() {
        pane.innerHTML = '';
        const el = html(`<div class="form">
          <label>Profile photo</label>
          <div class="cz-row"><span class="cz-av">${UI.avatarHtml({ ...p, ...draft }, 64)}</span><button class="btn-outline sm cz-photo">${icon('edit', 14)} Choose photo</button>${draft.avatar ? '<button class="link-btn cz-nophoto">Remove</button>' : ''}</div>
          <label>Profile color</label>
          <div class="color-row">${State.PROFILE_COLORS.map((c) => `<button class="swatch ${c === draft.color ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
          <label>Banner</label>
          <div class="cz-banners">
            <button class="cz-banner ${!draft.banner && !bannerData ? 'on' : ''}" data-b="" style="background:${bannerCss(null, draft.color)}"><span>Auto</span></button>
            ${PROFILE_BANNERS.map(([k, g]) => `<button class="cz-banner ${draft.banner && draft.banner.type === 'gradient' && draft.banner.value === k ? 'on' : ''}" data-b="${k}" style="background:${g}"></button>`).join('')}
            <button class="cz-banner upload ${bannerData || (draft.banner && draft.banner.type === 'image') ? 'on' : ''}">${icon('import', 18)}<span>Upload</span></button>
          </div>
        </div>`);
        $('.cz-photo', el).onclick = async () => { const a = await pickPhoto(400); if (a) { draft.avatar = a; tabs.look(); preview(); } };
        const np = $('.cz-nophoto', el); if (np) np.onclick = () => { draft.avatar = null; tabs.look(); preview(); };
        $$('.swatch', el).forEach((s) => s.onclick = () => { draft.color = s.dataset.c; tabs.look(); preview(); });
        $$('.cz-banner[data-b]', el).forEach((b) => b.onclick = () => { bannerData = null; draft.banner = b.dataset.b ? { type: 'gradient', value: b.dataset.b } : null; tabs.look(); preview(); });
        $('.cz-banner.upload', el).onclick = async () => { const d = await pickBanner(); if (d) { bannerData = d; tabs.look(); preview(); } };
        pane.appendChild(el);
      },
      favorites() {
        pane.innerHTML = '';
        const el = html(`<div class="form">
          <div class="dc-msg">Pick from your library or type anything. Friends see these on your profile and can find them in one click.</div>
          ${['song', 'album', 'artist'].map((k) => {
            const v = draft['fav' + k[0].toUpperCase() + k.slice(1)];
            const label = { song: 'Favorite song', album: 'Favorite album', artist: 'Favorite artist' }[k];
            const text = v ? (k === 'song' ? `${v.title} · ${v.artist || ''}` : k === 'album' ? `${v.name}${v.artist ? ' · ' + v.artist : ''}` : v.name) : 'Not set';
            return `<label>${label}</label><div class="cz-fav-row"><span class="cz-fav-val ${v ? '' : 'muted'}">${esc(text)}</span><button class="btn-outline sm cz-pick" data-k="${k}">Choose</button>${v ? `<button class="icon-btn small cz-clear" data-k="${k}" title="Clear">${icon('close', 14)}</button>` : ''}</div>`;
          }).join('')}
        </div>`);
        $$('.cz-pick', el).forEach((b) => b.onclick = () => Views.profile.pickFavorite(b.dataset.k, (val) => { draft['fav' + b.dataset.k[0].toUpperCase() + b.dataset.k.slice(1)] = val; tabs.favorites(); preview(); }));
        $$('.cz-clear', el).forEach((b) => b.onclick = () => { draft['fav' + b.dataset.k[0].toUpperCase() + b.dataset.k.slice(1)] = null; tabs.favorites(); preview(); });
        pane.appendChild(el);
      },
      effects() {
        pane.innerHTML = '';
        const el = html(`<div><div class="dc-msg" style="margin-bottom:10px">A profile effect animates around your picture: on your profile, in the menu, and for friends. Get more in the Store.</div>
          <div class="cz-effects">${Store.PROFILE_EFFECTS.map((e) => `<button class="cz-effect ${draft.effect === e.id ? 'on' : ''}" data-e="${e.id}"><span class="pf-av-wrap sm" data-effect="${e.id}">${UI.avatarHtml({ ...p, ...draft }, 54)}<span class="pf-fx"></span></span><b>${esc(e.name)}</b></button>`).join('')}</div></div>`);
        $$('.cz-effect', el).forEach((b) => b.onclick = () => { draft.effect = b.dataset.e; tabs.effects(); preview(); });
        pane.appendChild(el);
      },
    };
    const show = (t) => { $$('.cz-tabs button', body).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); tabs[t](); };
    $$('.cz-tabs button', body).forEach((b) => b.onclick = () => show(b.dataset.t));
    show(tab);
    preview();
    UI.modal({
      title: 'Customize profile', body, width: 980,
      actions: [{ label: 'Cancel' }, { label: 'Save profile', primary: true, action: async () => {
        const patch = { ...draft, name: draft.name.trim() || p.name, bio: draft.bio.trim(), pronouns: draft.pronouns.trim(), statusText: draft.statusText.trim() };
        if (bannerData) patch.banner = { type: 'image', value: await native.library.saveCover('banner-' + p.id, bannerData) };
        // https artwork so friends can see your favorites too
        for (const k of ['favSong', 'favAlbum', 'favArtist']) {
          const v = patch[k];
          if (v && !v.coverUrl) {
            try {
              const art = await native.art.lookup(k === 'favArtist' ? '' : (v.title || v.name), v.artist || (k === 'favArtist' ? v.name : ''));
              v.coverUrl = k === 'favArtist' ? art.artist : art.album;
            } catch {}
          }
        }
        State.updateProfile(p.id, patch);
        App.render();
        UI.toast('Profile saved');
      } }],
    });
  },

  pickFavorite(kind, done) {
    const tracks = State.allTracks();
    let items;
    if (kind === 'song') items = tracks.map((t) => ({ title: t.title, sub: t.artist, cover: t.cover, val: { id: t.id, title: t.title, artist: t.artist, cover: t.cover || null, coverUrl: t.coverUrl || null } }));
    else if (kind === 'album') {
      const m = new Map();
      tracks.forEach((t) => { if (t.album && !/^(downloads|testmedia|youtube|soundcloud)$/i.test(t.album)) { const k = t.album + '|' + t.artist; if (!m.has(k)) m.set(k, { title: t.album, sub: t.artist, cover: t.cover, val: { name: t.album, artist: t.artist, cover: t.cover || null } }); } });
      items = [...m.values()];
    } else items = State.artists().map((a) => ({ title: a.name, sub: `${a.count} song${a.count === 1 ? '' : 's'}`, cover: a.cover, round: true, val: { name: a.name, cover: a.cover || null } }));
    const body = html(`<div class="form">
      <div class="find-input" style="width:100%;margin:0"><span data-icon="search" data-icon-size="16"></span><input placeholder="Search your library…" /></div>
      <div class="cp-list scroll pick-list"></div>
      <div class="cz-custom"><span class="muted">Not in your library?</span><input class="input cz-c1" placeholder="${kind === 'artist' ? 'Artist name' : kind === 'album' ? 'Album name' : 'Song title'}">${kind !== 'artist' ? '<input class="input cz-c2" placeholder="Artist">' : ''}<button class="btn-accent sm cz-use">Use this</button></div>
    </div>`);
    const list = $('.pick-list', body);
    const draw = () => {
      const q = $('input', body).value.toLowerCase();
      list.innerHTML = '';
      const shown = items.filter((i) => !q || `${i.title} ${i.sub}`.toLowerCase().includes(q)).slice(0, 200);
      if (!shown.length) list.appendChild(html('<div class="muted cp-empty">Nothing here. Type it below instead.</div>'));
      for (const it of shown) {
        const r = html(`<button class="cp-row">${UI.coverHtml(it.cover ? native.fileUrl(it.cover) : genCover(it.title, '', kind === 'artist' ? 'user' : 'music'), 'tl-cover', it.round)}<span class="cp-t"><b>${esc(it.title)}</b><small>${esc(it.sub || '')}</small></span></button>`);
        r.onclick = () => { UI.closeModal(); setTimeout(() => done(it.val), 0); };
        list.appendChild(r);
      }
    };
    $('input', body).addEventListener('input', debounce(draw, 100));
    $('.cz-use', body).onclick = () => {
      const a = $('.cz-c1', body).value.trim(), b = $('.cz-c2', body) ? $('.cz-c2', body).value.trim() : '';
      if (!a) return UI.toast('Type a name first');
      const val = kind === 'song' ? { title: a, artist: b } : kind === 'album' ? { name: a, artist: b } : { name: a };
      UI.closeModal(); setTimeout(() => done(val), 0);
    };
    draw();
    // the picker replaces the customize window, so reopen it after picking
    const parent = $('.modal-backdrop');
    if (parent) parent.style.display = 'none';
    const m = UI.modal({ title: { song: 'Pick your favorite song', album: 'Pick your favorite album', artist: 'Pick your favorite artist' }[kind], body, width: 560, onClose: () => { if (parent) { parent.style.display = ''; document.getElementById('overlay-root').appendChild(parent); } } });
  },

  // a friend's public profile (from their Friends presence)
  friendModal(f, p) {
    const prof = (p && p.profile) || {};
    const fake = {
      name: f.nickname || p.name || f.code, color: p.color || '#8b7bff', pronouns: prof.pronouns, bio: prof.bio,
      statusEmoji: prof.statusEmoji, statusText: prof.statusText, effect: prof.effect, banner: prof.banner,
      favSong: prof.favSong ? { title: prof.favSong.title, artist: prof.favSong.artist, coverUrl: prof.favSong.cover } : null,
      favAlbum: prof.favAlbum ? { name: prof.favAlbum.name, artist: prof.favAlbum.artist, coverUrl: prof.favAlbum.cover } : null,
      favArtist: prof.favArtist ? { name: prof.favArtist.name, coverUrl: prof.favArtist.cover } : null,
    };
    const body = Views.profile.card(fake, { friend: { avatar: p.avatar }, editable: false });
    body.classList.add('in-modal');
    const t = p.track;
    if (t && (p.status === 'listening' || p.status === 'paused')) body.appendChild(html(`<div class="pf-now">${icon('headphones', 16)} ${p.status === 'listening' ? 'Listening to' : 'Paused on'} <b>${esc(t.title)}</b> · ${esc(t.artist)}</div>`));
    const actions = [];
    if (p.together) actions.push({ label: 'Listen together', primary: true, action: () => { ListenTogether.join(p.together); App.go('together'); } });
    actions.push({ label: 'Close', primary: !p.together });
    UI.modal({ title: f.nickname || p.name || 'Friend', body, width: 640, actions });
  },
});

// banner photos are wide, so crop to 3:1 instead of square
async function pickBanner() {
  let raw;
  try { raw = await native.dialog.image(); } catch (e) { UI.toast(String(e.message || e)); return null; }
  if (!raw) return null;
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = raw; });
    const w = Math.min(1500, img.naturalWidth), h = Math.round(w / 3);
    const srcH = Math.min(img.naturalHeight, img.naturalWidth / 3), srcW = srcH * 3;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, (img.naturalWidth - srcW) / 2, (img.naturalHeight - srcH) / 2, srcW, srcH, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.88);
  } catch { UI.toast("Couldn't read that image."); return null; }
}
