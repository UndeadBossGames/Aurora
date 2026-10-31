// Video Downloader tab
const DL = { jobs: new Map(), tools: null, toolStatus: '', bound: false };

function dlBind() {
  if (DL.bound) return;
  DL.bound = true;
  native.dl.list().then((list) => list.forEach((j) => DL.jobs.set(j.id, j)));
  native.dl.onJob((j) => { DL.jobs.set(j.id, j); dlUpdateRow(j); dlBadge(); });
  native.dl.onRemoved((id) => { DL.jobs.delete(id); const r = document.querySelector(`.dl-row[data-id="${id}"]`); r && r.remove(); dlBadge(); dlEmpty(); });
  native.dl.onCleared(() => { native.dl.list().then((list) => { DL.jobs = new Map(list.map((j) => [j.id, j])); if (App.current && App.current.view === 'downloader') App.render(); dlBadge(); }); });
  native.dl.onTools((t) => {
    DL.toolStatus = t.status || '';
    const s = document.querySelector('.dl-tool-status');
    if (s) s.textContent = DL.toolStatus;
    if (t.ffmpeg !== undefined || /up to date|installed/.test(DL.toolStatus)) native.dl.tools().then((x) => { DL.tools = x; dlRenderTools(); });
  });
}

function dlBadge() {
  const active = [...DL.jobs.values()].filter((j) => ['queued', 'downloading', 'preparing'].includes(j.status)).length;
  if (App._updateHubDot) App._updateHubDot();
}

const SOURCES = ['YouTube', 'YouTube Music', 'SoundCloud', 'Spotify', 'Vimeo', 'TikTok', 'Instagram', 'X / Twitter', 'Twitch', 'Bandcamp', 'Facebook', 'Reddit', 'Dailymotion', 'Mixcloud'];

Views.downloader = {
  live: false,
  render(root, prefill) {
    dlBind();
    const s = State.settings();
    App.setHeaderColor('rgba(225, 51, 0, .55)');
    const el = html(`<div class="dl-page">
      <div class="coll-header dl-header">
        <div class="dl-hero-icon">${icon('download', 96)}</div>
        <div class="coll-meta">
          <div class="coll-type">Tool</div>
          <h1 class="coll-title">Video Downloader</h1>
          <div class="coll-desc">Save videos and music from YouTube, SoundCloud, Spotify links and 1000+ other sites straight into your library.</div>
        </div>
      </div>

      <div class="dl-box">
        <div class="dl-input-row">
          <div class="dl-input"><span data-icon="link" data-icon-size="20"></span><input id="dl-url" placeholder="Paste a link or type a song name…" spellcheck="false" /><button class="icon-btn small dl-paste" title="Paste" data-icon="paste"></button></div>
          <div class="dl-select"><select id="dl-format"></select><span data-icon="chevronDown" data-icon-size="16"></span></div>
          <button class="btn-accent big" id="dl-go">Download</button>
        </div>
        <div class="dl-or muted">Don't have a link? <button class="link-btn dl-discover">${icon('search', 14)} Search YouTube or SoundCloud in Discover</button></div>
        <div class="dl-options">
          <label class="dl-check"><input type="checkbox" id="dl-lib" class="toggle" ${s.dlAddToLibrary ? 'checked' : ''}/> <span>Add to Library</span></label>
          <label class="dl-check"><input type="checkbox" id="dl-pl" class="toggle" ${s.dlPlaylist ? 'checked' : ''}/> <span>Download whole playlist / album</span></label>
          <div class="dl-folder"><span data-icon="folder" data-icon-size="16"></span><span class="dl-folder-path" title="${esc(s.downloadDir)}"><bdi>${esc(s.downloadDir)}</bdi></span><button class="link-btn dl-change">Change</button><button class="link-btn dl-open">Open</button></div>
        </div>
        <div class="dl-sources">${SOURCES.map((x) => `<span class="src-chip">${esc(x)}</span>`).join('')}<span class="src-chip more">+ 1000 more</span></div>
      </div>

      <div class="dl-queue-head"><h2>Download queue</h2><div class="dl-q-btns"><button class="btn-outline sm dl-retry-all" hidden>${icon('refresh', 14)} Retry failed</button><button class="btn-outline sm dl-clear">Clear finished</button></div></div>
      <div class="dl-q-tabs seg"><button data-f="all" class="on">All <em></em></button><button data-f="active">Downloading <em></em></button><button data-f="done">Done <em></em></button><button data-f="error">Failed <em></em></button></div>
      <div class="dl-list" id="dl-list" data-f="all"></div>
      <section class="dl-recent"></section>

      <div class="dl-tools">
        <div class="dl-tools-head"><b>Download engine</b><span class="dl-tool-status muted">${esc(DL.toolStatus)}</span></div>
        <div class="dl-tools-body" id="dl-tools-body"><span class="muted">Checking…</span></div>
        <p class="dl-legal muted">Only download content you own or have permission to save. Respect each site's terms and copyright. Spotify audio is DRM-protected, so Aurora looks up the tracks on a Spotify link and downloads matching public uploads from YouTube.</p>
      </div>
    </div>`);
    root.appendChild(el);

    const fmt = $('#dl-format', el);
    const formats = dlFormats();
    fmt.innerHTML = formats.map(([k, l]) => `<option value="${k}" ${s.dlFormat === k ? 'selected' : ''}>${l}</option>`).join('');
    fmt.onchange = () => State.setSetting('dlFormat', fmt.value);
    $('#dl-lib', el).onchange = (e) => State.setSetting('dlAddToLibrary', e.target.checked);
    $('#dl-pl', el).onchange = (e) => State.setSetting('dlPlaylist', e.target.checked);
    $('.dl-change', el).onclick = async () => {
      const d = await native.dialog.folder('Choose download folder');
      if (d) { State.setSetting('downloadDir', d); $('.dl-folder-path', el).innerHTML = `<bdi>${esc(d)}</bdi>`; $('.dl-folder-path', el).title = d; }
    };
    $('.dl-open', el).onclick = () => native.shell.openPath(State.settings().downloadDir);
    $('.dl-clear', el).onclick = () => native.dl.clear();
    const url = $('#dl-url', el);
    if (prefill) url.value = prefill;
    $('.dl-paste', el).onclick = async () => { try { url.value = (await navigator.clipboard.readText()).trim(); url.focus(); } catch { url.focus(); document.execCommand('paste'); } };
    url.addEventListener('input', () => {
      const v = url.value;
      // Smart default: Spotify / SoundCloud links -> audio
      if (/spotify\.com|soundcloud\.com|bandcamp\.com/i.test(v) && fmt.value.startsWith('video')) fmt.value = 'audio-mp3';
    });
    const start = async () => {
      const v = url.value.trim();
      if (!v) { url.focus(); return UI.toast('Paste a link first'); }
      const btn = $('#dl-go', el);
      btn.disabled = true;
      btn.textContent = /spotify/i.test(v) ? 'Reading Spotify…' : 'Starting…';
      try {
        const jobs = await native.dl.add({ url: v, format: fmt.value, dir: State.settings().downloadDir, playlist: $('#dl-pl', el).checked, addToLibrary: $('#dl-lib', el).checked });
        jobs.forEach((j) => { DL.jobs.set(j.id, j); dlUpdateRow(j); });
        url.value = '';
        UI.toast(jobs.length > 1 ? `Added ${jobs.length} downloads` : 'Download started');
      } catch (e) {
        UI.toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 5000);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Download';
      }
    };
    $('#dl-go', el).onclick = start;
    url.addEventListener('keydown', (e) => e.key === 'Enter' && start());
    setTimeout(() => url.focus(), 30);

    const jobs = [...DL.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    jobs.forEach((j) => dlUpdateRow(j, true));
    dlEmpty();
    // queue filters
    $$('.dl-q-tabs button', el).forEach((b) => b.onclick = () => {
      $$('.dl-q-tabs button', el).forEach((x) => x.classList.toggle('on', x === b));
      $('#dl-list', el).dataset.f = b.dataset.f;
      dlEmpty();
    });
    $('.dl-retry-all', el).onclick = () => [...DL.jobs.values()].filter((j) => j.status === 'error').forEach((j) => native.dl.retry(j.id));
    dlCounts();

    native.dl.tools().then((t) => { DL.tools = t; dlRenderTools(); });
    $('.dl-discover', el).onclick = () => App.go('discover');
    // recently downloaded (from the library, so it survives restarts)
    dlRenderRecent($('.dl-recent', el));
    const offLib = State.on('library', debounce(() => { const h = $('.dl-recent'); if (h) dlRenderRecent(h); }, 400));
    hydrateIcons(el);
    return () => offLib();
  },
};

// how many downloads are in each state (shown on the queue tabs)
function dlCounts() {
  const tabs = document.querySelector('.dl-q-tabs');
  if (!tabs) return;
  const js = [...DL.jobs.values()];
  const n = { all: js.length, active: js.filter((j) => ['queued', 'downloading', 'preparing'].includes(j.status)).length, done: js.filter((j) => j.status === 'done').length, error: js.filter((j) => ['error', 'cancelled'].includes(j.status)).length };
  tabs.querySelectorAll('button').forEach((b) => { const c = n[b.dataset.f]; b.querySelector('em').textContent = c ? c : ''; });
  const ra = document.querySelector('.dl-retry-all'); if (ra) ra.hidden = !n.error;
}

const dlAgo = (ts) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(ts);
};
const dlExt = (t) => (String(t.path || '').match(/\.([a-z0-9]{2,4})$/i) || [, t.kind === 'video' ? 'mp4' : 'mp3'])[1].toLowerCase();

// "Recently downloaded": everything you downloaded, newest first, grouped by day, one tap to play
function dlRenderRecent(host) {
  const st = host.__st || (host.__st = { kind: 'all', limit: 30 });
  const all = State.allTracks().filter((t) => t.source !== 'local').sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  host.innerHTML = '';
  if (!all.length) return;
  const list = all.filter((t) => st.kind === 'all' || (st.kind === 'video' ? t.kind === 'video' : t.kind !== 'video'));
  const songs = all.filter((t) => t.kind !== 'video').length, vids = all.length - songs;
  const head = html(`<div class="dl-recent-head"><div><h2>Recently downloaded</h2><span class="muted">${all.length} item${all.length === 1 ? '' : 's'} · ${songs} song${songs === 1 ? '' : 's'} · ${vids} video${vids === 1 ? '' : 's'}</span></div>
    <div class="seg dl-r-kind"><button data-k="all">All</button><button data-k="song">Songs</button><button data-k="video">Videos</button></div>
    <button class="btn-accent sm dl-r-play">${icon('play', 14)} Play all</button></div>`);
  head.querySelectorAll('.dl-r-kind button').forEach((b) => { b.classList.toggle('on', b.dataset.k === st.kind); b.onclick = () => { st.kind = b.dataset.k; st.limit = 30; dlRenderRecent(host); }; });
  head.querySelector('.dl-r-play').onclick = () => Player.playContext({ key: 'downloads', name: 'Recently downloaded' }, list.map((t) => t.id), 0);
  host.appendChild(head);
  const ids = list.map((t) => t.id);
  const dayOf = (ts) => {
    const d = new Date(ts || 0), now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'Yesterday';
    if (Date.now() - d < 7 * 864e5) return 'This week';
    if (Date.now() - d < 31 * 864e5) return 'This month';
    return 'Earlier';
  };
  let day = '';
  const box = html('<div class="dl-r-list"></div>');
  list.slice(0, st.limit).forEach((t, i) => {
    const d = dayOf(t.addedAt);
    if (d !== day) { day = d; box.appendChild(html(`<div class="dl-r-day">${d}</div>`)); }
    const ext = dlExt(t);
    const playing = Player.current && Player.current.id === t.id;
    const row = html(`<div class="dl-r-row ${playing ? 'playing' : ''}" data-id="${esc(t.id)}">
      <div class="dl-r-cover">${UI.coverHtml(UI.coverSrc(t), '')}<button class="dl-r-pbtn">${icon('play', 16)}</button></div>
      <div class="dl-r-t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div>
      <span class="dl-type ${t.kind === 'video' ? 'video' : 'song'}">${t.kind === 'video' ? 'Video' : 'Song'} · .${esc(ext)}</span>
      <span class="dl-r-when" title="${esc(new Date(t.addedAt || 0).toLocaleString())}">${esc(dlAgo(t.addedAt || 0))}</span>
      <button class="icon-btn small dl-r-more" title="More">${icon('dotsH', 16)}</button>
    </div>`);
    row.onclick = (e) => {
      if (e.target.closest('.dl-r-more')) { const r = e.target.closest('.dl-r-more').getBoundingClientRect(); return UI.trackMenu(t, r.right, r.bottom); }
      Player.playContext({ key: 'downloads', name: 'Recently downloaded' }, ids, i);
    };
    row.oncontextmenu = (e) => { e.preventDefault(); UI.trackMenu(t, e.clientX, e.clientY); };
    box.appendChild(row);
  });
  host.appendChild(box);
  if (list.length > st.limit) {
    const more = html(`<button class="btn-outline sm dl-r-more-btn">Show ${Math.min(30, list.length - st.limit)} more</button>`);
    more.onclick = () => { st.limit += 30; dlRenderRecent(host); };
    host.appendChild(more);
  }
}

function dlEmpty() {
  const list = $('#dl-list');
  if (!list) return;
  const f = list.dataset.f || 'all';
  const match = { all: '.dl-row', active: '.dl-row.queued, .dl-row.downloading, .dl-row.preparing', done: '.dl-row.done', error: '.dl-row.error, .dl-row.cancelled' }[f];
  const has = list.querySelector(match);
  let e = list.querySelector('.dl-empty');
  const msg = { all: 'Your downloads will show up here.', active: 'Nothing downloading right now.', done: 'Finished downloads show up here.', error: 'No failed downloads.' }[f];
  if (!has && !e) { e = html(`<div class="dl-empty muted"><span data-icon="downloadCircle" data-icon-size="40"></span><span class="dl-empty-t"></span></div>`); hydrateIcons(e); list.appendChild(e); }
  if (e) { if (has) e.remove(); else e.querySelector('.dl-empty-t').textContent = msg; }
  dlCounts();
}

function dlUpdateRow(j, append = false) {
  const list = $('#dl-list');
  if (!list) return;
  let row = list.querySelector(`.dl-row[data-id="${j.id}"]`);
  const statusText = {
    queued: 'Waiting…', preparing: j.statusText || 'Preparing…',
    downloading: j.statusText || `${j.progress.toFixed(1)}%${j.speed ? ' · ' + j.speed : ''}${j.eta && j.eta !== 'Unknown' ? ' · ' + j.eta + ' left' : ''}`,
    done: `${j.files.length > 1 ? `Done · ${j.files.length} files` : 'Done'}${j.finishedAt || j.createdAt ? ' · ' + dlAgo(j.finishedAt || j.createdAt) : ''}`, error: j.error || 'Failed', cancelled: 'Cancelled',
  }[j.status];
  const thumb = (j.files[0] && j.files[0].cover && native.fileUrl(j.files[0].cover)) || j.thumbnail || (j.meta && j.meta.cover) || genCover(j.id, '', j.format.startsWith('video') ? 'video' : 'music');
  const inner = `
    <div class="dl-thumb ${j.format.startsWith('video') ? 'wide' : ''}"><img src="${esc(thumb)}" onerror="this.src='${genCover(j.id)}'" /></div>
    <div class="dl-info">
      <div class="dl-title" title="${esc(j.title)}">${esc(j.title)}</div>
      <div class="dl-meta"><span class="src-chip sm">${esc(j.source)}</span><span class="dl-type ${String(j.format).startsWith('audio') ? 'song' : 'video'}">${esc(dlTypeLabel(j))}</span><span class="dl-status ${j.status}">${esc(statusText)}</span></div>
      ${['downloading', 'queued', 'preparing'].includes(j.status) ? `<div class="dl-bar"><div style="width:${j.progress || 0}%"></div></div>` : ''}
    </div>
    <div class="dl-actions">
      ${j.status === 'done' && j.files.length ? `<button class="icon-btn small dl-play" title="Play" data-icon="play"></button><button class="icon-btn small dl-show" title="Show in folder" data-icon="folder"></button>` : ''}
      ${['error', 'cancelled'].includes(j.status) ? `<button class="icon-btn small dl-retry" title="Retry" data-icon="refresh"></button>` : ''}
      ${['downloading', 'queued', 'preparing'].includes(j.status) ? `<button class="icon-btn small dl-cancel" title="Cancel" data-icon="close"></button>` : `<button class="icon-btn small dl-remove" title="Remove from list" data-icon="trash"></button>`}
    </div>`;
  if (!row) {
    row = html(`<div class="dl-row" data-id="${j.id}"></div>`);
    if (append) list.appendChild(row); else list.prepend(row);
  }
  // avoid re-rendering thumbnails on every progress tick
  const sig = `${j.status}|${j.title}|${thumb}|${j.files.length}|${j.statusText || ''}`;
  if (row.dataset.sig === sig && j.status === 'downloading') {
    const bar = row.querySelector('.dl-bar > div');
    if (bar) bar.style.width = (j.progress || 0) + '%';
    const st = row.querySelector('.dl-status');
    if (st) st.textContent = statusText;
  } else {
    row.dataset.sig = sig;
    row.className = `dl-row ${j.status}`;
    row.innerHTML = inner;
    hydrateIcons(row);
    const q = (s) => row.querySelector(s);
    if (q('.dl-play')) q('.dl-play').onclick = () => { const ids = j.files.map((f) => f.id); if (!State.track(ids[0])) State.addTracks(j.files); Player.playContext({ key: 'downloads', name: 'Downloads' }, ids, 0); };
    if (q('.dl-show')) q('.dl-show').onclick = () => native.shell.showItem(j.files[0].path);
    if (q('.dl-retry')) q('.dl-retry').onclick = () => native.dl.retry(j.id);
    if (q('.dl-cancel')) q('.dl-cancel').onclick = () => native.dl.cancel(j.id);
    if (q('.dl-remove')) q('.dl-remove').onclick = () => native.dl.remove(j.id);
    if (j.status === 'error') row.title = j.error || '';
  }
  dlEmpty();
}

function dlRenderTools() {
  const b = $('#dl-tools-body');
  if (!b || !DL.tools) return;
  const t = DL.tools;
  if (t.ios) {
    // iPhone: yt-dlp runs inside the app; AVFoundation merges video + audio, so no ffmpeg
    b.innerHTML = `
      <div class="tool"><span class="tool-dot ${t.ytdlp ? 'ok' : 'bad'}"></span><div><b>yt-dlp</b><span class="muted">${t.ytdlp ? 'Version ' + esc(t.ytdlp) + (t.updated ? ' (updated in the app)' : '') : esc(t.error || 'Starting…')}</span></div><button class="btn-outline sm tool-upd">Check for update</button></div>
      <div class="tool"><span class="tool-dot ok"></span><div><b>Video + audio merging</b><span class="muted">Built into iOS. Best-quality videos are joined on your iPhone, no extra tools needed.</span></div></div>`;
    const u = b.querySelector('.tool-upd');
    u.onclick = async () => { u.disabled = true; try { await native.dl.updateYtdlp(); } catch (e) { UI.toast('Update failed: ' + e.message); } u.disabled = false; };
    return;
  }
  b.innerHTML = `
    <div class="tool"><span class="tool-dot ${t.ytdlp ? 'ok' : 'bad'}"></span><div><b>yt-dlp</b><span class="muted">${t.ytdlp ? 'Version ' + esc(t.ytdlp) : 'Not installed — it will be downloaded automatically'}</span></div><button class="btn-outline sm tool-upd">${t.ytdlp ? 'Check for update' : 'Install'}</button></div>
    <div class="tool"><span class="tool-dot ${t.ffmpeg ? 'ok' : 'warn'}"></span><div><b>ffmpeg</b><span class="muted">${t.ffmpeg ? 'Installed — best quality, MP3 conversion and merging enabled' : t.ffmpegInstalling ? 'Installing…' : 'Needed for HD video and MP3. Installed automatically on first download.'}</span></div>${t.ffmpeg ? '' : '<button class="btn-outline sm tool-ff">Install now</button>'}</div>`;
  const upd = b.querySelector('.tool-upd');
  upd.onclick = async () => { upd.disabled = true; try { await native.dl.updateYtdlp(); } catch (e) { UI.toast('Update failed: ' + e.message); } upd.disabled = false; };
  const ff = b.querySelector('.tool-ff');
  if (ff) ff.onclick = async () => { ff.disabled = true; ff.textContent = 'Installing…'; try { await native.dl.installFfmpeg(); UI.toast('ffmpeg installed'); } catch (e) { UI.toast('ffmpeg install failed: ' + e.message, 5000); } DL.tools = await native.dl.tools(); dlRenderTools(); };
}

// keep the badge alive even when the tab isn't open
document.addEventListener('DOMContentLoaded', () => setTimeout(dlBind, 500));

// "Song · .mp3" / "Video · .mp4": what the download will be (the real file type once it's saved)
function dlTypeLabel(j) {
  const ios = window.native && native.platform === 'ios';
  const f = (j.files || []).map((x) => (x && (x.path || x)) || '').find(Boolean);
  const ext = f ? String(f).split('.').pop().toLowerCase() : ({ 'audio-mp3': ios ? 'm4a' : 'mp3', 'audio-m4a': 'm4a' }[j.format] || 'mp4');
  const q = { 'video-1080': ' · 1080p', 'video-720': ' · 720p' }[j.format] || '';
  return `${['mp3', 'm4a', 'aac', 'opus', 'ogg', 'wav', 'flac'].includes(ext) ? 'Song' : 'Video'} · .${ext}${q}`;
}
