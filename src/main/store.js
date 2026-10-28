// Simple JSON file store kept in the user's AppData folder.
// Every write is atomic (write temp file, then rename) so a crash never corrupts data.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  file(name) {
    if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('Invalid store name: ' + name);
    return path.join(this.dir, name + '.json');
  }

  read(name, fallback = null) {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), 'utf8'));
    } catch {
      return fallback;
    }
  }

  write(name, data) {
    const f = this.file(name);
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, f);
    return true;
  }

  remove(name) {
    try { fs.unlinkSync(this.file(name)); } catch {}
  }
}

module.exports = Store;
