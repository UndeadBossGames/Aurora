// Discover: search YouTube / SoundCloud, preview a result, then download it.
const Discover = { cache: new Map(), jobsByUrl: new Map(), bound: false };

const DISCOVER_IDEAS = ['lofi hip hop', 'top hits 2026', 'chill r&b', 'workout mix', 'video game soundtracks', 'acoustic covers', 'synthwave', 'live concert'];

function discoverBind() {
  if (Discover.bound) return;
  Discover.bound = true;
  native.dl.onJob((j) => {
    const url = j.displayUrl || j.url;
    if (!Discover.jobsByUrl.has(url)) return;
    Discover.jobsByUrl.set(url, j);
    $$(`.dv-card[data-url="${CSS.escape(url)}"]`).forEach((c) => discoverCardState(c, j));
    const pv = $(`.dv-preview[data-url="${CSS.escape(url)}"]`);
    if (pv) discoverPreviewState(pv, j);
  });
}

function discoverStateLabel(j) {
  if (!j) return null;
  if (j.status === 'done') return { cls: 'done', text: 'Downloaded' };
  if (j.status === 'error') return { cls: 'error', text: 'Failed - try again' };
  if (j.status === 'cancelled') return null;
  return { cls: 'busy', text: j.progress ? `Downloading ${Math.round(j.progress)}%` : 'Starting…' };
}

function discoverCardState(card, j) {
  const st = discoverStateLabel(j);
  const tag = $('.dv-state', card);
  tag.className = 'dv-state ' + (st ? st.cls : '');
  tag.textContent = st ? st.text : '';
  const bar = $('.dv-bar > div', card);
  if (bar) bar.style.width = (j && j.status === 'downloading' ? j.progress : j && j.status === 'done' ? 100 : 0) + '%';
}

function discoverPreviewState(pv, j) {
  const st = discoverStateLabel(j);
  const btn = $('.dv-dl-btn', pv);
  if (!btn) return;
  if (j && j.status === 'done' && j.files && j.files[0]) {
    btn.textContent = 'Play in Aurora';
    btn.onclick = () => { UI.closeModal(); const ids = j.files.map((f) => f.id); if (!State.track(ids[0])) State.addTracks(j.files); Player.playContext({ key: 'downloads', name: 'Downloads' }, ids, 0); };
  } else if (st && st.cls === 'busy') {
    btn.textContent = st.text;
    btn.disabled = true;
  }
}

async function discoverDownload(r, format) {
  discoverBind();
  try {
    const jobs = await native.dl.add({ url: r.url, format, dir: State.settings().downloadDir, playlist: false, addToLibrary: State.settings().dlAddToLibrary !== false });
    jobs.forEach((j) => { Discover.jobsByUrl.set(r.url, j); $$(`.dv-card[data-url="${CSS.escape(r.url)}"]`).forEach((c) => discoverCardState(c, j)); });
    UI.toast(`Downloading "${r.title}"`);
  } catch (e) {
    UI.toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 5000);
  }
}


function discoverPreview(r) {
  if (Player.playing) Player.toggle();
  const yt = r.source === 'YouTube';
  const embed = yt
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.id)}?autoplay=1&rel=0&modestbranding=1`
    : `https://w.soundcloud.com/player/?url=${encodeURIComponent(r.url)}&auto_play=true&visual=true`;
  const def = r.source === 'SoundCloud' ? 'audio-mp3' : State.settings().dlFormat || 'video-best';
  const body = html(`<div class="dv-preview" data-url="${esc(r.url)}">
    <div class="dv-frame ${yt ? '' : 'sc'}"><iframe src="${esc(embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
    <div class="dv-pv-info">
      <div class="dv-pv-text">
        <div class="dv-pv-title">${esc(r.title)}</div>
        <div class="dv-pv-sub">${esc(r.channel || r.source)}${r.duration ? ` · ${fmtTime(r.duration)}` : ''}${r.views ? ` · ${fmtViews(r.views)} views` : ''}</div>
      </div>
    </div>
    <div class="dv-pv-actions">
      <div class="dl-select"><select class="dv-fmt">${dlFormats().map(([k, l]) => `<option value="${k}" ${k === def ? 'selected' : ''}>${l}</option>`).join('')}</select><span data-icon="chevronDown" data-icon-size="16"></span></div>
      <button class="btn-accent dv-dl-btn">${icon('download', 18)} Download</button>
      <button class="btn-outline sm dv-open">${icon('external', 14)} Open on ${esc(r.source)}</button>
    </div>
    <div class="dv-pv-note muted">The preview plays from ${esc(r.source)}. If it won't load, use "Open on ${esc(r.source)}", or just download it.</div>
  </div>`);
  $('.dv-dl-btn', body).onclick = () => discoverDownload(r, $('.dv-fmt', body).value);
  $('.dv-open', body).onclick = () => native.shell.openExternal(r.url);
  UI.modal({ title: 'Preview', body, width: 820, onClose: () => { const f = $('iframe', body); if (f) f.src = 'about:blank'; } });
  const j = Discover.jobsByUrl.get(r.url);
  if (j) discoverPreviewState(body, j);
}

function fmtViews(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
}

// Search box used both on Home and on the Discover page
function discoverSearchBox({ query = '', big = false } = {}) {
  const src = State.prefs().discoverSource || 'youtube';
  const el = html(`<div class="dv-box ${big ? 'big' : ''}">
    <div class="dv-input"><span data-icon="search" data-icon-size="20"></span><input placeholder="Search YouTube or SoundCloud for any song or video…" value="${esc(query)}" spellcheck="false" /><button class="btn-accent dv-go">Search</button></div>
    <div class="dv-sources">
      <div class="seg"><button data-s="youtube" class="${src === 'youtube' ? 'on' : ''}">YouTube</button><button data-s="soundcloud" class="${src === 'soundcloud' ? 'on' : ''}">SoundCloud</button></div>
      <div class="dv-ideas"></div>
    </div>
  </div>`);
  const input = $('input', el);
  const history = (State.prefs().discoverHistory || []).slice(0, 5);
  const ideas = $('.dv-ideas', el);
  (history.length ? history : DISCOVER_IDEAS.slice(0, 6)).forEach((q) => {
    const c = html(`<button class="chip">${history.length ? icon('clock', 12) + ' ' : ''}${esc(q)}</button>`);
    c.onclick = () => App.go('discover', q);
    ideas.appendChild(c);
  });
  $$('.seg button', el).forEach((b) => b.onclick = () => {
    State.setPref('discoverSource', b.dataset.s);
    $$('.seg button', el).forEach((x) => x.classList.toggle('on', x === b));
    if (App.current.view === 'discover' && input.value.trim()) App.render();
  });
  const go = () => {
    const q = input.value.trim();
    if (!q) return input.focus();
    if (isUrl(q)) return App.go('downloader', q);
    App.go('discover', q, { replace: App.current.view === 'discover' });
  };
  $('.dv-go', el).onclick = go;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  return el;
}

Views.discover = {
  live: false,
  render(root, query) {
    discoverBind();
    const q = String(query || '').trim();
    const source = State.prefs().discoverSource || 'youtube';
    App.setHeaderColor('rgba(139, 123, 255, .45)');
    root.appendChild(html(`<div class="dv-head"><div class="coll-type">Discover</div><h1 class="dv-title">Find it. Watch it. Keep it.</h1><div class="coll-desc">Search ${source === 'soundcloud' ? 'SoundCloud' : 'YouTube'}, preview right here, then download straight into your library.</div></div>`));
    const box = discoverSearchBox({ query: q, big: true });
    root.appendChild(box);
    setTimeout(() => { const i = $('input', box); if (i && !q) i.focus(); }, 30);
    const results = html('<div class="dv-results"></div>');
    root.appendChild(results);

    if (!q) {
      results.appendChild(html(`<div class="dv-empty">${icon('sparkle', 48)}<b>What do you want to find?</b><span>Try an artist, a song, a podcast, a trailer, anything.</span></div>`));
      const ideas = html('<div class="dv-idea-grid"></div>');
      DISCOVER_IDEAS.forEach((idea, i) => {
        const t = html(`<button class="dv-idea" style="--c:${PALETTE[(i * 3) % PALETTE.length]}">${esc(idea)}</button>`);
        t.onclick = () => App.go('discover', idea);
        ideas.appendChild(t);
      });
      results.appendChild(ideas);
      return;
    }

    // remember recent searches
    const hist = [q, ...(State.prefs().discoverHistory || []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    State.setPref('discoverHistory', hist);

    const key = source + '|' + q.toLowerCase();
    const draw = (list) => {
      results.innerHTML = '';
      if (!list.length) { results.appendChild(html(`<div class="dv-empty">${icon('search', 48)}<b>No results for "${esc(q)}"</b><span>Try different words or switch source.</span></div>`)); return; }
      results.appendChild(html(`<div class="dv-count muted">${list.length} results from ${esc(list[0].source)}</div>`));
      const grid = html('<div class="dv-grid"></div>');
      for (const r of list) {
        const card = html(`<div class="dv-card" data-url="${esc(r.url)}">
          <div class="dv-thumb ${r.source === 'SoundCloud' ? 'square' : ''}"><img src="${esc(r.thumbnail || genCover(r.id))}" loading="lazy" onerror="this.src='${genCover(r.id, '', 'video')}'" />
            ${r.duration ? `<span class="mc-dur">${fmtTime(r.duration)}</span>` : ''}
            <div class="dv-hover"><button class="dv-btn pv">${icon('play', 16)} Preview</button><button class="dv-btn dl">${icon('download', 16)} Download</button></div>
            <div class="dv-bar"><div></div></div>
          </div>
          <div class="dv-c-title" title="${esc(r.title)}">${esc(r.title)}</div>
          <div class="dv-c-sub">${esc(r.channel || r.source)}${r.views ? ` · ${fmtViews(r.views)} views` : ''}</div>
          <span class="dv-state"></span>
        </div>`);
        $('.dv-thumb img', card).onclick = () => discoverPreview(r);
        $('.dv-c-title', card).onclick = () => discoverPreview(r);
        $('.pv', card).onclick = (e) => { e.stopPropagation(); discoverPreview(r); };
        $('.dl', card).onclick = (e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          UI.menu([{ header: 'Download as' }, ...dlFormats().map(([k, l]) => ({ label: l, action: () => discoverDownload(r, k) }))], rect.left, rect.bottom + 4, { minWidth: 200 });
        };
        card.oncontextmenu = (e) => { e.preventDefault(); UI.menu([{ label: 'Preview', icon: 'play', action: () => discoverPreview(r) }, { label: 'Download as a video (.mp4)', icon: 'video', action: () => discoverDownload(r, 'video-best') }, { label: `Download as a song (${native.platform === 'ios' ? '.m4a' : '.mp3'})`, icon: 'music', action: () => discoverDownload(r, 'audio-mp3') }, { divider: true }, { label: `Open on ${r.source}`, icon: 'external', action: () => native.shell.openExternal(r.url) }], e.clientX, e.clientY); };
        const j = Discover.jobsByUrl.get(r.url);
        if (j) discoverCardState(card, j);
        grid.appendChild(card);
      }
      results.appendChild(grid);
    };

    if (Discover.cache.has(key)) return draw(Discover.cache.get(key));
    results.appendChild(html(`<div class="dv-grid loading">${Array.from({ length: 8 }, () => '<div class="dv-card skel"><div class="dv-thumb"></div><div class="sk1"></div><div class="sk2"></div></div>').join('')}</div>`));
    native.dl.search(q, source, 24).then((list) => {
      Discover.cache.set(key, list);
      if (App.current.view === 'discover' && App.current.param === query) draw(list);
    }).catch((e) => {
      if (App.current.view !== 'discover') return;
      results.innerHTML = '';
      results.appendChild(html(`<div class="dv-empty">${icon('warning', 48)}<b>Search failed</b><span>${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span></div>`));
    });
  },
};
