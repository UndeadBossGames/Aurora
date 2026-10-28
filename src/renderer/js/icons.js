// Aurora icon set (original, 24x24 viewBox). Add your own here: name -> SVG inner markup.
const ICONS = {
  dots: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
  dotsH: '<circle cx="4.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19.5" cy="12" r="1.7"/>',
  chevronLeft: '<path d="M15.5 4.5 8 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronRight: '<path d="m8.5 4.5 7.5 7.5-7.5 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronDown: '<path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  homeFilled: '<path d="M12.6 2.3a1 1 0 0 0-1.2 0l-8 6.2A1 1 0 0 0 3 9.3V21a1 1 0 0 0 1 1h5.5v-6.5a2.5 2.5 0 0 1 5 0V22H20a1 1 0 0 0 1-1V9.3a1 1 0 0 0-.4-.8l-8-6.2z"/>',
  home: '<path d="M12 3 4 9.2V21h5.5v-6a2.5 2.5 0 0 1 5 0v6H20V9.2L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  browse: '<path d="M4 5h16v4.5H4z M5.5 9.5V19h13V9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 13.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  bell: '<path d="M12 3a6 6 0 0 0-6 6v4.2L4.3 16.5h15.4L18 13.2V9a6 6 0 0 0-6-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  download: '<path d="M12 3.5v11m0 0-4.5-4.5m4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 16.5v3h15v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  downloadCircle: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v9m0 0-3.5-3.5M12 16l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  library: '<path d="M4 3.5v17M9 3.5v17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m13.5 4.2 6.3 15.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  plus: '<path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  plusCircle: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5v9M7.5 12h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  checkCircle: '<circle cx="12" cy="12" r="10.5"/><path d="m7.3 12.3 3.1 3.1 6.3-6.6" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M5.5 5.5l13 13m0-13-13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 5v2M4 11v2M4 17v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  play: '<path d="M7.05 3.6a1 1 0 0 1 1.02.03l12.2 7.53a1 1 0 0 1 0 1.7L8.07 20.4A1 1 0 0 1 6.5 19.53V4.47a1 1 0 0 1 .55-.87z"/>',
  pause: '<rect x="5.5" y="3.5" width="4.5" height="17" rx="1"/><rect x="14" y="3.5" width="4.5" height="17" rx="1"/>',
  prev: '<rect x="3.5" y="3.5" width="2.6" height="17" rx="1"/><path d="M20.5 4.4v15.2a.9.9 0 0 1-1.38.76L7.5 13a1.2 1.2 0 0 1 0-2l11.62-7.36a.9.9 0 0 1 1.38.76z"/>',
  next: '<rect x="17.9" y="3.5" width="2.6" height="17" rx="1"/><path d="M3.5 4.4v15.2a.9.9 0 0 0 1.38.76L16.5 13a1.2 1.2 0 0 0 0-2L4.88 3.64A.9.9 0 0 0 3.5 4.4z"/>',
  shuffle: '<path d="M3 6.5h3.2c2 0 3.2 1 4.3 2.7l3 5.6c1 1.7 2.3 2.7 4.3 2.7H21M3 17.5h3.2c1.5 0 2.5-.6 3.4-1.6M14.4 8.1c.9-1 1.9-1.6 3.4-1.6H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m18.5 3.8 2.7 2.7-2.7 2.7M18.5 14.8l2.7 2.7-2.7 2.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  repeat: '<path d="M7 5.5h10a3.5 3.5 0 0 1 3.5 3.5v3M17 18.5H7A3.5 3.5 0 0 1 3.5 15v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m9.5 2.8-2.7 2.7 2.7 2.7M14.5 21.2l2.7-2.7-2.7-2.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  repeatOne: '<path d="M7 5.5h10a3.5 3.5 0 0 1 3.5 3.5v3M17 18.5H7A3.5 3.5 0 0 1 3.5 15v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m9.5 2.8-2.7 2.7 2.7 2.7M14.5 21.2l2.7-2.7-2.7-2.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.2 10.6 12.6 9.6V15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  nowPlaying: '<rect x="3" y="3.5" width="18" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  queue: '<path d="M4 5h16M4 10h16M4 15h7M4 20h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15 14v6.5l5-3.25z"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  volHigh: '<path d="M3 9.2v5.6h3.8L12 19V5L6.8 9.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  volLow: '<path d="M3 9.2v5.6h3.8L12 19V5L6.8 9.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  volMute: '<path d="M3 9.2v5.6h3.8L12 19V5L6.8 9.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  miniPlayer: '<rect x="2.5" y="4" width="19" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="12" y="12" width="7" height="5" rx="1"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  exitFullscreen: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  heart: '<path d="M12 20.3 4.3 12.6a4.9 4.9 0 0 1 6.9-6.9l.8.8.8-.8a4.9 4.9 0 0 1 6.9 6.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  heartFilled: '<path d="M12 20.3 4.3 12.6a4.9 4.9 0 0 1 6.9-6.9l.8.8.8-.8a4.9 4.9 0 0 1 6.9 6.9z"/>',
  pin: '<path d="M14.7 2.6 21.4 9.3l-2.3.6-3.8 3.8.3 4.4-1.9 1.9-3.5-3.5-5.2 5.2-1-1 5.2-5.2-3.5-3.5 1.9-1.9 4.4.3 3.8-3.8z"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5.2l3.3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  music: '<path d="M9 18V5.5l11-2V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  video: '<rect x="2.5" y="5.5" width="14" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16.5 10 5-3v10l-5-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  user: '<circle cx="12" cy="8" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20.5c.8-3.8 4-6 8-6s7.2 2.2 8 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  users: '<circle cx="9" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M2.8 19.5c.6-3.3 3.1-5.2 6.2-5.2s5.6 1.9 6.2 5.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.6c1.8.7 3 2.4 3.3 4.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  edit: '<path d="M4 20h4L19.3 8.7a2.1 2.1 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.6l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  paste: '<rect x="5" y="4.5" width="14" height="16.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="8.5" y="2.8" width="7" height="3.6" rx="1" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  warning: '<path d="M12 3.5 2.5 20h19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.1"/>',
  import: '<path d="M12 3v11m0 0-4-4m4 4 4-4M5 13v6.5h14V13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  playlistAdd: '<path d="M3 6h13M3 11h13M3 16h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 13v8M14 17h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  speaker: '<rect x="5" y="2.5" width="14" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="14.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="7" r="1.2"/>',
  sparkle: '<path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z"/><path d="M19 15.5c.3 2 1.2 2.9 3 3.2-1.8.3-2.7 1.2-3 3.2-.3-2-1.2-2.9-3-3.2 1.8-.3 2.7-1.2 3-3.2z"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  github: '<path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .8 1.5 2.3 1.1 2.9.8.1-.6.3-1 .6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.7c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5z"/>',
  aurora: '<defs><linearGradient id="ag" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#1ed760"/><stop offset=".55" stop-color="#2de2c9"/><stop offset="1" stop-color="#9b6bff"/></linearGradient></defs><circle cx="12" cy="12" r="11" fill="url(#ag)"/><path d="M5 16.5c2.2-5.5 4.6-8.8 7-8.8s4.8 3.3 7 8.8" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"/><path d="M8.6 16.6c1.2-2.6 2.3-3.9 3.4-3.9s2.2 1.3 3.4 3.9" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"/>',
};

function icon(name, size = 24, cls = '') {
  const body = ICONS[name] || '';
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconDone === el.dataset.icon) return;
    const size = el.dataset.iconSize || (el.classList.contains('play-btn') ? 16 : el.classList.contains('home-btn') ? 24 : el.classList.contains('small') ? 18 : 16);
    const existing = el.querySelector(':scope > svg.ic');
    const html = icon(el.dataset.icon, size);
    if (existing) existing.outerHTML = html; else el.insertAdjacentHTML('afterbegin', html);
    el.dataset.iconDone = el.dataset.icon;
  });
}

function setIcon(el, name) {
  if (!el) return;
  el.dataset.icon = name;
  hydrateIcons(el.parentNode || document);
}
