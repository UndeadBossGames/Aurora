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

    const tabs = [['featured', 'Featured'], ['themes', 'Themes'], ['fonts', 'Fonts'], ['player', 'Player'], ['effects', 'Effects'], ['installed', 'Applied']];
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
        </div>
        <div class="st-info"><div class="st-name">${esc(t.name)} ${t.tag ? `<span class="st-tag">${esc(t.tag)}</span>` : ''}</div><div class="st-desc">${esc(t.desc || '')}</div></div>
        <div class="st-actions"><button class="${on ? 'btn-outline' : 'btn-accent'} sm st-apply">${on ? icon('check', 14) + ' Applied' : 'Apply'}</button>${t.id.startsWith('custom-') ? '<button class="icon-btn small st-del" title="Remove">' + icon('trash', 16) + '</button>' : ''}</div>
      </div>`);
      $('.st-apply', c).onclick = () => { Store.applyTheme(t.id); UI.toast(`Theme: ${t.name}`); App.render(); };
      const del = $('.st-del', c);
      if (del) del.onclick = () => { Store.removeCustom(t.id); App.render(); };
      c.addEventListener('mouseenter', () => App.setHeaderColor(t.accent + '55'));
      return c;
    };

    const optionCard = (item, kind) => {
      const on = kind === 'effects' ? !!(s.effects || {})[item.id] : s[kind] === item.id;
      const visual = kind === 'fonts'
        ? `<div class="st-font" style="font-family:${item.display}">${item.sample}<small style="font-family:${item.body}">The quick brown fox</small></div>`
        : kind === 'player'
          ? `<div class="st-player st-player-${item.id}"><span class="spp-cover"></span><span class="spp-lines"><i></i><i></i></span><span class="spp-play"></span><span class="spp-bar"></span></div>`
          : `<div class="st-effect st-fx-${item.id}">${icon({ animatedBg: 'sparkle', glass: 'browse', albumGlow: 'music', rounded: 'aurora', bigArt: 'expand' }[item.id] || 'sparkle', 40)}</div>`;
      const c = html(`<div class="st-card small ${on ? 'on' : ''}">
        ${visual}
        <div class="st-info"><div class="st-name">${esc(item.name)}</div><div class="st-desc">${esc(item.desc)}</div></div>
        <div class="st-actions">${kind === 'effects'
          ? `<label class="dc-opt" style="padding:0"><span>${on ? 'On' : 'Off'}</span><input type="checkbox" class="toggle" ${on ? 'checked' : ''} /></label>`
          : `<button class="${on ? 'btn-outline' : 'btn-accent'} sm st-apply">${on ? icon('check', 14) + ' Applied' : 'Apply'}</button>`}</div>
      </div>`);
      if (kind === 'effects') {
        $('input', c).onchange = (e) => { Store.save({ ...Store.sel(), effects: { ...(Store.sel().effects || {}), [item.id]: e.target.checked } }); Store.updateAlbumColor(); App.render(); };
      } else {
        $('.st-apply', c).onclick = () => { Store.save({ ...Store.sel(), [kind]: item.id }); UI.toast(`${item.name} applied`); App.render(); };
      }
      return c;
    };

    if (tab === 'featured') {
      const g = section('Featured themes', 'Hand-picked looks to start with');
      ['aurora-night', 'sunset-drive', 'neon-arcade', 'ocean-depths'].forEach((id) => g.appendChild(themeCard(Store.THEMES.find((t) => t.id === id))));
      const g2 = section('Effects', 'Little touches that make it feel alive');
      Store.EFFECTS.slice(0, 3).forEach((it) => g2.appendChild(optionCard(it, 'effects')));
      const g3 = section('Player styles');
      Store.PLAYERS.forEach((it) => g3.appendChild(optionCard(it, 'player')));
    } else if (tab === 'themes') {
      const g = section('Themes', `${Store.allThemes().length} themes · Each one sets colors, accents and background glow`);
      Store.allThemes().forEach((t) => g.appendChild(themeCard(t)));
    } else if (tab === 'fonts') {
      const g = section('Fonts');
      Store.FONTS.forEach((f) => g.appendChild(optionCard(f, 'font')));
    } else if (tab === 'player') {
      const g = section('Player styles');
      Store.PLAYERS.forEach((p) => g.appendChild(optionCard(p, 'player')));
    } else if (tab === 'effects') {
      const g = section('Effects', 'Mix and match, turn on as many as you like');
      Store.EFFECTS.forEach((e) => g.appendChild(optionCard(e, 'effects')));
    } else {
      const t = Store.allThemes().find((x) => x.id === s.theme) || Store.THEMES[0];
      const g = section('Applied to this profile');
      g.appendChild(themeCard(t));
      g.appendChild(optionCard(Store.FONTS.find((f) => f.id === s.font) || Store.FONTS[0], 'font'));
      g.appendChild(optionCard(Store.PLAYERS.find((p) => p.id === s.player) || Store.PLAYERS[0], 'player'));
      Store.EFFECTS.filter((e) => (s.effects || {})[e.id]).forEach((e) => g.appendChild(optionCard(e, 'effects')));
      const reset = html(`<div style="margin-top:8px"><button class="btn-outline sm">Reset to Aurora defaults</button></div>`);
      $('button', reset).onclick = () => { Store.save({ theme: 'aurora-night', font: 'default', player: 'dock', effects: {}, custom: s.custom || [] }); Store.applyTheme('aurora-night'); App.render(); };
      body.appendChild(reset);
    }
  },
};
