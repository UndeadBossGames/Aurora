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
    let url = r.url;
    // downloading a music video as a song? grab the official song instead (better sound, no intro/outro)
    if (/^audio/.test(format) && r.source === 'YouTube' && r.kind !== 'song' && !discoverIsSong(r)) {
      const off = await discoverOfficialSong(r.title);
      if (off) { url = off.url; UI.toast(`Using the official song: ${off.title}${off.channel ? ' - ' + off.channel : ''}`); }
    }
    const jobs = await native.dl.add({ url, format, dir: State.settings().downloadDir, playlist: false, addToLibrary: State.settings().dlAddToLibrary !== false });
    jobs.forEach((j) => { Discover.jobsByUrl.set(r.url, j); $$(`.dv-card[data-url="${CSS.escape(r.url)}"]`).forEach((c) => discoverCardState(c, j)); });
    UI.toast(`Downloading "${r.title}"`);
  } catch (e) {
    UI.toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 5000);
  }
}

// ---- songs vs videos ----
const SONG_FMT = () => (native.platform === 'ios' ? 'audio-m4a' : 'audio-mp3');
const VIDEO_WORDS = /\b(official\s+(music\s+)?video|music\s+video|official\s+mv|\bm\/?v\b|visuali[sz]er|live\b|performance|reaction|trailer|teaser|behind the scenes)/i;
const AUDIO_WORDS = /\b(official\s+audio|\(audio\)|\[audio\]|audio only|lyrics?|lyric video)\b/i;
function discoverIsSong(r) {
  if (r.kind) return r.kind === 'song';
  if (/ - Topic$/i.test(r.channel || '')) return true;
  return AUDIO_WORDS.test(r.title) && !VIDEO_WORDS.test(r.title);
}
// "Artist - Song (Official Music Video) [4K]" -> "Artist - Song"
function discoverCleanTitle(t) {
  return String(t || '').replace(/\s*[([【][^)\]】]*(official|video|audio|lyric|visuali|m\/?v|4k|hd|remaster|explicit)[^)\]】]*[)\]】]/gi, '').replace(/\s*\|.*$/, '').replace(/\s+/g, ' ').trim();
}
const discoverNorm = (s) => String(s || '').toLowerCase().replace(/\s*\b(feat|ft)\b.*$/, '').replace(/[^a-z0-9]+/g, '');
// Find the official song (YouTube Music "Songs") for a title; null if nothing matches well.
async function discoverOfficialSong(title, artist = '') {
  const clean = discoverCleanTitle(title);
  let list = [];
  try { list = await native.dl.search(`${artist ? artist + ' ' : ''}${clean}`, 'songs', 5); } catch { return null; }
  const whole = discoverNorm(`${artist} ${clean}`);
  return list.find((x) => {
    const t = discoverNorm(x.title), a = discoverNorm(x.channel).slice(0, 8);
    return t.length > 1 && whole.includes(t) && (!a || whole.includes(a) || !artist && !/ - /.test(clean));
  }) || null;
}
// YouTube search with the official songs first; never fails just because one half failed
async function discoverSearch(q, source) {
  if (source !== 'youtube') return native.dl.search(q, source, 24);
  const [songs, vids] = await Promise.allSettled([native.dl.search(q, 'songs', 10), native.dl.search(q, 'youtube', 24)]);
  if (songs.status === 'rejected' && vids.status === 'rejected') throw vids.reason;
  const seen = new Set(), out = [];
  for (const r of (songs.value || [])) if (r.id && !seen.has(r.id)) { seen.add(r.id); out.push({ ...r, kind: 'song' }); }
  for (const r of (vids.value || [])) if (r.id && !seen.has(r.id)) { seen.add(r.id); out.push({ ...r, kind: discoverIsSong(r) ? 'song' : 'video' }); }
  return out;
}

function discoverPreview(r) {
  if (Player.playing) Player.toggle();
  const yt = r.source === 'YouTube';
  const embed = yt
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.id)}?autoplay=1&rel=0&modestbranding=1`
    : `https://w.soundcloud.com/player/?url=${encodeURIComponent(r.url)}&auto_play=true&visual=true`;
  const def = r.source === 'SoundCloud' || r.kind === 'song' ? SONG_FMT() : State.settings().dlFormat || 'video-best';
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
    <div class="dv-input"><span data-icon="search" data-icon-size="20"></span><input placeholder="Search for a song, artist or video…" value="${esc(query)}" spellcheck="false" /><button class="btn-accent dv-go">Search</button></div>
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
    if (Discover.lastQ !== key) { Discover.tab = 'all'; Discover.lastQ = key; }
    const card = (r) => {
      const c = html(`<div class="dv-card" data-url="${esc(r.url)}">
        <div class="dv-thumb ${r.source === 'SoundCloud' ? 'square' : ''}"><img src="${esc(r.thumbnail || genCover(r.id))}" loading="lazy" onerror="this.src='${genCover(r.id, '', 'video')}'" />
          ${r.duration ? `<span class="mc-dur">${fmtTime(r.duration)}</span>` : ''}
          <div class="dv-hover"><button class="dv-btn pv">${icon('play', 16)} Preview</button><button class="dv-btn dl">${icon('download', 16)} Download</button></div>
          <div class="dv-bar"><div></div></div>
        </div>
        <div class="dv-c-title" title="${esc(r.title)}">${esc(r.title)}</div>
        <div class="dv-c-sub">${esc(r.channel || r.source)}${r.views ? ` · ${fmtViews(r.views)} views` : ''}</div>
        <span class="dv-state"></span>
      </div>`);
      $('.dv-thumb img', c).onclick = () => discoverPreview(r);
      $('.dv-c-title', c).onclick = () => discoverPreview(r);
      $('.pv', c).onclick = (e) => { e.stopPropagation(); discoverPreview(r); };
      $('.dl', c).onclick = (e) => { e.stopPropagation(); fmtMenu(r, e.currentTarget); };
      c.oncontextmenu = (e) => { e.preventDefault(); ctx(r, e); };
      return c;
    };
    const fmtMenu = (r, btn) => {
      const rect = btn.getBoundingClientRect();
      UI.menu([{ header: 'Download as' }, ...dlFormats().map(([k, l]) => ({ label: l, action: () => discoverDownload(r, k) }))], rect.left, rect.bottom + 4, { minWidth: 200 });
    };
    const ctx = (r, e) => UI.menu([{ label: 'Preview', icon: 'play', action: () => discoverPreview(r) }, { label: `Download song (${native.platform === 'ios' ? '.m4a' : '.mp3'})`, icon: 'music', action: () => discoverDownload(r, SONG_FMT()) }, { label: 'Download video (.mp4)', icon: 'video', action: () => discoverDownload(r, 'video-best') }, { divider: true }, { label: `Open on ${r.source}`, icon: 'external', action: () => native.shell.openExternal(r.url) }], e.clientX, e.clientY);
    // a song row: one tap downloads the song
    const row = (r, i) => {
      const el = html(`<div class="dv-card dv-song" data-url="${esc(r.url)}">
        <span class="dv-n">${i + 1}</span>
        <div class="dv-s-art"><img src="${esc(r.thumbnail || genCover(r.id))}" loading="lazy" onerror="this.src='${genCover(r.id, '', 'music')}'" /><button class="dv-s-play" title="Preview">${icon('play', 16)}</button></div>
        <div class="dv-s-text"><b title="${esc(r.title)}">${esc(r.title)}</b><span>${esc((r.channel || '').replace(/ - Topic$/i, '') || r.source)}</span></div>
        <span class="dv-state"></span>
        <span class="dv-s-dur">${r.duration ? fmtTime(r.duration) : ''}</span>
        <button class="btn-accent sm dv-s-dl">${icon('download', 14)} Song</button>
        <button class="icon-btn small dv-s-more" title="More">${icon('dotsH', 18)}</button>
        <div class="dv-bar"><div></div></div>
      </div>`);
      $('.dv-s-play', el).onclick = () => discoverPreview(r);
      $('.dv-s-text b', el).onclick = () => discoverPreview(r);
      $('.dv-s-dl', el).onclick = () => discoverDownload(r, SONG_FMT());
      $('.dv-s-more', el).onclick = (e) => { const b = e.currentTarget.getBoundingClientRect(); ctx(r, { clientX: b.left, clientY: b.bottom }); };
      el.oncontextmenu = (e) => { e.preventDefault(); ctx(r, e); };
      return el;
    };
    const draw = (list) => {
      results.innerHTML = '';
      if (!list.length) { results.appendChild(html(`<div class="dv-empty">${icon('search', 48)}<b>No results for "${esc(q)}"</b><span>Try different words or switch source.</span></div>`)); return; }
      const songs = list.filter((r) => r.kind === 'song'), vids = list.filter((r) => r.kind !== 'song');
      const tab = Discover.tab || 'all';
      if (songs.length && vids.length) {
        const seg = html(`<div class="seg dv-tabs"><button data-t="all">All</button><button data-t="songs">Songs <small>${songs.length}</small></button><button data-t="videos">Videos <small>${vids.length}</small></button></div>`);
        $$('button', seg).forEach((b) => { b.classList.toggle('on', b.dataset.t === tab); b.onclick = () => { Discover.tab = b.dataset.t; draw(list); }; });
        results.appendChild(seg);
      }
      const add = (n) => { const j = Discover.jobsByUrl.get(n.dataset.url); if (j) discoverCardState(n, j); return n; };
      if (songs.length && tab !== 'videos') {
        results.appendChild(html(`<h2 class="dv-sec">${icon('music', 20)} Songs <span class="muted">official releases first</span></h2>`));
        const box = html('<div class="dv-songs"></div>');
        const show = tab === 'songs' ? songs : songs.slice(0, 6);
        show.forEach((r, i) => box.appendChild(add(row(r, i))));
        results.appendChild(box);
        if (show.length < songs.length) { const m = html(`<button class="btn-outline sm dv-more-songs">See all ${songs.length} songs</button>`); m.onclick = () => { Discover.tab = 'songs'; draw(list); }; results.appendChild(m); }
      }
      if (vids.length && tab !== 'songs') {
        if (songs.length) results.appendChild(html(`<h2 class="dv-sec">${icon('video', 20)} Videos</h2>`));
        else results.appendChild(html(`<div class="dv-count muted">${list.length} results from ${esc(list[0].source)}</div>`));
        const grid = html('<div class="dv-grid"></div>');
        vids.forEach((r) => grid.appendChild(add(card(r))));
        results.appendChild(grid);
      }
    };

    if (Discover.cache.has(key)) return draw(Discover.cache.get(key));
    results.appendChild(html(`<div class="dv-grid loading">${Array.from({ length: 8 }, () => '<div class="dv-card skel"><div class="dv-thumb"></div><div class="sk1"></div><div class="sk2"></div></div>').join('')}</div>`));
    discoverSearch(q, source).then((list) => {
      Discover.cache.set(key, list);
      if (App.current.view === 'discover' && App.current.param === query) draw(list);
    }).catch((e) => {
      if (App.current.view !== 'discover') return;
      results.innerHTML = '';
      results.appendChild(html(`<div class="dv-empty">${icon('warning', 48)}<b>Search failed</b><span>${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span></div>`));
    });
  },
};
