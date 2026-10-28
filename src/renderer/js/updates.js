// Updates that happen inside the app: Aurora checks GitHub Releases, downloads the new version in
// the background, then installs it silently and reopens itself. No installer wizard.
const Updates = (() => {
  const S = { phase: 'idle', info: null, ratio: 0, got: 0, total: 0, error: null };
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(S); } catch {} });
  const onChange = (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); };
  const auto = () => State.settings().autoUpdate !== false;
  const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  async function check({ silent = false } = {}) {
    if (['checking', 'downloading', 'installing'].includes(S.phase)) return S.info;
    S.phase = 'checking'; S.error = null; emit();
    try {
      S.info = await native.update.check();
      if (S.info.newer) {
        S.phase = 'available'; emit();
        if (auto()) download({ silent: true });
      } else {
        S.phase = silent ? 'idle' : 'uptodate'; emit();
      }
    } catch (e) {
      S.phase = 'idle'; S.error = clean(e); emit();
      if (!silent) UI.toast("Couldn't check for updates. Check your internet connection.");
    }
    return S.info;
  }

  async function download({ silent = false } = {}) {
    if (S.phase === 'downloading' || S.phase === 'ready') return;
    S.phase = 'downloading'; S.ratio = 0; emit();
    try {
      await native.update.download();
      S.phase = 'ready'; emit();
      if (!silent) UI.toast(`Aurora ${S.info.latest} is ready. Restart to finish updating.`, 5000);
    } catch (e) {
      S.phase = 'available'; S.error = clean(e); emit();
      if (!silent) UI.toast(S.error, 5000);
    }
  }

  async function install() {
    S.phase = 'installing'; emit();
    try { await native.update.install(); } catch (e) { S.phase = 'available'; S.error = clean(e); emit(); UI.toast(S.error, 5000); }
  }

  // Update window (opened from the menu or the "Update ready" chip)
  async function open() {
    if (!S.info || S.phase === 'idle' || S.phase === 'uptodate') await check();
    const i = S.info;
    if (!i) return;
    const body = html(`<div class="update-box">
      <div class="up-hero">${icon('aurora', 56)}<div><div class="up-title">${i.newer ? 'A new Aurora is here' : "You're up to date"}</div>
        <div class="update-versions"><span class="tag">v${esc(i.current)}</span>${i.newer ? `<span>→</span><span class="tag new">v${esc(i.latest)}</span>` : ''}</div></div></div>
      ${i.newer && i.notes ? `<div class="update-notes">${esc(i.notes.replace(/[#*`]/g, '').replace(/\n{3,}/g, '\n\n'))}</div>` : ''}
      <div class="update-progress" ${S.phase === 'downloading' || S.phase === 'ready' ? '' : 'hidden'}><div style="width:${S.phase === 'ready' ? 100 : Math.round(S.ratio * 100)}%"></div></div>
      <div class="update-status"></div>
      <label class="dc-opt"><span>Download updates automatically<small>Aurora gets new versions in the background and asks before restarting.</small></span><input type="checkbox" class="toggle up-auto" ${auto() ? 'checked' : ''} /></label>
      <div class="up-actions"></div>
    </div>`);
    $('.up-auto', body).onchange = (e) => State.setSetting('autoUpdate', e.target.checked);
    const draw = () => {
      const st = $('.update-status', body), act = $('.up-actions', body), bar = $('.update-progress', body);
      if (!st) return;
      act.innerHTML = '';
      const btn = (label, cls, fn) => { const b = html(`<button class="${cls}">${label}</button>`); b.onclick = fn; act.appendChild(b); return b; };
      if (!i.newer) { st.textContent = 'You have the newest version of Aurora.'; btn('Close', 'btn-white', UI.closeModal); return; }
      bar.hidden = !(S.phase === 'downloading' || S.phase === 'ready' || S.phase === 'installing');
      $('div', bar).style.width = (S.phase === 'downloading' ? Math.round(S.ratio * 100) : 100) + '%';
      if (S.phase === 'downloading') st.textContent = S.total ? `Downloading… ${(S.got / 1048576).toFixed(1)} of ${(S.total / 1048576).toFixed(1)} MB` : 'Downloading…';
      else if (S.phase === 'ready') st.textContent = 'Downloaded. Aurora will close for a moment, update itself and reopen. Your music and settings are kept.';
      else if (S.phase === 'installing') st.textContent = 'Installing… Aurora will reopen by itself in a few seconds.';
      else st.textContent = S.error || 'The update downloads inside Aurora. No installer windows.';
      if (S.phase === 'ready') { btn('Later', 'btn-ghost', UI.closeModal); btn(`${icon('refresh', 16)} Restart & update`, 'btn-accent', install); }
      else if (S.phase === 'available') { btn('Later', 'btn-ghost', UI.closeModal); btn(`${icon('download', 16)} Download update`, 'btn-accent', () => download()); }
      else if (S.phase === 'downloading') btn('Hide', 'btn-ghost', UI.closeModal);
    };
    draw();
    const off = onChange(draw);
    UI.modal({ title: 'Aurora updates', body, width: 540, onClose: off });
  }

  function renderChip() {
    const chip = $('#update-chip');
    if (!chip) return;
    const show = S.phase === 'ready' || S.phase === 'downloading' || S.phase === 'installing';
    chip.hidden = !show;
    chip.classList.toggle('ready', S.phase === 'ready');
    chip.style.setProperty('--p', (S.phase === 'downloading' ? S.ratio * 100 : 100) + '%');
    $('.uc-label', chip).textContent = S.phase === 'ready' ? `Restart to update` : S.phase === 'installing' ? 'Updating…' : `Updating ${Math.round(S.ratio * 100)}%`;
    chip.title = S.info ? `Aurora ${S.info.latest}` : '';
  }

  function init() {
    native.update.onProgress((p) => {
      if (p.phase === 'download') { S.phase = 'downloading'; S.ratio = p.ratio || 0; S.got = p.got || 0; S.total = p.total || 0; }
      if (p.phase === 'ready') { S.phase = 'ready'; S.ratio = 1; }
      if (p.phase === 'installing') S.phase = 'installing';
      emit();
    });
    onChange(renderChip);
    const chip = $('#update-chip');
    if (chip) chip.onclick = open;
    setTimeout(() => check({ silent: true }), 4000);
    setInterval(() => { if (S.phase === 'idle' || S.phase === 'uptodate') check({ silent: true }); }, 6 * 60 * 60 * 1000);
  }

  return { init, check, open, download, install, onChange, get state() { return S; }, onClick: open };
})();
