// Aurora Store page
Views.store = {
  live: false,
  render(root, tab) {
    tab = tab || 'featured';
    const s = Store.sel();
    App.setHeaderColor('rgba(255, 122, 89, .35)');
    const el = html(`<div class="st-page">
      <div class="st-hero">
        <div class="st-hero-text">
          <div class="hd-eyebrow">${icon('bag', 14)} Aurora Store</div>
          <h1>Make Aurora yours</h1>
          <p>Themes, fonts, player styles and effects. Everything is free, and one click applies it to this profile.</p>
          <div class="st-hero-actions"><button class="btn-white sm st-export">${icon('download', 14)} Export my theme</button><label class="btn-outline sm st-import">${icon('import', 14)} Import theme<input type="file" accept=".json,application/json" hidden /></label></div>
        </div>
        <div class="st-hero-art">${Store.THEMES.slice(0, 5).map((t, i) => `<span style="--a:${t.accent};--b:${t.accent2};--bg:${t.base};--i:${i}"></span>`).join('')}</div>
      </div>
      <div class="st-tabs"></div>
      <div class="st-body"></div>
      <div class="view-footer"></div>
    </div>`);
    root.appendChild(el);

    const tabs = [['featured', '✨ Featured'], ['bundles', 'Bundles'], ['themes', `Themes · ${Store.allThemes().length}`], ['fonts', 'Fonts'], ['profile', 'Profile effects'], ['player', 'Player'], ['effects', 'App effects'], ['installed', 'Applied']];
    const tabsEl = $('.st-tabs', el);
    tabs.forEach(([k, l]) => {
      const b = html(`<button class="chip ${tab === k ? 'active' : ''}">${l}</button>`);
      b.onclick = () => App.go('store', k, { replace: true });
      tabsEl.appendChild(b);
    });

    $('.st-export', el).onclick = () => { Store.exportTheme(); UI.toast('Choose where to save your theme file'); };
    $('.st-import input', el).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { const t = await Store.importTheme(f); Store.applyTheme(t.id); UI.toast(`Installed "${t.name}"`); App.render(); } catch (err) { UI.toast(err.message || 'Import failed', 4500); }
    };

    const body = $('.st-body', el);
    const section = (title, sub) => { const sct = html(`<section class="st-section"><div class="shelf-head"><h2 class="shelf-title">${esc(title)}</h2></div>${sub ? `<div class="shelf-subtitle">${esc(sub)}</div>` : ''}<div class="st-grid"></div></section>`); body.appendChild(sct); return $('.st-grid', sct); };

    const themeCard = (t) => {
      const on = s.theme === t.id;
      const c = html(`<div class="st-card ${on ? 'on' : ''}">
        <div class="st-preview" style="--a:${t.accent};--b:${t.accent2};--bg:${t.bg};--base:${t.base};--elev:${t.elev};--sub:${t.sub}">
          <div class="sp-side"><i></i><i></i><i></i><i></i></div>
          <div class="sp-main"><div class="sp-hdr"></div><div class="sp-row"><i></i><i></i><i></i></div><div class="sp-fab"></div></div>
          <div class="sp-player"><i></i><b></b><i></i></div>
          ${t.tag === 'New' ? '<span class="st-new">NEW</span>' : ''}
        </div>
        <div class="st-info"><div class="st-name">${esc(t.name)} ${t.tag && t.tag !== 'New' ? `<span class="st-tag">${esc(t.tag)}</span>` : ''}</div><div class="st-desc">${esc(t.desc || '')}</div></div>
        <div class="st-actions"><button class="${on ? 'btn-outline' : 'btn-accent'} sm st-apply">${on ? icon('check', 14) + ' Applied' : 'Apply'}</button>${on ? '' : `<button class="btn-ghost sm st-try">${icon('play', 12)} Try</button>`}${t.id.startsWith('custom-') ? '<button class="icon-btn small st-del" title="Remove">' + icon('trash', 16) + '</button>' : ''}</div>
      </div>`);
      $('.st-apply', c).onclick = () => { Store.endPreview(true); Store.applyTheme(t.id); UI.toast(`Theme: ${t.name}`); App.render(); };
      const tr = $('.st-try', c);
      if (tr) tr.onclick = () => tryTheme(t);
      const del = $('.st-del', c);
      if (del) del.onclick = () => { Store.removeCustom(t.id); App.render(); };
      c.addEventListener('mouseenter', () => App.setHeaderColor(t.accent + '55'));
      return c;
    };

    // "Try" a theme: preview the whole app for a moment, then keep or undo
    const tryTheme = (t) => {
      Store.previewTheme(t.id);
      $$('.st-trybar').forEach((x) => x.remove());
      const bar = html(`<div class="st-trybar"><span>${icon('sparkle', 16)} Previewing <b>${esc(t.name)}</b></span><button class="btn-ghost sm st-undo">Undo</button><button class="btn-accent sm st-keep">Keep it</button></div>`);
      $('.st-undo', bar).onclick = () => { Store.endPreview(false); bar.remove(); };
      $('.st-keep', bar).onclick = () => { Store.endPreview(true); Store.applyTheme(t.id); bar.remove(); App.render(); UI.toast(`Theme: ${t.name}`); };
      document.body.appendChild(bar);
      clearTimeout(Views.store._tt);
      Views.store._tt = setTimeout(() => { if (bar.isConnected) { Store.endPreview(false); bar.remove(); } }, 15000);
    };

    const fxIcon = { animatedBg: 'sparkle', glass: 'browse', albumGlow: 'music', rounded: 'aurora', bigArt: 'expand', glowbar: 'sparkle', rainbowbar: 'sparkle', eq: 'queue', vinyl: 'music', backdrop: 'browse', pulseplay: 'play', wave: 'volHigh' };
    const optionCard = (item, kind) => {
      const me = State.activeProfile() || {};
      const on = kind === 'effects' ? !!(s.effects || {})[item.id] : kind === 'playerFx' ? !!(s.playerFx || {})[item.id] : kind === 'profileEffect' ? (me.effect || '') === item.id : s[kind] === item.id;
      const visual = kind === 'font'
        ? `<div class="st-font" style="font-family:${item.display}">${item.sample}<small style="font-family:${item.body}">The quick brown fox</small></div>`
        : kind === 'player'
          ? `<div class="st-player st-player-${item.id}"><span class="spp-cover"></span><span class="spp-lines"><i></i><i></i></span><span class="spp-play"></span><span class="spp-bar"></span></div>`
          : kind === 'profileEffect'
            ? `<div class="st-profile-fx"><span class="pf-av-wrap" data-effect="${item.id}">${UI.avatarHtml(me, 64)}<span class="pf-fx"></span></span></div>`
            : kind === 'playerFx'
              ? `<div class="st-pfx st-pfx-${item.id}"><span class="pfx-cover"></span><span class="pfx-bar"><i></i></span><span class="pfx-play"></span><span class="pfx-eq"><i></i><i></i><i></i><i></i><i></i><i></i></span></div>`
              : `<div class="st-effect st-fx-${item.id}">${icon(fxIcon[item.id] || 'sparkle', 40)}</div>`;
      const toggle = kind === 'effects' || kind === 'playerFx';
      const c = html(`<div class="st-card small ${on ? 'on' : ''}">
        ${visual}
        ${item.tag === 'New' ? '<span class="st-new">NEW</span>' : ''}
        <div class="st-info"><div class="st-name">${esc(item.name)}</div><div class="st-desc">${esc(item.desc)}</div></div>
        <div class="st-actions">${toggle
          ? `<label class="dc-opt" style="padding:0"><span>${on ? 'On' : 'Off'}</span><input type="checkbox" class="toggle" ${on ? 'checked' : ''} /></label>`
          : `<button class="${on ? 'btn-outline' : 'btn-accent'} sm st-apply">${on ? icon('check', 14) + ' Applied' : 'Apply'}</button>`}</div>
      </div>`);
      if (toggle) {
        $('input', c).onchange = (e) => { const k = kind; Store.save({ ...Store.sel(), [k]: { ...(Store.sel()[k] || {}), [item.id]: e.target.checked } }); Store.updateAlbumColor(); App.render(); };
      } else if (kind === 'profileEffect') {
        $('.st-apply', c).onclick = () => { State.updateProfile(me.id, { effect: item.id }); UI.toast(item.id ? `${item.name} added to your profile` : 'Profile effect removed'); App.render(); };
      } else {
        $('.st-apply', c).onclick = () => { Store.save({ ...Store.sel(), [kind]: item.id }); UI.toast(`${item.name} applied`); App.render(); };
      }
      return c;
    };

    const bundleCard = (b) => {
      const t = Store.THEMES.find((x) => x.id === b.theme) || Store.THEMES[0];
      const c = html(`<div class="st-bundle" style="--a:${t.accent};--b:${t.accent2};--bg:${t.bg}">
        <div class="stb-art"><span></span><span></span><span></span></div>
        <div class="stb-text"><span class="st-tag">Bundle</span><h3>${esc(b.name)}</h3><p>${esc(b.desc)}</p>
          <button class="btn-white sm stb-get">${icon('sparkle', 14)} Get the look</button></div>
      </div>`);
      $('.stb-get', c).onclick = () => { Store.applyBundle(b.id); UI.toast(`"${b.name}" applied`); App.render(); };
      return c;
    };

    if (tab === 'featured') {
      const hero = html('<div class="st-bundles"></div>');
      Store.BUNDLES.forEach((b) => hero.appendChild(bundleCard(b)));
      const sec = html(`<section class="st-section"><div class="shelf-head"><h2 class="shelf-title">Bundles</h2></div><div class="shelf-subtitle">A complete look in one click: theme, font, profile effect and player effects</div></section>`);
      sec.appendChild(hero);
      body.appendChild(sec);
      const g = section('New themes', 'Fresh color schemes for this update');
      Store.THEMES.filter((t) => t.tag === 'New').slice(0, 4).forEach((t) => g.appendChild(themeCard(t)));
      const g4 = section('Profile effects', 'Your picture, but cooler. Friends see it too');
      Store.PROFILE_EFFECTS.slice(1, 5).forEach((e) => g4.appendChild(optionCard(e, 'profileEffect')));
      const g2 = section('Player effects', 'Make the song player come alive');
      Store.PLAYER_FX.slice(0, 4).forEach((it) => g2.appendChild(optionCard(it, 'playerFx')));
    } else if (tab === 'bundles') {
      const sec = html('<div class="st-bundles"></div>');
      Store.BUNDLES.forEach((b) => sec.appendChild(bundleCard(b)));
      body.appendChild(sec);
    } else if (tab === 'themes') {
      const g = section('Themes', `${Store.allThemes().length} themes · Press "Try" to preview one across the whole app`);
      Store.allThemes().forEach((t) => g.appendChild(themeCard(t)));
    } else if (tab === 'fonts') {
      const g = section('Fonts', `${Store.FONTS.length} type styles`);
      Store.FONTS.forEach((f) => g.appendChild(optionCard(f, 'font')));
    } else if (tab === 'profile') {
      const g = section('Profile effects', 'Animated effects around your profile picture. Shown on your profile, in the menu and to friends');
      Store.PROFILE_EFFECTS.forEach((e) => g.appendChild(optionCard(e, 'profileEffect')));
    } else if (tab === 'player') {
      const g = section('Player styles');
      Store.PLAYERS.forEach((p) => g.appendChild(optionCard(p, 'player')));
      const g2 = section('Player effects', 'Turn on as many as you like');
      Store.PLAYER_FX.forEach((e) => g2.appendChild(optionCard(e, 'playerFx')));
    } else if (tab === 'effects') {
      const g = section('App effects', 'Mix and match, turn on as many as you like');
      Store.EFFECTS.forEach((e) => g.appendChild(optionCard(e, 'effects')));
    } else {
      const t = Store.allThemes().find((x) => x.id === s.theme) || Store.THEMES[0];
      const me = State.activeProfile() || {};
      const g = section('Applied to this profile');
      g.appendChild(themeCard(t));
      g.appendChild(optionCard(Store.FONTS.find((f) => f.id === s.font) || Store.FONTS[0], 'font'));
      g.appendChild(optionCard(Store.PLAYERS.find((p) => p.id === s.player) || Store.PLAYERS[0], 'player'));
      if (me.effect) g.appendChild(optionCard(Store.PROFILE_EFFECTS.find((e) => e.id === me.effect) || Store.PROFILE_EFFECTS[0], 'profileEffect'));
      Store.EFFECTS.filter((e) => (s.effects || {})[e.id]).forEach((e) => g.appendChild(optionCard(e, 'effects')));
      Store.PLAYER_FX.filter((e) => (s.playerFx || {})[e.id]).forEach((e) => g.appendChild(optionCard(e, 'playerFx')));
      const reset = html(`<div style="margin-top:8px"><button class="btn-outline sm">Reset to Aurora defaults</button></div>`);
      $('button', reset).onclick = () => { Store.save({ theme: 'aurora-night', font: 'default', player: 'dock', effects: {}, playerFx: {}, custom: s.custom || [] }); Store.applyTheme('aurora-night'); App.render(); };
      body.appendChild(reset);
    }
  },
};
