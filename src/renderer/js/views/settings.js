// Settings
Views.settings = {
  live: false,
  render(root) {
    const pr = State.prefs();
    const s = State.settings();
    const me = State.activeProfile();
    const info = State.S.info;
    const ACCENTS = ['#8b7bff', '#2de2c9', '#1ed760', '#509bf5', '#9b6bff', '#f037a5', '#ff5f5f', '#f59b23', '#ffd166', '#ffffff'];

    const el = html(`<div class="settings">
      <h1 class="settings-title">Settings</h1>

      <section><h2>Profile</h2>
        <div class="set-row"><div><b>${UI.avatarHtml(me, 28)} ${esc(me.name)}</b><span>Each profile keeps its own library, likes, history and appearance.</span></div><div class="set-actions"><button class="btn-outline sm s-edit">Edit profile</button><button class="btn-outline sm s-switch">Switch profile</button></div></div>
        <div class="set-row"><div><b>Ask "Who's listening?" on startup</b><span>Show the profile picker every time Aurora opens.</span></div><input type="checkbox" class="toggle s-ask" ${State.S.profiles.askOnStartup ? 'checked' : ''}/></div>
      </section>

      <section><h2>Discord Connection</h2>
        <div class="set-row"><div><b>${icon('discord', 18)} Show what you're listening to on Discord</b><span>Needs the Discord desktop app running on this PC.</span></div><div class="set-actions"><input type="checkbox" class="toggle s-dc" ${State.settings().discordEnabled ? 'checked' : ''}/><button class="btn-outline sm s-dc-open">Options</button></div></div>
      </section>

      <section><h2>Appearance</h2>
        <div class="set-row"><div><b>${icon('bag', 18)} Aurora Store</b><span>Themes, fonts, player styles and effects in one place.</span></div><button class="btn-accent sm s-store">Open Store</button></div>
        <div class="set-row"><div><b>Accent colour</b><span>Used for play buttons, toggles and highlights.</span></div><div class="accent-row">${ACCENTS.map((c) => `<button class="swatch ${pr.accent === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}<label class="swatch custom" title="Custom colour"><input type="color" value="${esc(pr.accent || '#1ed760')}" /></label></div></div>
        <div class="set-row"><div><b>Show the Now Playing panel</b><span>Display the right-hand panel with artwork and video.</span></div><input type="checkbox" class="toggle s-rp" ${pr.showRightPanel ? 'checked' : ''}/></div>
        <div class="set-row"><div><b>Show "Featured" card on Home</b></div><input type="checkbox" class="toggle s-hero" ${!pr.heroHidden ? 'checked' : ''}/></div>
        <div class="set-row col"><div><b>Custom CSS</b><span>Change anything about how Aurora looks. Applied instantly and saved with the app. Try <code>:root { --bg-elevated: #1a1a2e; }</code></span></div>
          <textarea class="input code s-css" spellcheck="false" placeholder="/* your CSS here */">${esc(s.customCss || '')}</textarea>
          <div class="set-actions"><button class="btn-outline sm s-css-folder">Open custom folder (user.css / user.js)</button><button class="btn-outline sm s-reload">Reload Aurora</button></div>
        </div>
      </section>

      <section><h2>Library</h2>
        <div class="set-row col"><div><b>Music folders</b><span>Aurora scans these folders on startup and adds new files to your library.</span></div>
          <div class="folder-list">${s.musicFolders.map((f, i) => `<div class="folder-item"><span data-icon="folder" data-icon-size="16"></span><span class="fp" title="${esc(f)}">${esc(f)}</span><button class="icon-btn small s-rm" data-i="${i}" data-icon="close" title="Remove"></button></div>`).join('') || '<span class="muted">No folders yet.</span>'}</div>
          <div class="set-actions"><button class="btn-outline sm s-addf">Add a folder</button><button class="btn-outline sm s-rescan">Rescan now</button><button class="btn-outline sm s-files">Import files</button></div>
        </div>
        <div class="set-row"><div><b>Clean up library</b><span>Remove entries whose files were moved or deleted.</span></div><button class="btn-outline sm s-clean">Clean up</button></div>
      </section>

      <section><h2>Downloads</h2>
        <div class="set-row"><div><b>Download location</b><span class="s-dldir">${esc(s.downloadDir)}</span></div><div class="set-actions"><button class="btn-outline sm s-dlchange">Change</button><button class="btn-outline sm s-dlopen">Open</button></div></div>
        <div class="set-row"><div><b>Default format</b></div><div class="dl-select"><select class="s-fmt">${[['video-best', 'Video · Best (MP4)'], ['video-1080', 'Video · 1080p'], ['video-720', 'Video · 720p'], ['audio-mp3', 'Audio · MP3'], ['audio-m4a', 'Audio · M4A']].map(([k, l]) => `<option value="${k}" ${s.dlFormat === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span data-icon="chevronDown" data-icon-size="16"></span></div></div>
        <div class="set-row"><div><b>Add downloads to Library</b></div><input type="checkbox" class="toggle s-dllib" ${s.dlAddToLibrary ? 'checked' : ''}/></div>
        ${native.dl && native.dl.trim ? `<div class="set-row"><div><b>Cut silent endings</b><span>When a download keeps going after the music stops, cut it where the sound ends.</span></div><input type="checkbox" class="toggle s-trim" ${s.trimSilence !== false ? 'checked' : ''}/></div>
        <div class="set-row"><div><b>Fix songs already downloaded</b><span class="s-trim-status">Check every song and video in your library for a silent ending and cut it.</span></div><button class="btn-outline sm s-trim-all">Fix now</button></div>` : ''}
      </section>

      <section><h2>Advanced</h2>
        <div class="set-row"><div><b>Developer tools</b><span>Inspect and live-edit the interface.</span></div><button class="btn-outline sm s-dev">Open</button></div>
        <div class="set-row"><div><b>App data folder</b><span>${esc(info.userData)}</span></div><button class="btn-outline sm s-data">Open</button></div>
        <div class="set-row"><div><b>Reset appearance</b><span>Restore the default accent, layout and panel sizes for this profile.</span></div><button class="btn-outline sm s-reset">Reset</button></div>
      </section>

      <section><h2>About</h2>
        <div class="set-row"><div><b>Aurora ${esc(info.version)}</b><span>Electron ${esc(info.electron)} · Source code, version history and releases are on GitHub.</span></div><div class="set-actions"><button class="btn-outline sm s-gh">${icon('github', 14)} GitHub</button><button class="btn-outline sm s-about">About</button></div></div>
      </section>
      <div class="view-footer"></div>
    </div>`);
    root.appendChild(el);
    const q = (sel) => $(sel, el);

    q('.s-store').onclick = () => App.go('store');
    q('.s-dc').onchange = (e) => DiscordConn.setEnabled(e.target.checked);
    q('.s-dc-open').onclick = () => App.go('discord');
    q('.s-edit').onclick = () => Views.profile.editModal(me, () => App.render());
    q('.s-switch').onclick = () => App.showProfilePicker();
    q('.s-ask').onchange = (e) => { State.S.profiles.askOnStartup = e.target.checked; native.store.write('profiles', State.S.profiles); };

    const setAccent = (c) => { State.setPref('accent', c); App.applyTheme(); $$('.swatch', el).forEach((x) => x.classList.toggle('on', x.dataset.c === c)); };
    $$('.accent-row .swatch[data-c]', el).forEach((sw) => sw.onclick = () => setAccent(sw.dataset.c));
    q('.accent-row input[type=color]').oninput = (e) => setAccent(e.target.value);
    q('.s-rp').onchange = (e) => { State.setPref('showRightPanel', e.target.checked); App.applyTheme(); App.renderRightPanel(); };
    q('.s-hero').onchange = (e) => State.setPref('heroHidden', !e.target.checked);
    q('.s-css').addEventListener('input', debounce((e) => { State.setSetting('customCss', e.target.value); App.applyTheme(); }, 250));
    q('.s-css-folder').onclick = () => native.shell.openPath(info.customDir);
    q('.s-reload').onclick = () => native.app.reload();

    $$('.s-rm', el).forEach((b) => b.onclick = () => { const f = s.musicFolders.slice(); f.splice(+b.dataset.i, 1); State.setSetting('musicFolders', f); App.render(); });
    q('.s-addf').onclick = async () => { await App.importFolder(); App.render(); };
    q('.s-rescan').onclick = async () => { UI.toast('Rescanning…'); await App.rescanFolders(); UI.toast('Library updated'); };
    q('.s-files').onclick = () => App.importFiles();
    q('.s-clean').onclick = async () => {
      const all = State.allTracks();
      const ex = await native.library.exists(all.map((t) => t.path));
      const gone = all.filter((_, i) => !ex[i]).map((t) => t.id);
      if (gone.length) State.removeTracks(gone);
      UI.toast(gone.length ? `Removed ${gone.length} missing item${gone.length === 1 ? '' : 's'}` : 'Everything is in place');
    };

    q('.s-dlchange').onclick = async () => { const d = await native.dialog.folder('Choose download folder'); if (d) { State.setSetting('downloadDir', d); q('.s-dldir').textContent = d; } };
    q('.s-dlopen').onclick = () => native.shell.openPath(State.settings().downloadDir);
    q('.s-fmt').onchange = (e) => State.setSetting('dlFormat', e.target.value);
    q('.s-dllib').onchange = (e) => State.setSetting('dlAddToLibrary', e.target.checked);
    if (q('.s-trim')) {
      q('.s-trim').onchange = (e) => State.setSetting('trimSilence', e.target.checked);
      q('.s-trim-all').onclick = async (e) => {
        const btn = e.currentTarget, status = q('.s-trim-status');
        const list = State.allTracks().filter((t) => t.path && !t.trimChecked);
        if (!list.length) return UI.toast('Every song has already been checked');
        btn.disabled = true;
        let fixed = 0, saved = 0;
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          status.textContent = `Checking ${i + 1} of ${list.length}: ${t.title}`;
          try {
            const r = await native.dl.trim(t);
            if (r && r.ok) {
              const patch = { trimChecked: true };
              if (r.trimmed) { saved += Math.max(0, (t.duration || r.duration) - r.duration); patch.duration = r.duration; patch.size = r.size; fixed++; }
              else if (r.end < r.duration - 1.5) { patch.end = r.end; saved += r.duration - r.end; fixed++; }
              State.updateTrack(t.id, patch);
            }
          } catch {}
        }
        btn.disabled = false;
        status.textContent = fixed ? `Cut the silent ending off ${fixed} item${fixed === 1 ? '' : 's'} (${fmtTime(saved)} of silence removed).` : 'No silent endings found.';
      };
    }

    q('.s-dev').onclick = () => native.app.devtools();
    q('.s-data').onclick = () => native.shell.openPath(info.userData);
    q('.s-reset').onclick = () => {
      Object.assign(State.prefs(), { accent: '#8b7bff', showRightPanel: true, sidebarWidth: 420, rpWidth: 420, sidebarCollapsed: false, heroHidden: false });
      State.setPref('accent', '#8b7bff');
      App.applyTheme(); App.renderRightPanel(); App.render();
    };
    q('.s-gh').onclick = () => native.shell.openExternal(App.REPO);
    q('.s-about').onclick = App.about;
  },
};
