// Local media helpers: folder scanning + lightweight ID3v2 / MP4 tag reading.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma'];
const VIDEO_EXT = ['.mp4', '.webm', '.mkv', '.mov', '.m4v'];
const MEDIA_EXT = [...AUDIO_EXT, ...VIDEO_EXT];

const idFor = (p) => crypto.createHash('sha1').update(path.resolve(p).toLowerCase()).digest('hex').slice(0, 16);

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, depth + 1);
    else if (MEDIA_EXT.includes(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

// ---------- ID3v2 ----------
function syncsafe(b, o) { return (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3]; }

function decodeText(buf) {
  if (!buf.length) return '';
  const enc = buf[0];
  const data = buf.subarray(1);
  let s;
  if (enc === 1 || enc === 2) {
    // UTF-16 with or without BOM
    let d = data, le = true;
    if (d[0] === 0xff && d[1] === 0xfe) { d = d.subarray(2); }
    else if (d[0] === 0xfe && d[1] === 0xff) { d = d.subarray(2); le = false; }
    else if (enc === 2) le = false;
    const b = Buffer.from(d.subarray(0, d.length - (d.length % 2)));
    if (!le) b.swap16();
    s = b.toString('utf16le');
  } else if (enc === 3) s = data.toString('utf8');
  else s = data.toString('latin1');
  return s.replace(/\u0000+$/g, '').split('\u0000')[0].trim();
}

function readId3(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(10);
    fs.readSync(fd, head, 0, 10, 0);
    if (head.toString('latin1', 0, 3) !== 'ID3') return null;
    const ver = head[3];
    const size = syncsafe(head, 6);
    if (size <= 0 || size > 20 * 1024 * 1024) return null;
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 10);
    const tags = {};
    let o = 0;
    if (head[5] & 0x40) { // extended header
      const ext = ver === 4 ? syncsafe(buf, 0) : buf.readUInt32BE(0) + 4;
      o += ext;
    }
    while (o + 10 < buf.length) {
      const id = buf.toString('latin1', o, o + 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fsize = ver === 4 ? syncsafe(buf, o + 4) : buf.readUInt32BE(o + 4);
      if (fsize <= 0 || o + 10 + fsize > buf.length) break;
      const body = buf.subarray(o + 10, o + 10 + fsize);
      if (id === 'TIT2') tags.title = decodeText(body);
      else if (id === 'TPE1') tags.artist = decodeText(body);
      else if (id === 'TALB') tags.album = decodeText(body);
      else if (id === 'APIC' && !tags.picture) {
        const enc = body[0];
        let p = 1;
        const mimeEnd = body.indexOf(0, p);
        const mime = body.toString('latin1', p, mimeEnd) || 'image/jpeg';
        p = mimeEnd + 2; // skip null + picture type
        if (enc === 1 || enc === 2) { while (p + 1 < body.length && !(body[p] === 0 && body[p + 1] === 0)) p += 2; p += 2; }
        else { while (p < body.length && body[p] !== 0) p++; p += 1; }
        tags.picture = { mime: mime.includes('/') ? mime : 'image/' + mime.toLowerCase(), data: body.subarray(p) };
      }
      o += 10 + fsize;
    }
    return tags;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function guessFromName(file) {
  const base = path.basename(file, path.extname(file)).replace(/\s*\[[A-Za-z0-9_-]{6,}\]$/, '').replace(/_/g, ' ');
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { title: base.trim(), artist: '' };
}

function readTrack(file, coversDir) {
  const ext = path.extname(file).toLowerCase();
  const id = idFor(file);
  const guess = guessFromName(file);
  const t = {
    id,
    path: file,
    title: guess.title,
    artist: guess.artist || 'Unknown artist',
    album: path.basename(path.dirname(file)),
    kind: VIDEO_EXT.includes(ext) ? 'video' : 'audio',
    source: 'local',
    duration: 0,
    cover: null,
    addedAt: Date.now(),
  };
  if (ext === '.mp3') {
    const tags = readId3(file);
    if (tags) {
      if (tags.title) t.title = tags.title;
      if (tags.artist) t.artist = tags.artist;
      if (tags.album) t.album = tags.album;
      if (tags.picture && tags.picture.data.length > 100 && coversDir) {
        const extImg = tags.picture.mime.includes('png') ? '.png' : '.jpg';
        const out = path.join(coversDir, id + extImg);
        try { fs.writeFileSync(out, tags.picture.data); t.cover = out; } catch {}
      }
    }
  }
  return t;
}

function scanFolder(dir, coversDir) {
  return walk(dir).map((f) => readTrack(f, coversDir));
}

module.exports = { scanFolder, readTrack, idFor, AUDIO_EXT, VIDEO_EXT, MEDIA_EXT };
