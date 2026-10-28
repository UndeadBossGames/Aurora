// Discord Connection page
Views.discord = {
  live: false,
  render(root) {
    App.setHeaderColor('rgba(88, 101, 242, .55)');
    const el = html(`<div class="dc-page">
      <div class="coll-header dc-header">
        <div class="dc-hero">${icon('discord', 110)}</div>
        <div class="coll-meta">
          <div class="coll-type">Connection</div>
          <h1 class="coll-title">Discord Connection</h1>
          <div class="coll-desc">Show what you're listening to in Aurora on your Discord profile, with the song, artist, artwork and a live progress bar.</div>
        </div>
      </div>
      <div class="dc-grid">
        <div class="dc-card dc-status-card"></div>
        <div class="dc-card">
          <h3>Preview</h3>
          <div class="dc-preview-host"></div>
          <div class="dc-msg">This is roughly how your status looks to friends on Discord.</div>
        </div>
      </div>
      <div class="dc-card dc-options" style="margin-bottom:32px">
        <h3>What to share</h3>
        <label class="dc-opt"><span>Show album cover and artist photo<small>Looks up the album art and a photo of the artist online (via Deezer). The artist photo appears in the small bubble.</small></span><input type="checkbox" class="toggle" data-k="discordLookupArt"></label>
        <label class="dc-opt"><span>Show song progress<small>Displays elapsed and remaining time.</small></span><input type="checkbox" class="toggle" data-k="discordShowProgress"></label>
        <label class="dc-opt"><span>Keep showing while paused<small>Otherwise your status clears when you pause.</small></span><input type="checkbox" class="toggle" data-k="discordShowPaused"></label>
        <label class="dc-opt"><span>Show "Open on…" button<small>For downloaded songs, friends can open the original YouTube/SoundCloud page.</small></span><input type="checkbox" class="toggle" data-k="discordShowButton"></label>
        <details class="dc-advanced"><summary>Advanced</summary>
          <div class="dc-msg" style="margin-top:8px">Use your own Discord application (from discord.com/developers). Leave empty to use Aurora's.</div>
          <input class="input dc-appid" placeholder="Application ID" spellcheck="false" />
        </details>
      </div>
      <div class="view-footer"></div>
    </div>`);
    root.appendChild(el);

    const o = DiscordConn.opts();
    const vals = { discordLookupArt: o.lookupArt, discordShowProgress: o.showProgress, discordShowPaused: o.showPaused, discordShowButton: o.showButton };
    $$('.dc-options input[data-k]', el).forEach((cb) => {
      cb.checked = vals[cb.dataset.k];
      cb.onchange = () => { DiscordConn.setOption(cb.dataset.k, cb.checked); drawPreview(); };
    });
    const appid = $('.dc-appid', el);
    appid.value = State.settings().discordClientId || '';
    appid.addEventListener('change', () => DiscordConn.setOption('discordClientId', appid.value.trim()));

    const drawStatus = (s) => {
      const card = $('.dc-status-card', el);
      if (!card) return;
      const enabled = DiscordConn.opts().enabled;
      const st = enabled ? s.state : 'off';
      const label = { off: 'Not connected', connecting: 'Connecting…', connected: 'Connected', waiting: 'Waiting for Discord', error: 'Connection problem' }[st] || st;
      const u = s.user;
      card.innerHTML = `
        <h3>Status</h3>
        <div class="dc-status">
          <div class="dc-avatar">${u && u.avatar ? `<img src="${esc(u.avatar)}" />` : icon('discord', 30)}</div>
          <div><b>${u && st === 'connected' ? esc(u.username) : 'Discord'}</b><span class="dc-state"><span class="dc-dot ${st}"></span>${esc(label)}</span></div>
        </div>
        <div class="dc-msg">${st === 'off' ? 'Turn this on and keep the Discord desktop app open on this PC. No password or login is needed.'
          : st === 'connected' ? 'Your Discord profile now shows what you\'re listening to. In Discord, check that User Settings → Activity Privacy → "Share your detected activities with others" is on.'
          : esc(s.error || 'Looking for the Discord desktop app…')}</div>
        <div class="dc-actions">${enabled
          ? '<button class="btn-outline sm dc-off">Disconnect</button>'
          : `<button class="btn-discord dc-on">${icon('discord', 20)} Connect Discord</button>`}</div>`;
      const on = $('.dc-on', card), off = $('.dc-off', card);
      if (on) on.onclick = () => DiscordConn.setEnabled(true);
      if (off) off.onclick = () => DiscordConn.setEnabled(false);
    };

    const drawPreview = () => {
      const host = $('.dc-preview-host', el);
      if (!host) return;
      const np = DiscordConn.nowPlaying();
      const o2 = DiscordConn.opts();
      if (!np || (!np.playing && !o2.showPaused)) {
        host.innerHTML = `<div class="dc-preview"><div class="dc-preview-label">Nothing is shown while Aurora isn't playing.</div></div>`;
        return;
      }
      const t = Player.current;
      const art = o2.lookupArt ? DiscordConn.currentArt() : { album: null, artist: null };
      const big = art.album || UI.coverSrc(t);
      const pct = np.duration ? Math.min(100, (np.position / np.duration) * 100) : 0;
      host.innerHTML = `<div class="dc-preview">
        <div class="dc-preview-label">Listening to Aurora</div>
        <div class="dc-preview-row">
          <div class="dc-preview-art"><img class="big" src="${esc(big)}" /><span class="small" title="${art.artist ? esc(np.artist) : 'Aurora'}">${art.artist ? `<img src="${esc(art.artist)}" />` : icon('aurora', 16)}</span></div>
          <div class="dc-preview-text"><div class="t">${esc(np.title)}</div><div>${np.playing ? 'by ' : 'Paused · '}${esc(np.artist)}</div><div>${esc(np.album || 'Aurora')}</div></div>
        </div>
        ${np.playing && o2.showProgress && np.duration ? `<div class="dc-preview-bar"><span>${fmtTime(np.position)}</span><div class="track"><div style="width:${pct}%"></div></div><span>${fmtTime(np.duration)}</span></div>` : ''}
        ${o2.showButton && np.url ? `<div class="dc-preview-btn">Open on ${esc(np.source || 'the web')}</div>` : ''}
      </div>`;
    };

    drawStatus(DiscordConn.status);
    drawPreview();
    const off1 = DiscordConn.onChange(drawStatus);
    const tick = setInterval(drawPreview, 1000);
    return () => { off1(); clearInterval(tick); };
  },
};
