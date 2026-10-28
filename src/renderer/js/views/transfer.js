// "Transfer songs" window: copy or move downloaded songs from this profile to another one.
Views.transfer = {
  open(preselect = []) {
    const me = State.activeProfile();
    const others = State.profiles().filter((p) => p.id !== me.id);
    if (!others.length) {
      UI.modal({
        title: 'Transfer songs',
        body: `<div class="tr-empty">${icon('users', 40)}<p>You only have one profile. Add another profile first, then you can copy or move songs to it.</p></div>`,
        actions: [{ label: 'Not now' }, { label: 'Add profile', primary: true, action: () => { setTimeout(() => Views.profile.createModal(), 50); } }],
      });
      return;
    }
    const selected = new Set(preselect.filter((id) => State.track(id)));
    let target = others[0].id, mode = 'copy', filter = 'all';
    const who = (t) => {
      const o = State.ownersOf(t);
      if (!o) return 'Shared with everyone';
      const names = o.map((id) => (State.profiles().find((p) => p.id === id) || {}).name).filter(Boolean);
      return names.length > 1 ? names.join(', ') : 'Only you';
    };
    const body = html(`<div class="tr">
      <div class="tr-side">
        <div class="tr-step"><span>1</span>Send to</div>
        <div class="tr-targets">
          ${others.map((p) => `<button class="tr-target" data-id="${esc(p.id)}">${UI.avatarHtml(p, 40)}<b>${esc(p.name)}</b></button>`).join('')}
          <button class="tr-target" data-id="*"><span class="tr-all">${icon('users', 20)}</span><b>All profiles</b></button>
        </div>
        <div class="tr-step"><span>2</span>How</div>
        <div class="seg tr-mode"><button data-m="copy" class="on">Copy</button><button data-m="move">Move</button></div>
        <div class="tr-hint muted"></div>
      </div>
      <div class="tr-main">
        <div class="tr-step"><span>3</span>Pick songs <span class="tr-count muted"></span></div>
        <div class="tr-tools">
          <div class="find-input"><span data-icon="search" data-icon-size="16"></span><input class="tr-q" placeholder="Filter your songs" /></div>
          <div class="seg tr-kind"><button data-k="all" class="on">All</button><button data-k="audio">Music</button><button data-k="video">Videos</button></div>
          <button class="chip tr-selall">Select all</button>
        </div>
        <div class="cp-list tr-list scroll"></div>
      </div>
    </div>`);
    const list = $('.tr-list', body);
    const hint = () => {
      const name = target === '*' ? 'every profile' : esc((others.find((p) => p.id === target) || {}).name);
      $('.tr-hint', body).innerHTML = target === '*'
        ? 'The songs become <b>shared</b>: every profile on this device can play them.'
        : mode === 'copy'
          ? `<b>${name}</b> gets the songs too. You keep them.`
          : `The songs go to <b>${name}</b> and leave your library. Files aren't duplicated, so this doesn't use extra space.`;
      $$('.tr-target', body).forEach((b) => b.classList.toggle('on', b.dataset.id === target));
      $('.tr-mode', body).hidden = target === '*';
      const go = $('.tr-go', body.closest('.modal') || document);
      if (go) go.textContent = `${target === '*' ? 'Share' : mode === 'copy' ? 'Copy' : 'Move'} ${selected.size || ''} song${selected.size === 1 ? '' : 's'}`.replace('  ', ' ');
    };
    const count = () => { $('.tr-count', body).textContent = selected.size ? `· ${selected.size} selected` : ''; hint(); };
    const rows = () => {
      const q = $('.tr-q', body).value.toLowerCase().trim();
      return State.allTracks()
        .filter((t) => filter === 'all' || (filter === 'video' ? t.kind === 'video' : t.kind !== 'video'))
        .filter((t) => !q || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q))
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    };
    const draw = () => {
      const ts = rows();
      list.innerHTML = '';
      if (!ts.length) { list.appendChild(html(`<div class="muted cp-empty">${State.allTracks().length ? 'No matches.' : 'This profile has no songs yet.'}</div>`)); return; }
      for (const t of ts.slice(0, 500)) {
        const on = selected.has(t.id);
        const row = html(`<label class="cp-row ${on ? 'on' : ''}"><input type="checkbox" ${on ? 'checked' : ''} />${UI.coverHtml(UI.coverSrc(t), 'tl-cover')}<span class="cp-t"><b>${esc(t.title)}</b><small>${esc(t.artist)}${t.kind === 'video' ? ' · Video' : ''}</small></span><span class="tr-who">${esc(who(t))}</span></label>`);
        $('input', row).onchange = (e) => { e.target.checked ? selected.add(t.id) : selected.delete(t.id); row.classList.toggle('on', e.target.checked); count(); };
        list.appendChild(row);
      }
    };
    $$('.tr-target', body).forEach((b) => b.onclick = () => { target = b.dataset.id; hint(); });
    $$('.tr-mode button', body).forEach((b) => b.onclick = () => { mode = b.dataset.m; $$('.tr-mode button', body).forEach((x) => x.classList.toggle('on', x === b)); hint(); });
    $$('.tr-kind button', body).forEach((b) => b.onclick = () => { filter = b.dataset.k; $$('.tr-kind button', body).forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    $('.tr-q', body).addEventListener('input', debounce(draw, 120));
    $('.tr-selall', body).onclick = () => {
      const ts = rows();
      const all = ts.every((t) => selected.has(t.id));
      ts.forEach((t) => (all ? selected.delete(t.id) : selected.add(t.id)));
      draw(); count();
    };
    draw();
    UI.modal({
      title: 'Transfer songs', body, width: 900,
      actions: [
        { label: 'Cancel' },
        { label: 'Copy', primary: true, action: () => {
          if (!selected.size) { UI.toast('Pick at least one song'); return false; }
          const n = State.transferTracks([...selected], target, mode);
          const name = target === '*' ? 'every profile' : (others.find((p) => p.id === target) || {}).name;
          UI.toast(target === '*' ? `${n} song${n === 1 ? '' : 's'} shared with every profile` : `${mode === 'copy' ? 'Copied' : 'Moved'} ${n} song${n === 1 ? '' : 's'} to ${name}`, 4000);
        } },
      ],
    });
    const btns = $$('.modal-actions button');
    if (btns.length) { btns[btns.length - 1].classList.add('tr-go'); }
    count();
  },
};
