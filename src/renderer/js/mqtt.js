// Tiny MQTT 3.1.1 client over WebSocket (no dependencies).
// Used by Friends to share "now playing" through a free public MQTT broker.
class MiniMqtt {
  constructor({ urls, clientId, keepalive = 45, will = null, onMessage, onState }) {
    this.urls = urls;
    this.clientId = clientId;
    this.keepalive = keepalive;
    this.will = will; // { topic, payload: string, retain: bool }
    this.onMessage = onMessage || (() => {});
    this.onState = onState || (() => {});
    this.subs = new Set();
    this.ws = null;
    this.connected = false;
    this.urlIndex = 0;
    this.pid = 1;
    this.closed = false;
    this.retryMs = 2000;
    this.buf = new Uint8Array(0);
    this.queue = [];
  }

  // ---- encoding helpers ----
  static str(s) {
    const b = new TextEncoder().encode(s);
    const out = new Uint8Array(2 + b.length);
    out[0] = b.length >> 8; out[1] = b.length & 255; out.set(b, 2);
    return out;
  }
  static len(n) {
    const out = [];
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0);
    return out;
  }
  static packet(type, ...parts) {
    const body = parts.reduce((a, p) => a + p.length, 0);
    const head = [type, ...MiniMqtt.len(body)];
    const out = new Uint8Array(head.length + body);
    out.set(head, 0);
    let o = head.length;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  connect() {
    if (this.closed) return;
    const url = this.urls[this.urlIndex % this.urls.length];
    this.onState('connecting', url);
    let ws;
    try { ws = new WebSocket(url, ['mqtt']); } catch { return this.retry(); }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    const timeout = setTimeout(() => { if (!this.connected) ws.close(); }, 9000);
    ws.onopen = () => {
      let flags = 0x02; // clean session
      const parts = [MiniMqtt.str('MQTT'), new Uint8Array([4]), null, new Uint8Array([this.keepalive >> 8, this.keepalive & 255]), MiniMqtt.str(this.clientId)];
      if (this.will) {
        flags |= 0x04 | (this.will.retain ? 0x20 : 0);
        parts.push(MiniMqtt.str(this.will.topic), MiniMqtt.str(this.will.payload));
      }
      parts[2] = new Uint8Array([flags]);
      ws.send(MiniMqtt.packet(0x10, ...parts));
    };
    ws.onmessage = (ev) => {
      const chunk = new Uint8Array(ev.data);
      const merged = new Uint8Array(this.buf.length + chunk.length);
      merged.set(this.buf); merged.set(chunk, this.buf.length);
      this.buf = merged;
      this.parse();
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      clearInterval(this.pingTimer);
      const was = this.connected;
      this.connected = false;
      if (!was) this.urlIndex++; // try the next broker if this one never connected
      this.onState('disconnected');
      this.retry();
    };
    ws.onerror = () => {};
  }

  retry() {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(60000, this.retryMs * 1.7);
  }

  parse() {
    for (;;) {
      if (this.buf.length < 2) return;
      let mult = 1, len = 0, i = 1, byte;
      do {
        if (i >= this.buf.length) return;
        byte = this.buf[i++];
        len += (byte & 127) * mult;
        mult *= 128;
      } while (byte & 128);
      if (this.buf.length < i + len) return;
      const type = this.buf[0];
      const body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);
      this.handle(type, body);
    }
  }

  handle(type, body) {
    const kind = type >> 4;
    if (kind === 2) { // CONNACK
      if (body[1] !== 0) { this.onState('refused'); this.ws.close(); return; }
      this.connected = true;
      this.retryMs = 2000;
      this.onState('connected', this.urls[this.urlIndex % this.urls.length]);
      for (const t of this.subs) this.sendSub(t);
      const q = this.queue; this.queue = [];
      q.forEach((p) => this.ws.send(p));
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => { if (this.connected) this.ws.send(new Uint8Array([0xc0, 0])); }, (this.keepalive - 5) * 1000);
    } else if (kind === 3) { // PUBLISH
      const qos = (type >> 1) & 3;
      const tlen = (body[0] << 8) | body[1];
      const topic = new TextDecoder().decode(body.slice(2, 2 + tlen));
      let o = 2 + tlen;
      if (qos > 0) o += 2;
      const payload = new TextDecoder().decode(body.slice(o));
      try { this.onMessage(topic, payload); } catch (e) { console.warn(e); }
    }
  }

  send(pkt) {
    if (this.connected && this.ws && this.ws.readyState === 1) this.ws.send(pkt);
    else this.queue.push(pkt);
  }

  publish(topic, payload, { retain = false } = {}) {
    const p = MiniMqtt.packet(0x30 | (retain ? 1 : 0), MiniMqtt.str(topic), new TextEncoder().encode(payload));
    // only keep the latest queued message per topic
    if (!this.connected) this.queue = this.queue.filter((q) => q._topic !== topic);
    p._topic = topic;
    this.send(p);
  }

  sendSub(topic) {
    const id = this.pid++ & 0xffff || 1;
    this.ws.send(MiniMqtt.packet(0x82, new Uint8Array([id >> 8, id & 255]), MiniMqtt.str(topic), new Uint8Array([0])));
  }

  subscribe(topic) {
    if (this.subs.has(topic)) return;
    this.subs.add(topic);
    if (this.connected) this.sendSub(topic);
  }

  unsubscribe(topic) {
    if (!this.subs.delete(topic)) return;
    if (!this.connected) return;
    const id = this.pid++ & 0xffff || 1;
    this.ws.send(MiniMqtt.packet(0xa2, new Uint8Array([id >> 8, id & 255]), MiniMqtt.str(topic)));
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    if (this.ws) { try { if (this.connected) this.ws.send(new Uint8Array([0xe0, 0])); this.ws.close(); } catch {} }
    this.connected = false;
  }
}
