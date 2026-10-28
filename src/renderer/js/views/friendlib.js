// A friend's library: browse their songs and download any of them.
Views.friendlib = {
  render(root, code) {
    const f = Friends.friendByCode(code);
    if (!f) { root.appendChild(html(`<div class="dv-empty">${icon('users', 48)}<b>Not on your friends list</b><span>Add their friend code on the Friends page first.</span></div>`)); return; }
    App.setHeaderColor('rgba(139, 123, 255, .38)');
    let q = '', kind = 'all', limit = 200;
    const el = html(`<div class="fl-page">
      <div class="coll-header fl-header"></div>
      <div class="fl-tools">
        <div class="find-input fl-search"><span data-icon="search" data-icon-size="16"></span><input placeholder="Search their songs" /></div>
        <div class="seg fl-kind"><button data-k="all" class="on">All</button><button data-k="audio">Music</button><button data-k="video">Videos</button></div>
        <span class="fl-spacer"></span>
        <button class="btn-outline sm fl-refresh">${icon('refresh', 14)} Refresh</button>
        <button class="btn-accent sm fl-all">${icon('download', 14)} Download all</button>
      </div>
      <div class="fl-note"></div>
      <div class="fl-list"></div>
      <div class="view-footer"></div>
    </div>`);
    root.appendChild(el);
    hydrateIcons(el);

    const name = () => f.nickname || Friends.statusOf(code).name || f.code;
    const items = () => {
      const l = FriendShare.library(code);
      const all = (l && l.items) || [];
      const qq = q.toLowerCase();
      return all.filter((t) => (kind === 'all' || (kind === 'video' ? t.kind === 'video' : t.kind !== 'video')) && (!qq || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(qq)));
    };

    const drawHeader = () => {
      const p = Friends.statusOf(code);
      const l = FriendShare.library(code) || {};
      const n = (l.items || []).length;
      const online = p.status && !['offline', 'unknown'].includes(p.status);
      const av = p.avatar ? `<img src="${esc(p.avatar)}" />` : esc((name()[0] || '?').toUpperCase());
      $('.fl-header', el).innerHTML = `
        <div class="fl-av" style="background:${esc(p.color || '#8b7bff')}">${av}<span class="fr-status-dot ${esc(p.status || 'unknown')}"></span></div>
        <div class="coll-meta">
          <div class="coll-type">${icon('library', 14)} Friend's library</div>
          <h1 class="coll-title">${esc(name())}</h1>
          <div class="coll-desc">${n ? `${n} song${n === 1 ? '' : 's'}` : ''}${l.at ? ` · updated ${esc(fmtDate(l.at))}` : ''}${online ? ' · <span class="fl-on">Online</span>' : ' · Offline'}</div>
          <div class="fl-hdr-actions"><button class="btn-outline sm fl-prof">${icon('user', 14)} View profile</button></div>
        </div>`;
      $('.fl-prof', el).onclick = () => Views.profile.friendModal(f, Friends.statusOf(code));
    };

    const note = () => {
      const l = FriendShare.library(code) || {};
      const box = $('.fl-note', el);
      const msg = {
        loading: l.items && l.items.length ? `${icon('refresh', 14)} Getting the latest from ${esc(name())}…` : '',
        offline: l.items && l.items.length ? `${icon('clock', 14)} ${esc(name())} isn't online, so this is the list from last time. Songs can still be downloaded from YouTube or SoundCloud${FriendShare.isPhone ? ' on Aurora for PC' : ''}; others need them online.` : '',
        off: `${esc(name())} has turned off library sharing.`,
        error: esc(l.error || "Couldn't load their library."),
      }[l.state] || '';
      box.innerHTML = msg;
      box.hidden = !msg;
    };

    const statusBtn = (t) => {
      const mine = FriendShare.haveLocal(t);
      const j = FriendShare.job(code, t.id);
      if (mine || (j && j.status === 'done')) return `<button class="fl-btn have" data-act="play" title="In your library: play">${icon('check', 14)} In library</button>`;
      if (j && ['requesting', 'receiving', 'saving', 'source'].includes(j.status)) {
        const pct = Math.round((j.progress || 0) * 100);
        const label = j.status === 'requesting' ? 'Asking…' : j.status === 'saving' ? 'Saving…' : `${pct}%`;
        return `<button class="fl-btn busy" data-act="cancel" title="Cancel" style="--p:${pct}%"><span class="fl-ring"></span>${label}</button>`;
      }
      if (j && j.status === 'error') return `<button class="fl-btn err" data-act="get" title="${esc(j.error || '')}">${icon('refresh', 14)} Retry</button>`;
      return `<button class="fl-btn" data-act="get">${icon('download', 14)} Download</button>`;
    };

    const drawList = () => {
      drawHeader();
      note();
      const list = $('.fl-list', el);
      const l = FriendShare.library(code) || {};
      const its = items();
      list.innerHTML = '';
      if (!(l.items || []).length) {
        list.appendChild(html(l.state === 'loading'
          ? `<div class="dv-empty"><div class="fl-spin"></div><b>Asking ${esc(name())} for their library…</b><span>They need Aurora open and your friend code on their friends list.</span></div>`
          : l.state === 'off' ? `<div class="dv-empty">${icon('library', 48)}<b>Library sharing is off</b><span>${esc(name())} chose not to share their songs.</span></div>`
            : `<div class="dv-empty">${icon('library', 48)}<b>${l.state === 'error' ? esc(l.error || "Couldn't load their library") : `${esc(name())} isn't online`}</b><span>${l.state === 'error' ? '' : 'Their library shows up when they have Aurora open. Both of you need each other\'s friend code.'}</span><button class="btn-accent sm fl-retry">${icon('refresh', 14)} Try again</button></div>`));
        const r = $('.fl-retry', list); if (r) r.onclick = () => FriendShare.fetchLibrary(code);
        return;
      }
      if (!its.length) { list.appendChild(html('<div class="muted cp-empty">No matches.</div>')); return; }
      for (const t of its.slice(0, limit)) {
        const row = html(`<div class="fl-row" data-id="${esc(t.id)}">
          ${UI.coverHtml(genCover(t.title + t.artist, '', t.kind === 'video' ? 'video' : 'music'), 'tl-cover')}
          <div class="fl-text"><b>${esc(t.title)}${t.kind === 'video' ? '<span class="badge">VIDEO</span>' : ''}</b><span>${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</span></div>
          <span class="fl-src">${t.source && t.source !== 'local' ? esc(t.source) : 'Local file'}</span>
          <span class="fl-dur">${t.duration ? fmtTime(t.duration) : ''}</span>
          <span class="fl-act">${statusBtn(t)}</span>
        </div>`);
        list.appendChild(row);
      }
      if (its.length > limit) {
        const more = html(`<button class="btn-outline sm fl-more">Show ${Math.min(200, its.length - limit)} more</button>`);
        more.onclick = () => { limit += 200; drawList(); };
        list.appendChild(more);
      }
    };

    // one click handler for every row button
    $('.fl-list', el).addEventListener('click', (e) => {
      const b = e.target.closest('.fl-btn');
      if (!b) return;
      const id = b.closest('.fl-row').dataset.id;
      const t = ((FriendShare.library(code) || {}).items || []).find((x) => x.id === id);
      if (!t) return;
      if (b.dataset.act === 'get') FriendShare.download(code, t);
      else if (b.dataset.act === 'cancel') FriendShare.cancel(code, t.id);
      else if (b.dataset.act === 'play') { const mine = FriendShare.haveLocal(t); if (mine) Player.playContext({ key: 'downloads', name: 'Downloads' }, [mine.id], 0); }
    });
    // only redraw the buttons on progress, so scrolling and typing aren't disturbed
    const refreshButtons = () => {
      const all = (FriendShare.library(code) || {}).items || [];
      const byId = new Map(all.map((t) => [t.id, t]));
      $$('.fl-row', el).forEach((row) => { const t = byId.get(row.dataset.id); if (t) $('.fl-act', row).innerHTML = statusBtn(t); });
    };

    $('.fl-search input', el).addEventListener('input', debounce((e) => { q = e.target.value; limit = 200; drawList(); }, 150));
    $$('.fl-kind button', el).forEach((b) => b.onclick = () => { kind = b.dataset.k; $$('.fl-kind button', el).forEach((x) => x.classList.toggle('on', x === b)); drawList(); });
    $('.fl-refresh', el).onclick = () => FriendShare.fetchLibrary(code);
    $('.fl-all', el).onclick = () => {
      const todo = items().filter((t) => !FriendShare.haveLocal(t));
      if (!todo.length) return UI.toast('You already have all of these');
      UI.toast(`Downloading ${todo.length} song${todo.length === 1 ? '' : 's'} from ${name()}`);
      FriendShare.downloadAll(code, todo);
    };

    let lastState = null;
    const off = FriendShare.onChange(() => {
      const l = FriendShare.library(code) || {};
      const sig = l.state + ':' + (l.items || []).length + ':' + l.at;
      if (sig !== lastState) { lastState = sig; drawList(); } else refreshButtons();
    });
    const off2 = State.on('library', refreshButtons);
    drawList();
    // show the cached list instantly, then ask for the latest
    FriendShare.loadCache(code).then(() => FriendShare.fetchLibrary(code));
    return () => { off(); off2(); };
  },
};
