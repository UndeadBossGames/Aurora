// Identify a song: tap, let Aurora listen for 10 seconds, see what it is, download it.
Views.identify = {
  live: false,
  render(root) {
    App.setHeaderColor('rgba(30, 215, 96, .28)');
    const el = html(`<div class="id-page">
      <div class="id-stage">
        <div class="id-title"><h1>Identify a song</h1><p class="id-sub"></p></div>
        <div class="id-source seg" hidden><button data-s="mic">${icon('speaker', 14)} Microphone</button><button data-s="system">${icon('laptop', 14)} This PC's sound</button></div>
        <button class="id-orb" aria-label="Identify">
          <span class="id-ring r1"></span><span class="id-ring r2"></span><span class="id-ring r3"></span>
          <span class="id-core">${icon('aurora', 96)}</span>
          <svg class="id-prog" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" /></svg>
        </button>
        <div class="id-status"></div>
        <div class="id-result"></div>
      </div>
      <section class="id-history"><div class="id-h-head"><h2>Your identified songs</h2></div><div class="id-list"></div></section>
    </div>`);
    root.appendChild(el);
    hydrateIcons(el);
    const S = Identify.state;
    const src = $('.id-source', el);
    if (Identify.canSystem()) {
      src.hidden = false;
      $$('button', src).forEach((b) => b.onclick = () => { S.source = b.dataset.s; draw(); });
    } else S.source = 'mic';
    $('.id-orb', el).onclick = () => {
      if (S.phase === 'listening') return Identify.stop();
      if (S.phase === 'thinking') return;
      Identify.start(S.source);
    };

    const resultCard = (r) => {
      const have = Identify.inLibrary(r);
      const card = html(`<div class="id-card">
        <div class="id-art">${r.art ? `<img src="${esc(r.art)}" />` : `<img src="${esc(genCover(r.title + r.artist, '', 'music'))}" />`}</div>
        <div class="id-meta"><small>${have ? 'In your library' : 'Found it'}</small><b>${esc(r.title)}</b><span>${esc(r.artist)}</span>${r.album ? `<em>${esc(r.album)}${r.year ? ' • ' + esc(r.year) : ''}</em>` : ''}</div>
        <div class="id-btns">
          ${have ? `<button class="btn-accent sm id-play">${icon('play', 14)} Play</button>` : ''}
          <button class="${have ? 'btn-outline' : 'btn-accent'} sm id-song">${icon('music', 14)} Download song</button>
          <button class="btn-outline sm id-video">${icon('video', 14)} Download video</button>
          <button class="btn-outline sm id-more">${icon('search', 14)} More results</button>
          ${r.link ? `<button class="btn-outline sm id-link">${icon('external', 14)} Listen on…</button>` : ''}
        </div>
      </div>`);
      const p = $('.id-play', card); if (p) p.onclick = () => Player.playContext({ key: 'identify', name: 'Identified' }, [have.id], 0);
      $('.id-song', card).onclick = () => Identify.download(r, 'song').catch((e) => UI.toast(e.message));
      $('.id-video', card).onclick = () => Identify.download(r, 'video').catch((e) => UI.toast(e.message));
      $('.id-more', card).onclick = () => App.go('discover', `${r.artist} ${r.title}`);
      const l = $('.id-link', card); if (l) l.onclick = () => native.shell.openExternal(r.link);
      return card;
    };

    const drawHistory = () => {
      const list = $('.id-list', el);
      const h = Identify.history();
      list.innerHTML = '';
      $('.id-history', el).hidden = !h.length;
      for (const r of h) {
        const have = Identify.inLibrary(r);
        const row = html(`<div class="id-row">
          <img src="${esc(r.art || genCover(r.title + r.artist, '', 'music'))}" />
          <div class="id-row-t"><b>${esc(r.title)}</b><span>${esc(r.artist)} • ${esc(fmtDate(r.at))}</span></div>
          ${have ? `<button class="icon-btn small id-r-play" title="Play">${icon('play', 18)}</button>` : `<button class="icon-btn small id-r-dl" title="Download">${icon('download', 18)}</button>`}
          <button class="icon-btn small id-r-more" title="More">${icon('dotsH', 18)}</button>
        </div>`);
        const play = $('.id-r-play', row); if (play) play.onclick = () => Player.playContext({ key: 'identify', name: 'Identified' }, [have.id], 0);
        const dl = $('.id-r-dl', row);
        const menu = (x, y) => UI.menu([
          { label: 'Download song', icon: 'music', action: () => Identify.download(r, 'song') },
          { label: 'Download video', icon: 'video', action: () => Identify.download(r, 'video') },
          { label: 'Search for more results', icon: 'search', action: () => App.go('discover', `${r.artist} ${r.title}`) },
          r.link ? { label: 'Listen on another service', icon: 'external', action: () => native.shell.openExternal(r.link) } : null,
          { divider: true },
          { label: 'Remove from this list', icon: 'trash', action: () => Identify.removeFromHistory(r) },
        ].filter(Boolean), x, y);
        if (dl) dl.onclick = (e) => { const b = e.currentTarget.getBoundingClientRect(); menu(b.left, b.bottom); };
        $('.id-r-more', row).onclick = (e) => { const b = e.currentTarget.getBoundingClientRect(); menu(b.left, b.bottom); };
        row.oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, e.clientY); };
        list.appendChild(row);
      }
    };

    const draw = () => {
      const st = $('.id-status', el), res = $('.id-result', el), orb = $('.id-orb', el);
      el.dataset.phase = S.phase;
      $$('button', src).forEach((b) => b.classList.toggle('on', b.dataset.s === S.source));
      $('.id-sub', el).textContent = S.source === 'system' ? 'Plays on this PC? Aurora listens to your computer\'s sound.' : 'Hold your device near the music. Aurora listens for 10 seconds.';
      orb.style.setProperty('--lv', S.phase === 'listening' ? S.level.toFixed(3) : 0);
      orb.style.setProperty('--pg', S.phase === 'listening' ? S.progress : 0);
      st.innerHTML = {
        idle: '<b>Tap to identify</b>',
        listening: '<b>Listening…</b><span>Tap again to stop early</span>',
        thinking: '<b>Finding the song…</b>',
        found: '',
        nomatch: `<b>No match</b><span>Try again closer to the music, or when the song is louder.</span>`,
        error: `<b>Couldn't identify</b><span>${esc(S.error)}</span>${S.needKey ? '<button class="btn-outline sm id-key">Add a free key</button>' : ''}`,
      }[S.phase] || '';
      const k = $('.id-key', st); if (k) k.onclick = keyModal;
      res.innerHTML = '';
      if (S.phase === 'found' && S.result) res.appendChild(resultCard(S.result));
      drawHistory();
    };
    let lastPhase = null;
    const off = Identify.onChange(() => {
      if (S.phase !== lastPhase) { lastPhase = S.phase; draw(); return; }
      const orb = $('.id-orb', el);
      orb.style.setProperty('--lv', S.phase === 'listening' ? S.level.toFixed(3) : 0);
      orb.style.setProperty('--pg', S.phase === 'listening' ? S.progress : 0);
    });
    if (['found', 'nomatch', 'error'].includes(S.phase)) Identify.reset();
    draw();
    return () => off();
  },
};

// the recognition key (AudD): free to get, 300 identifications included
function keyModal() {
  const body = html(`<div class="form">
    <p class="muted">Song recognition uses AudD. A few tries work without a key; for more, create a free AudD account (300 free identifications, no card) and paste your API token here.</p>
    <label>API token<input class="input id-key-in" spellcheck="false" placeholder="Paste your AudD API token" value="${esc(State.settings().auddToken || '')}" /></label>
    <button class="btn-outline sm id-get">${icon('external', 14)} Get a free token at dashboard.audd.io</button>
  </div>`);
  $('.id-get', body).onclick = () => native.shell.openExternal('https://dashboard.audd.io/signup');
  UI.modal({ title: 'Song recognition key', body, width: 460, actions: [{ label: 'Save', primary: true, action: () => { State.setSetting('auddToken', $('.id-key-in', body).value.trim()); UI.toast('Saved'); } }] });
}
