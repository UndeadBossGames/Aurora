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

      <div class="dl-queue-head"><h2>Downloads</h2><div><button class="btn-outline sm dl-clear">Clear finished</button></div></div>
      <div class="dl-list" id="dl-list"></div>
      <div class="dl-recent"></div>

      <div class="dl-tools">
        <div class="dl-tools-head"><b>Download engine</b><span class="dl-tool-status muted">${esc(DL.toolStatus)}</span></div>
        <div class="dl-tools-body" id="dl-tools-body"><span class="muted">Checking…</span></div>
        <p class="dl-legal muted">Only download content you own or have permission to save. Respect each site's terms and copyright. Spotify audio is DRM-protected, so Aurora looks up the tracks on a Spotify link and downloads matching public uploads from YouTube.</p>
      </div>
    </div>`);
    root.appendChild(el);

    const fmt = $('#dl-format', el);
    const formats = [['video-best', 'Video · Best (MP4)'], ['video-1080', 'Video · 1080p (MP4)'], ['video-720', 'Video · 720p (MP4)'], ['audio-mp3', 'Audio · MP3'], ['audio-m4a', 'Audio · M4A']];
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

    native.dl.tools().then((t) => { DL.tools = t; dlRenderTools(); });
    $('.dl-discover', el).onclick = () => App.go('discover');
    // recently downloaded (from the library, so it survives restarts)
    const recent = State.allTracks().filter((t) => t.source !== 'local').sort((a, b) => b.addedAt - a.addedAt).slice(0, 10);
    if (recent.length) {
      const host = $('.dl-recent', el);
      host.appendChild(UI.shelf('Recently downloaded', recent.map((t, i) => UI.card({
        title: t.title, sub: esc(`${t.artist} · ${t.source}${t.size ? ' · ' + fmtBytes(t.size) : ''}`), cover: UI.coverSrc(t),
        onOpen: () => Player.playContext({ key: 'downloads', name: 'Downloads' }, recent.map((x) => x.id), i),
        onPlay: () => Player.playContext({ key: 'downloads', name: 'Downloads' }, recent.map((x) => x.id), i),
      })), { onMore: () => App.go('collection', 'downloads') }));
    }
    hydrateIcons(el);
  },
};

function dlEmpty() {
  const list = $('#dl-list');
  if (!list) return;
  const has = list.querySelector('.dl-row');
  let e = list.querySelector('.dl-empty');
  if (!has && !e) list.appendChild(html(`<div class="dl-empty muted"><span data-icon="downloadCircle" data-icon-size="40"></span><span>Your downloads will show up here.</span></div>`));
  if (has && e) e.remove();
}

function dlUpdateRow(j, append = false) {
  const list = $('#dl-list');
  if (!list) return;
  let row = list.querySelector(`.dl-row[data-id="${j.id}"]`);
  const statusText = {
    queued: 'Waiting…', preparing: j.statusText || 'Preparing…',
    downloading: j.statusText || `${j.progress.toFixed(1)}%${j.speed ? ' · ' + j.speed : ''}${j.eta && j.eta !== 'Unknown' ? ' · ' + j.eta + ' left' : ''}`,
    done: j.files.length > 1 ? `Done · ${j.files.length} files` : 'Done', error: j.error || 'Failed', cancelled: 'Cancelled',
  }[j.status];
  const thumb = (j.files[0] && j.files[0].cover && native.fileUrl(j.files[0].cover)) || j.thumbnail || (j.meta && j.meta.cover) || genCover(j.id, '', j.format.startsWith('video') ? 'video' : 'music');
  const inner = `
    <div class="dl-thumb ${j.format.startsWith('video') ? 'wide' : ''}"><img src="${esc(thumb)}" onerror="this.src='${genCover(j.id)}'" /></div>
    <div class="dl-info">
      <div class="dl-title" title="${esc(j.title)}">${esc(j.title)}</div>
      <div class="dl-meta"><span class="src-chip sm">${esc(j.source)}</span><span>${esc({ 'video-best': 'MP4 · Best', 'video-1080': 'MP4 · 1080p', 'video-720': 'MP4 · 720p', 'audio-mp3': 'MP3', 'audio-m4a': 'M4A' }[j.format] || j.format)}</span><span class="dl-status ${j.status}">${esc(statusText)}</span></div>
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
