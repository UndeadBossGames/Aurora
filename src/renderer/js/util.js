// Small helpers shared by every view.
var Views = {}; // view registry: Views.<name> = { render(root, param) }
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  const node = t.content.children.length === 1 ? t.content.firstElementChild : t.content;
  hydrateIcons(node.nodeType === 11 ? t.content : node);
  return node;
}

function uid(n = 10) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtLong(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h} hr ${m} min`;
  if (m) return `${m} min ${s} sec`;
  return `${s} sec`;
}

function fmtDate(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minute${diff < 120 ? '' : 's'} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${diff < 7200 ? '' : 's'} ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} day${diff < 172800 ? '' : 's'} ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 604800)} week${diff < 1209600 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PALETTE = ['#e13300', '#1e3264', '#8400e7', '#e8115b', '#148a08', '#bc5900', '#509bf5', '#dc148c', '#0d73ec', '#27856a', '#8d67ab', '#ba5d07', '#477d95', '#e91429', '#503750', '#af2896', '#1d7a4f', '#7d4b32'];
const colorFor = (s) => PALETTE[hashStr(String(s)) % PALETTE.length];

// Generated artwork for items without a cover image.
function genCover(seed, label = '', iconName = 'music') {
  const c1 = colorFor(seed);
  const c2 = colorFor(seed + '•');
  const ic = (ICONS[iconName] || '').replace(/currentColor/g, 'rgba(255,255,255,.85)');
  const txt = label ? `<text x="12" y="14.2" text-anchor="middle" font-family="Inter,Segoe UI,sans-serif" font-weight="800" font-size="7" fill="#fff">${esc(label.slice(0, 2).toUpperCase())}</text>` : `<g transform="translate(7.2 7.2) scale(.4)" fill="rgba(255,255,255,.85)">${ic}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/>${txt}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function likedCover() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#450af5"/><stop offset="1" stop-color="#c4efd9"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/><g transform="translate(7.5 7.5) scale(.375)" fill="#fff">${ICONS.heartFilled}</g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function downloadsCover() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#006450"/><stop offset="1" stop-color="#1ed760"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/><g transform="translate(7.5 7.5) scale(.375)" fill="#fff">${ICONS.download.replace(/currentColor/g, '#fff')}</g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function videosCover() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d0f5f"/><stop offset="1" stop-color="#f037a5"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/><g transform="translate(7.5 7.5) scale(.375)" fill="#fff">${ICONS.video.replace(/currentColor/g, '#fff')}</g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Pull an average colour out of an image for header gradients.
const _colorCache = new Map();
function dominantColor(src) {
  if (!src) return Promise.resolve(null);
  if (_colorCache.has(src)) return Promise.resolve(_colorCache.get(src));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const w = 1 + (mx - mn) / 32; // favour saturated pixels
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        r /= n; g /= n; b /= n;
        // keep it readable behind white text
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const k = l > 150 ? 150 / l : l < 50 ? 1.4 : 1;
        const col = `rgb(${Math.round(Math.min(255, r * k))}, ${Math.round(Math.min(255, g * k))}, ${Math.round(Math.min(255, b * k))})`;
        _colorCache.set(src, col);
        resolve(col);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function isUrl(s) { return /^https?:\/\/\S+$/i.test(String(s).trim()); }
