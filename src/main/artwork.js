// Online artwork lookup for Discord Connection: finds the album cover and a photo of the
// artist for the song that's playing, using Deezer's free public API (no account or key).
// Results are cached in memory and on disk so each song is only looked up once.
const { net } = require('electron');

const API = 'https://api.deezer.com';

// "Artist - Song (Official Video) [4K] ft. X" -> "Song"; "ArtistVEVO" / "Artist - Topic" -> "Artist"
function cleanTitle(s) {
  return String(s || '')
    .replace(/\[[^\]]*\]|\((?:official|lyric|lyrics|audio|video|music video|visualizer|hd|hq|4k|explicit|clean|live)[^)]*\)/gi, '')
    .replace(/\b(official (music )?video|lyric video|official audio|audio|lyrics?)\b/gi, '')
    .replace(/\s+(ft\.?|feat\.?|featuring)\s+.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function cleanArtist(s) {
  s = String(s || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').replace(/\s+(ft\.?|feat\.?|&|x|,)\s+.*$/i, '').trim();
  return /^unknown artist$/i.test(s) ? '' : s;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

class Artwork {
  constructor(store) {
    this.store = store;
    this.cache = (store && store.read('artwork-cache', {})) || {};
    this.inflight = new Map();
    this.saveTimer = null;
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const keys = Object.keys(this.cache);
      if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete this.cache[k];
      this.store && this.store.write('artwork-cache', this.cache);
    }, 1500);
  }

  async getJson(url) {
    const res = await net.fetch(url, { headers: { 'User-Agent': 'Aurora' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // returns { album: url|null, artist: url|null }
  lookup(title, artist) {
    let t = cleanTitle(title);
    let a = cleanArtist(artist);
    // titles like "Artist - Song" from YouTube uploads
    const m = t.match(/^(.+?)\s+-\s+(.+)$/);
    if (m && (!a || norm(m[1]).includes(norm(a)) || norm(a).includes(norm(m[1])))) { a = a || m[1].trim(); t = m[2].trim(); }
    const key = norm(a) + '|' + norm(t);
    if (!norm(t) && !norm(a)) return Promise.resolve({ album: null, artist: null });
    const hit = this.cache[key];
    if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 24 * 30) return Promise.resolve(hit);
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = this.fetchArt(t, a).then((r) => {
      this.cache[key] = { ...r, at: Date.now() };
      this.persist();
      return r;
    }).catch(() => ({ album: null, artist: null })).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  async fetchArt(title, artist) {
    let album = null, artistPic = null;
    const q = [artist, title].filter(Boolean).join(' ');
    if (q) {
      const r = await this.getJson(`${API}/search?q=${encodeURIComponent(q)}&limit=10`);
      const list = (r && r.data) || [];
      // prefer a result whose artist actually matches
      const want = norm(artist);
      const best = list.find((x) => want && x.artist && norm(x.artist.name) === want && norm(x.title).includes(norm(title).slice(0, 12)))
        || list.find((x) => want && x.artist && (norm(x.artist.name).includes(want) || want.includes(norm(x.artist.name))))
        || (!want ? list[0] : null);
      if (best) {
        album = best.album && (best.album.cover_xl || best.album.cover_big) || null;
        artistPic = best.artist && (best.artist.picture_xl || best.artist.picture_big) || null;
      }
    }
    if (!artistPic && artist) {
      const r = await this.getJson(`${API}/search/artist?q=${encodeURIComponent(artist)}&limit=5`);
      const list = (r && r.data) || [];
      const want = norm(artist);
      const best = list.find((x) => norm(x.name) === want) || list[0];
      if (best && best.picture_xl && !/\/artist\/\/|\/images\/artist\/\//.test(best.picture_xl)) artistPic = best.picture_xl;
    }
    // Deezer returns a grey placeholder for artists without a photo
    if (artistPic && /\/images\/artist\/\//.test(artistPic)) artistPic = null;
    return { album, artist: artistPic };
  }
}

module.exports = { Artwork, cleanTitle, cleanArtist };
