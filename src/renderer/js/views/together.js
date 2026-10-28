// Listen Together page
Views.together = {
  live: false,
  render(root) {
    App.setHeaderColor('rgba(255, 63, 164, .35)');
    const host = html('<div class="lt-page"></div>');
    root.appendChild(host);

    const draw = () => {
      const S = ListenTogether.state;
      host.innerHTML = '';
      if (!S.role) return drawLobby();
      drawSession(S);
    };

    const drawLobby = () => {
      const el = html(`<div>
        <div class="lt-hero">
          <div class="lt-hero-art"><span></span><span></span><span></span>${icon('headphones', 64)}</div>
          <div class="lt-hero-text">
            <div class="hd-eyebrow">${icon('sparkle', 14)} Listen Together</div>
            <h1>Same song. Same second.</h1>
            <p>Start a session and share the code. Everyone who joins hears exactly what you're playing, in sync. If someone doesn't have the song, Aurora gets it for them automatically.</p>
          </div>
        </div>
        <div class="lt-cards">
          <div class="dc-card lt-start">
            <h3>${icon('headphones', 18)} Host a session</h3>
            <div class="dc-msg">You're the DJ: whatever you play, pause or skip happens for everyone.</div>
            <button class="btn-accent lt-host-btn">${icon('play', 16)} Start session</button>
          </div>
          <div class="dc-card">
            <h3>${icon('link', 18)} Join a session</h3>
            <div class="fr-add-row"><input class="input lt-code-in" placeholder="LT-XXXXXX" maxlength="12" spellcheck="false" /><button class="btn-accent sm lt-join-btn">Join</button></div>
            <div class="dc-msg">Ask the host for their session code, or join a friend straight from your Friends page.</div>
          </div>
        </div>
        <div class="lt-friends"></div>
      </div>`);
      $('.lt-host-btn', el).onclick = () => {
        const code = ListenTogether.host();
        if (!Player.current) UI.toast(`Session ${code} started. Play something and your friends will hear it too!`, 5000);
        else UI.toast(`Session ${code} started`);
      };
      const join = () => { try { ListenTogether.join($('.lt-code-in', el).value); } catch (e) { UI.toast(e.message, 4000); } };
      $('.lt-join-btn', el).onclick = join;
      $('.lt-code-in', el).addEventListener('keydown', (e) => e.key === 'Enter' && join());
      // friends who are hosting right now
      const live = Friends.friends().map((f) => ({ f, p: Friends.statusOf(f.code) })).filter(({ p }) => p.together && p.status !== 'offline');
      if (live.length) {
        const box = $('.lt-friends', el);
        box.appendChild(html(`<h2 class="shelf-title" style="margin:8px 0 12px">Friends hosting now</h2>`));
        for (const { f, p } of live) {
          const row = html(`<div class="fr-card listening"><div class="fr-av" style="background:${esc(p.color || '#8b7bff')}">${p.avatar ? `<img src="${esc(p.avatar)}">` : esc((f.nickname || p.name || '?')[0])}</div>
            <div class="fr-main"><div class="fr-name">${esc(f.nickname || p.name)}</div><div class="fr-state">${p.track ? `${esc(p.track.title)} · ${esc(p.track.artist)}` : 'Picking a song…'}</div></div>
            <div class="fr-actions"><button class="btn-accent sm">${icon('headphones', 14)} Join</button></div></div>`);
          $('button', row).onclick = () => ListenTogether.join(p.together);
          box.appendChild(row);
        }
      }
      host.appendChild(el);
    };

    const drawSession = (S) => {
      const isHost = S.role === 'host';
      const st = S.hostState;
      const t = isHost ? Player.current : st && st.track;
      const cover = isHost ? (t ? UI.coverSrc(t) : null) : (t && t.cover) || (Player.current ? UI.coverSrc(Player.current) : null);
      const members = [...S.members.values()].sort((a, b) => (a.role === 'host' ? -1 : 1) - (b.role === 'host' ? -1 : 1));
      const syncCls = isHost ? 'synced' : S.sync.status;
      const el = html(`<div class="lt-session">
        <div class="lt-stage">
          <div class="lt-bg" style="${cover ? `background-image:url('${esc(cover)}')` : ''}"></div>
          <div class="lt-stage-inner">
            <div class="lt-cover">${cover ? `<img src="${esc(cover)}">` : icon('music', 64)}<span class="lt-ring ${(isHost ? Player.playing : st && st.playing) ? 'on' : ''}"></span></div>
            <div class="lt-now">
              <div class="lt-role"><span class="lt-badge ${isHost ? 'host' : ''}">${isHost ? 'You are hosting' : `Listening with ${esc((st && st.host && st.host.name) || 'the host')}`}</span>
                <span class="lt-sync ${syncCls}"><span class="dc-dot ${syncCls === 'synced' ? 'connected' : syncCls === 'error' ? 'error' : 'connecting'}"></span>${esc(isHost ? (S.conn === 'connected' ? 'Live' : 'Connecting…') : S.sync.note || '')}${!isHost && S.sync.status === 'fetching' && S.sync.progress ? ` ${Math.round(S.sync.progress)}%` : ''}</span></div>
              <div class="lt-title">${t ? esc(t.title) : 'Nothing playing yet'}</div>
              <div class="lt-artist">${t ? esc(t.artist) : isHost ? 'Play any song and everyone will hear it' : 'Waiting for the host to pick a song'}</div>
              <div class="lt-code"><span class="muted">Session code</span><b>${esc(S.code)}</b><button class="btn-outline sm lt-copy">${icon('paste', 14)} Copy</button></div>
              <div class="lt-actions">
                ${!isHost && !S.following ? `<button class="btn-accent sm lt-resync">${icon('refresh', 14)} Resync</button>` : ''}
                ${!isHost ? `<button class="btn-outline sm lt-resync2">${icon('refresh', 14)} Resync now</button>` : ''}
                <button class="btn-outline sm lt-leave">${icon('logout', 14)} ${isHost ? 'End session' : 'Leave'}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="lt-cols">
          <div class="dc-card lt-members"><h3>${icon('users', 18)} In this session <span class="muted">· ${members.length}</span></h3>
            ${members.map((m) => `<div class="lt-member"><span class="avatar-img" style="width:34px;height:34px;font-size:15px;background:${esc(m.color || '#8b7bff')}">${esc((m.name || '?')[0].toUpperCase())}</span><span>${esc(m.name)}</span>${m.role === 'host' ? '<span class="lt-badge host sm">Host</span>' : ''}</div>`).join('') || '<div class="dc-msg">Share the code so friends can join.</div>'}
          </div>
          <div class="dc-card lt-chat"><h3>${icon('sparkle', 18)} Chat</h3>
            <div class="lt-msgs scroll">${S.chat.map((m) => `<div class="lt-msg ${m.id === ListenTogether.me.id ? 'mine' : ''}"><b style="color:${esc(m.color || '#fff')}">${esc(m.name)}</b><span>${esc(m.text)}</span></div>`).join('') || '<div class="dc-msg">Say hi 👋</div>'}</div>
            <div class="lt-reacts">${['🔥', '😍', '🎶', '😂', '👏', '💜'].map((e) => `<button class="lt-react">${e}</button>`).join('')}</div>
            <div class="fr-add-row"><input class="input lt-say" placeholder="Send a message…" maxlength="300" /><button class="btn-accent sm lt-send">Send</button></div>
          </div>
        </div>
      </div>`);
      $('.lt-copy', el).onclick = () => navigator.clipboard.writeText(S.code).then(() => UI.toast('Session code copied'));
      $('.lt-leave', el).onclick = () => ListenTogether.leave();
      const rs = $('.lt-resync', el); if (rs) rs.onclick = () => ListenTogether.resync();
      const rs2 = $('.lt-resync2', el); if (rs2) rs2.onclick = () => ListenTogether.resync();
      const send = () => { const i = $('.lt-say', el); ListenTogether.say(i.value); i.value = ''; };
      $('.lt-send', el).onclick = send;
      $('.lt-say', el).addEventListener('keydown', (e) => e.key === 'Enter' && send());
      $$('.lt-react', el).forEach((b) => b.onclick = () => ListenTogether.say(b.textContent));
      host.appendChild(el);
      const msgs = $('.lt-msgs', el);
      msgs.scrollTop = msgs.scrollHeight;
    };

    draw();
    // redraw on changes, but don't wipe a message the user is typing
    const off = ListenTogether.onChange(debounce(() => {
      const typing = document.activeElement && document.activeElement.classList.contains('lt-say') ? document.activeElement.value : null;
      draw();
      if (typing !== null) { const i = $('.lt-say', host); if (i) { i.value = typing; i.focus(); } }
    }, 250));
    return () => { off(); };
  },
};
