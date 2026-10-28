// "Check for updates" button (top right). Checks GitHub Releases and installs newer versions.
const Updates = (() => {
  let info = null;
  let busy = false;

  const btn = () => $('#btn-update');
  function setBtn(state, label) {
    const b = btn();
    if (!b) return;
    b.classList.remove('checking', 'available', 'uptodate');
    if (state) b.classList.add(state);
    $('.update-label', b).textContent = label;
    b.title = label;
  }
  const idle = () => setBtn('', 'Check for updates');

  async function check({ silent = false } = {}) {
    if (busy) return info;
    busy = true;
    if (!silent) setBtn('checking', 'Checking…');
    try {
      info = await native.update.check();
      if (info.newer) setBtn('available', `Update to ${info.latest}`);
      else if (!silent) { setBtn('uptodate', "You're up to date"); setTimeout(() => { if (!info.newer) idle(); }, 4000); }
      return info;
    } catch (e) {
      if (!silent) { idle(); UI.toast("Couldn't check for updates. Check your internet connection and try again."); }
      return null;
    } finally {
      busy = false;
    }
  }

  async function onClick() {
    const r = info && info.newer ? info : await check();
    if (!r) return;
    if (!r.newer) {
      UI.modal({
        title: 'Check for updates', width: 460,
        body: `<div class="update-box">
          <div class="update-versions"><span>You have the latest version</span><span class="tag">v${esc(r.current)}</span></div>
          <div class="update-status">${r.none ? 'No releases have been published on GitHub yet.' : `Latest release on GitHub: v${esc(r.latest)}`}</div>
        </div>`,
        actions: [{ label: 'Release history', action: () => { native.shell.openExternal(r.url || App.REPO + '/releases'); } }, { label: 'OK', primary: true }],
      });
      return;
    }
    showUpdateModal(r);
  }

  function showUpdateModal(r) {
    const size = r.asset && r.asset.size ? ` (${(r.asset.size / 1048576).toFixed(0)} MB)` : '';
    const el = UI.modal({
      title: 'Update available', width: 520,
      body: `<div class="update-box">
        <div class="update-versions"><span class="tag">v${esc(r.current)}</span><span>→</span><span class="tag new">v${esc(r.latest)}</span></div>
        ${r.notes ? `<div class="update-notes">${esc(r.notes)}</div>` : ''}
        <div class="update-progress" hidden><div></div></div>
        <div class="update-status">Aurora will download the installer${esc(size)}, close, and install the update. Your profiles, playlists and downloads are kept.</div>
      </div>`,
      actions: [
        { label: 'Later' },
        { label: 'Update now', primary: true, action: async (modal) => {
          const bar = $('.update-progress', modal);
          const status = $('.update-status', modal);
          $$('.modal-actions button', modal).forEach((b) => (b.disabled = true));
          bar.hidden = false;
          status.textContent = 'Downloading update…';
          setBtn('checking', 'Downloading…');
          try {
            const res = await native.update.install();
            status.textContent = res.launched ? 'Starting the installer… Aurora will close now.' : `Installer saved to ${res.path}`;
          } catch (e) {
            status.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
            $$('.modal-actions button', modal).forEach((b) => (b.disabled = false));
            setBtn('available', `Update to ${r.latest}`);
          }
          return false; // keep the dialog open
        } },
      ],
    });
    return el;
  }

  function init() {
    const b = btn();
    if (!b) return;
    b.addEventListener('click', onClick);
    native.update.onProgress((p) => {
      const bar = $('.update-progress > div');
      if (bar) bar.style.width = Math.round((p.ratio || 0) * 100) + '%';
      const st = $('.update-status');
      if (st && !p.done && p.total) st.textContent = `Downloading update… ${(p.got / 1048576).toFixed(1)} of ${(p.total / 1048576).toFixed(1)} MB`;
    });
    // quiet check a few seconds after start-up; the button turns green if an update exists
    setTimeout(() => check({ silent: true }), 4000);
  }

  return { init, check, onClick };
})();
