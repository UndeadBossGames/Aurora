// Friends page: your friend code, add friends, and live "what are they listening to"
Views.friends = {
  live: false,
  render(root) {
    App.setHeaderColor('rgba(45, 226, 201, .35)');
    const el = html(`<div class="fr-page">
      <div class="coll-header fr-header">
        <div class="fr-hero">${icon('users', 100)}</div>
        <div class="coll-meta">
          <div class="coll-type">Social</div>
          <h1 class="coll-title">Friends</h1>
          <div class="coll-desc">Add your friends with their Aurora friend code and see what they're listening to, live.</div>
        </div>
      </div>
      <div class="fr-top">
        <div class="dc-card fr-code-card"></div>
        <div class="dc-card fr-add-card">
          <h3>Add a friend</h3>
          <div class="fr-add-row"><input class="input fr-code-in" placeholder="AUR-XXXX-XXXX" spellcheck="false" maxlength="20" /><input class="input fr-nick-in" placeholder="Nickname (optional)" maxlength="40" /><button class="btn-accent sm fr-add">${icon('plus', 14)} Add</button></div>
          <div class="dc-msg">Ask your friend for the code on their Friends page. They'll see you too once they add your code.</div>
        </div>
      </div>
      <div class="fr-list-head"><h2 class="shelf-title">Friend activity</h2><span class="fr-conn"></span></div>
      <div class="fr-list"></div>
      <div class="view-footer"></div>
    </div>`);
    root.appendChild(el);

    const drawCode = () => {
      const card = $('.fr-code-card', el);
      const code = Friends.myCode();
      card.innerHTML = `
        <h3>Your friend code</h3>
        <div class="fr-code"><span>${esc(code)}</span><button class="btn-outline sm fr-copy">${icon('paste', 14)} Copy</button></div>
        <label class="dc-opt"><span>Share what I'm listening to<small>Friends who have your code can see your current song.</small></span><input type="checkbox" class="toggle fr-share" ${Friends.sharing() ? 'checked' : ''} /></label>`;
      $('.fr-copy', card).onclick = async () => { try { await navigator.clipboard.writeText(code); UI.toast('Friend code copied'); } catch { UI.toast(code); } };
      $('.fr-share', card).onchange = (e) => { Friends.setSharing(e.target.checked); UI.toast(e.target.checked ? 'Sharing your listening activity' : 'Your activity is now hidden'); };
    };

    const add = () => {
      const c = $('.fr-code-in', el), n = $('.fr-nick-in', el);
      try {
        const pc = Friends.addFriend(c.value, n.value);
        c.value = ''; n.value = '';
        UI.toast(`Added ${pc}`);
      } catch (e) { UI.toast(e.message, 4500); }
    };
    $('.fr-add', el).onclick = add;
    $('.fr-code-in', el).addEventListener('keydown', (e) => e.key === 'Enter' && add());
    $('.fr-nick-in', el).addEventListener('keydown', (e) => e.key === 'Enter' && add());

    const drawList = () => {
      const conn = $('.fr-conn', el);
      if (conn) conn.innerHTML = `<span class="dc-dot ${Friends.state === 'connected' ? 'connected' : Friends.state === 'connecting' ? 'connecting' : 'error'}"></span>${Friends.state === 'connected' ? 'Live' : Friends.state === 'connecting' ? 'Connecting…' : 'Offline, retrying…'}`;
      const list = $('.fr-list', el);
      if (!list) return;
      const fr = Friends.friends();
      list.innerHTML = '';
      if (!fr.length) {
        list.appendChild(html(`<div class="dv-empty">${icon('users', 48)}<b>No friends yet</b><span>Share your code above, or paste a friend's code to add them.</span></div>`));
        return;
      }
      const order = { listening: 0, paused: 1, online: 2, offline: 3, unknown: 4 };
      const rows = fr.map((f) => ({ f, p: Friends.statusOf(f.code) })).sort((a, b) => order[a.p.status] - order[b.p.status]);
      for (const { f, p } of rows) {
        const name = f.nickname || p.name || f.code;
        const t = p.track;
        const live = p.status === 'listening' || p.status === 'paused';
        const ago = p.ts ? fmtDate(p.ts) : '';
        const statusText = {
          listening: 'Listening now', paused: 'Paused', online: 'Online', offline: ago ? `Last seen ${ago}` : 'Offline', unknown: 'Waiting for their first update…',
        }[p.status] || '';
        let pos = 0;
        if (t && t.duration) pos = Math.min(t.duration, (t.position || 0) + (p.status === 'listening' ? (Date.now() - p.ts) / 1000 : 0));
        const av = p.avatar ? `<img src="${esc(p.avatar)}" />` : esc((name || '?')[0].toUpperCase());
        const card = html(`<div class="fr-card ${p.status}">
          <div class="fr-av" style="background:${esc(p.color || '#8b7bff')}">${av}<span class="fr-status-dot ${p.status}"></span></div>
          <div class="fr-main">
            <div class="fr-name">${esc(name)}${f.nickname && p.name && p.name !== f.nickname ? ` <small>(${esc(p.name)})</small>` : ''}</div>
            <div class="fr-state">${p.status === 'listening' ? `<span class="eq on"><i></i><i></i><i></i></span>` : ''}${esc(statusText)}</div>
            ${live && t ? `<div class="fr-track">
              <img class="fr-art" src="${esc(t.cover || genCover(t.title + t.artist, '', t.kind === 'video' ? 'video' : 'music'))}" onerror="this.src='${genCover('x')}'" />
              <div class="fr-tt"><b>${esc(t.title)}</b><span>${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</span>
                ${t.duration ? `<div class="fr-prog"><div style="width:${(pos / t.duration) * 100}%"></div></div>` : ''}
              </div>
            </div>` : ''}
          </div>
          <div class="fr-actions">
            ${live && t ? `<button class="btn-accent sm fr-find">${icon('search', 14)} Find it</button>` : ''}
            ${live && t && t.url ? `<button class="icon-btn small fr-open" title="Open on ${esc(t.source || 'web')}">${icon('external', 16)}</button>` : ''}
            <button class="icon-btn small fr-more" title="More">${icon('dotsH', 18)}</button>
          </div>
        </div>`);
        const find = $('.fr-find', card);
        if (find) find.onclick = () => App.go('discover', `${t.artist && t.artist !== 'Unknown artist' ? t.artist + ' ' : ''}${t.title}`);
        const open = $('.fr-open', card);
        if (open) open.onclick = () => native.shell.openExternal(t.url);
        $('.fr-more', card).onclick = (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          UI.menu([
            { header: f.code },
            { label: 'Rename', icon: 'edit', action: () => {
              const body = html(`<div class="form"><label>Nickname<input class="input" value="${esc(f.nickname || '')}" maxlength="40" /></label></div>`);
              UI.modal({ title: 'Rename friend', body, width: 420, actions: [{ label: 'Save', primary: true, action: () => Friends.renameFriend(f.code, $('input', body).value) }] });
            } },
            { label: 'Copy friend code', icon: 'paste', action: () => navigator.clipboard.writeText(f.code).then(() => UI.toast('Copied')) },
            { divider: true },
            { label: 'Remove friend', icon: 'trash', danger: true, action: () => { Friends.removeFriend(f.code); UI.toast('Friend removed'); } },
          ], r.right, r.bottom + 4, { alignRight: true, minWidth: 190 });
        };
        list.appendChild(card);
      }
    };

    drawCode();
    drawList();
    const off = Friends.onChange(() => { drawList(); });
    const tick = setInterval(drawList, 5000);
    return () => { off(); clearInterval(tick); };
  },
};
