// Aurora Account: sign in on every device with the same name + password to share your profile,
// Favorites, playlists and songs between them.
Views.account = {
  render(root) {
    App.setHeaderColor('rgba(45, 212, 191, .32)');
    const el = html('<div class="ac-page"></div>');
    root.appendChild(el);
    let q = '', limit = 150, lastSig = '';

    const signInForm = () => {
      el.innerHTML = `
        <div class="ac-hero">
          <div class="ac-hero-icon">${icon('cloud', 54)}</div>
          <div>
            <div class="coll-type">Aurora Account</div>
            <h1 class="coll-title ac-title">One library, every device</h1>
            <p class="ac-lead">Sign in with the same account on your PC and your iPhone. Your profile, Favorites, playlists and look follow you, and every song on one device can be downloaded on the other.</p>
          </div>
        </div>
        <div class="ac-grid">
          <form class="ac-card ac-form" autocomplete="on">
            <h3>Sign in or create an account</h3>
            <label>Account name<input class="input ac-name" name="username" autocomplete="username" spellcheck="false" maxlength="40" placeholder="e.g. rj-music" /></label>
            <label>Password<input class="input ac-pass" type="password" name="password" autocomplete="current-password" maxlength="128" placeholder="At least 8 characters" /></label>
            <div class="ac-err" hidden></div>
            <button class="btn-accent ac-go" type="submit">${icon('cloud', 16)} Sign in</button>
            <p class="ac-small">New name? It becomes your account the first time you sign in. Use the <b>exact same name and password</b> on your other devices.</p>
          </form>
          <div class="ac-card ac-how">
            <h3>How it works</h3>
            <ul>
              <li>${icon('check', 16)}<span><b>End-to-end encrypted.</b> A key made from your name and password locks everything before it leaves this device. The relay only sees noise.</span></li>
              <li>${icon('check', 16)}<span><b>No Aurora server.</b> Your devices hold your songs and copy them to each other: straight over Wi-Fi when they're on the same network.</span></li>
              <li>${icon('check', 16)}<span><b>Device off?</b> Songs from YouTube or SoundCloud download again from the source.</span></li>
              <li>${icon('warning', 16)}<span><b>No password reset.</b> Nobody (not even Aurora) can recover it, so keep it somewhere safe.</span></li>
            </ul>
          </div>
        </div>`;
      hydrateIcons(el);
      const form = $('.ac-form', el);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('.ac-err', el), btn = $('.ac-go', el);
        err.hidden = true;
        btn.disabled = true; btn.innerHTML = `<span class="fl-spin sm"></span> Unlocking…`;
        try {
          await Account.signIn($('.ac-name', el).value, $('.ac-pass', el).value);
          $('.ac-pass', el).value = '';
          UI.toast('Signed in to your Aurora Account');
        } catch (x) {
          err.textContent = (x && x.message) || String(x); err.hidden = false;
          btn.disabled = false; btn.innerHTML = `${icon('cloud', 16)} Sign in`;
        }
      };
      setTimeout(() => $('.ac-name', el) && $('.ac-name', el).focus(), 50);
    };

    const statusBtn = (s) => {
      const j = Account.job(s);
      if (FriendShare.haveLocal(s) || (j && j.status === 'done')) return `<button class="fl-btn have" data-act="play">${icon('check', 14)} On this device</button>`;
      if (j && ['requesting', 'receiving', 'saving', 'source'].includes(j.status)) {
        const pct = Math.round((j.progress || 0) * 100);
        const label = j.status === 'requesting' ? 'Asking…' : j.status === 'saving' ? 'Saving…' : `${pct}%`;
        return `<button class="fl-btn busy" disabled style="--p:${pct}%"><span class="fl-ring"></span>${label}</button>`;
      }
      if (j && j.status === 'error') return `<button class="fl-btn err" data-act="get" title="${esc(j.error || '')}">${icon('refresh', 14)} Retry</button>`;
      if (!s.online && !s.url) return `<button class="fl-btn" disabled title="Open Aurora on ${esc(s.deviceName)} to copy it">${icon('clock', 14)} Waiting</button>`;
      return `<button class="fl-btn" data-act="get">${icon('download', 14)} Download</button>`;
    };

    const signedInView = () => {
      const a = Account.info();
      el.innerHTML = `
        <div class="ac-hero">
          <div class="ac-hero-icon on">${icon('cloud', 54)}</div>
          <div class="ac-hero-text">
            <div class="coll-type">Aurora Account</div>
            <h1 class="coll-title ac-title">${esc(a.name)}</h1>
            <div class="coll-desc ac-status"></div>
            <div class="fl-hdr-actions">
              <button class="btn-outline sm ac-sync">${icon('refresh', 14)} Sync now</button>
              <button class="btn-outline sm ac-out">${icon('logout', 14)} Sign out</button>
            </div>
          </div>
        </div>
        <div class="ac-card">
          <h3>Your devices</h3>
          <div class="ac-devs"></div>
        </div>
        <div class="ac-card">
          <div class="ac-songs-head">
            <h3>Songs on your other devices</h3>
            <span class="fl-spacer"></span>
            <div class="find-input fl-search"><span data-icon="search" data-icon-size="16"></span><input placeholder="Search" /></div>
            <button class="btn-accent sm ac-all">${icon('download', 14)} Download all</button>
          </div>
          <label class="dc-opt"><span>Download new songs automatically<small>Anything you add on another device shows up here too.</small></span><input type="checkbox" class="toggle ac-auto" ${State.prefs().accountAutoGet ? 'checked' : ''} /></label>
          <div class="fl-list ac-list"></div>
        </div>
        <div class="view-footer"></div>`;
      hydrateIcons(el);
      $('.ac-sync', el).onclick = () => { Account.syncNow(); UI.toast('Syncing your account…'); };
      $('.ac-out', el).onclick = () => {
        const body = html(`<div><p>This device stops syncing. Your songs, playlists and Favorites stay here.</p><label class="dc-opt"><span>Also forget the synced copy on this device</span><input type="checkbox" class="toggle ac-forget" /></label></div>`);
        UI.modal({ title: 'Sign out of your Aurora Account?', body, width: 440, actions: [{ label: 'Sign out', primary: true, action: () => Account.signOut({ forget: $('.ac-forget', body).checked }) }] });
      };
      $('.ac-auto', el).onchange = (e) => Account.setAutoGet(e.target.checked);
      $('.fl-search input', el).addEventListener('input', debounce((e) => { q = e.target.value; limit = 150; drawSongs(); }, 150));
      $('.ac-all', el).onclick = () => {
        const todo = filtered().filter((s) => !FriendShare.haveLocal(s) && (s.online || s.url));
        if (!todo.length) return UI.toast('Nothing to download right now');
        UI.toast(`Downloading ${todo.length} song${todo.length === 1 ? '' : 's'} from your account`);
        Account.downloadAll(todo);
      };
      $('.ac-list', el).addEventListener('click', (e) => {
        const b = e.target.closest('.fl-btn');
        if (!b || b.disabled) return;
        const s = Account.otherSongs().find((x) => x.key === b.closest('.fl-row').dataset.k);
        if (!s) return;
        if (b.dataset.act === 'get') Account.download(s);
        else if (b.dataset.act === 'play') { const mine = FriendShare.haveLocal(s); if (mine) Player.playContext({ key: 'downloads', name: 'Downloads' }, [mine.id], 0); }
      });
      drawAll();
    };

    const filtered = () => {
      const qq = q.toLowerCase();
      return Account.otherSongs().filter((s) => !qq || `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(qq));
    };

    const drawStatus = () => {
      const box = $('.ac-status', el);
      if (!box) return;
      const st = Account.status;
      const devs = Account.deviceList();
      const label = st === 'synced' ? `<span class="fl-on">${icon('check', 13)} Synced</span>` : st === 'connecting' ? 'Connecting…' : 'Offline';
      box.innerHTML = `${label} · ${devs.length + 1} device${devs.length ? 's' : ''} · signed in ${esc(fmtDate(Account.info().signedInAt))}`;
    };

    const drawDevices = () => {
      const box = $('.ac-devs', el);
      if (!box) return;
      const me = { name: `This ${FriendShare.isPhone ? 'iPhone' : 'PC'}`, platform: FriendShare.isPhone ? 'ios' : 'pc', online: true, count: State.allTracks().length, self: true };
      box.innerHTML = [me, ...Account.deviceList()].map((d) => `
        <div class="ac-dev">
          <div class="ac-dev-ic ${d.online ? 'on' : ''}">${icon(d.platform === 'ios' ? 'phone' : 'laptop', 22)}</div>
          <div class="ac-dev-t"><b>${esc(d.name)}${d.self ? ' <span class="ac-you">YOU</span>' : ''}</b><span>${d.count} song${d.count === 1 ? '' : 's'} · ${d.online ? '<span class="fl-on">Online</span>' : d.seen ? 'Last seen ' + esc(fmtDate(d.seen)) : 'Offline'}</span></div>
        </div>`).join('') + (Account.deviceList().length ? '' : `<div class="ac-small">Sign in with the same account on your ${FriendShare.isPhone ? 'PC' : 'iPhone'} and it shows up here.</div>`);
    };

    const drawSongs = () => {
      const list = $('.ac-list', el);
      if (!list) return;
      const all = filtered();
      list.innerHTML = '';
      if (!Account.otherSongs().length) {
        list.appendChild(html(`<div class="dv-empty">${icon('check', 40)}<b>You're all caught up</b><span>Every song on your other devices is on this one too.</span></div>`));
        return;
      }
      if (!all.length) { list.appendChild(html('<div class="muted cp-empty">No matches.</div>')); return; }
      for (const s of all.slice(0, limit)) {
        list.appendChild(html(`<div class="fl-row" data-k="${esc(s.key)}">
          ${UI.coverHtml(genCover(s.title + s.artist, '', s.kind === 'video' ? 'video' : 'music'), 'tl-cover')}
          <div class="fl-text"><b>${esc(s.title)}${s.kind === 'video' ? '<span class="badge">VIDEO</span>' : ''}</b><span>${esc(s.artist)}${s.album ? ' · ' + esc(s.album) : ''}</span></div>
          <span class="fl-src">${esc(s.deviceName || '')}${s.online ? '' : ' (off)'}</span>
          <span class="fl-dur">${s.duration ? fmtTime(s.duration) : ''}</span>
          <span class="fl-act">${statusBtn(s)}</span>
        </div>`));
      }
      if (all.length > limit) {
        const more = html(`<button class="btn-outline sm fl-more">Show ${Math.min(150, all.length - limit)} more</button>`);
        more.onclick = () => { limit += 150; drawSongs(); };
        list.appendChild(more);
      }
    };
    const refreshButtons = () => {
      const byKey = new Map(Account.otherSongs().map((s) => [s.key, s]));
      $$('.ac-list .fl-row', el).forEach((row) => { const s = byKey.get(row.dataset.k); if (s) $('.fl-act', row).innerHTML = statusBtn(s); });
    };

    const drawAll = () => { drawStatus(); drawDevices(); drawSongs(); };

    let mode = null;
    const update = () => {
      const want = Account.signedIn() ? 'in' : 'out';
      if (want !== mode) { mode = want; lastSig = ''; if (want === 'in') signedInView(); else signInForm(); return; }
      if (mode !== 'in') return;
      const sig = Account.otherSongs().map((s) => s.key + (s.online ? 1 : 0)).join(',') + '|' + Account.deviceList().map((d) => d.id + d.online + d.count).join(',');
      drawStatus(); drawDevices();
      if (sig !== lastSig) { lastSig = sig; drawSongs(); } else refreshButtons();
    };
    const off1 = Account.onChange(update);
    const off2 = FriendShare.onChange(() => { if (mode === 'in') refreshButtons(); });
    const off3 = State.on('library', () => { if (mode === 'in') update(); });
    update();
    return () => { off1(); off2(); off3(); };
  },
};
