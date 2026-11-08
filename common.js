// Shared constants and helpers for the TV (index.html) and phone (play.html) pages.
(function (root) {
  'use strict';
  const N = 10;
  const SUITS = { S: '♠', C: '♣', D: '♦', H: '♥' };
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','Q','K'];
  const COLORS = [
    { name: 'Blue',  hex: '#3b82f6', lt: '#93c5fd', dk: '#1d4ed8' },
    { name: 'Green', hex: '#22c55e', lt: '#86efac', dk: '#15803d' },
    { name: 'Red',   hex: '#ef4444', lt: '#fca5a5', dk: '#b91c1c' }
  ];
  const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

  // Classic tournament board arrangement ('XX' = free corner)
  const LAYOUT = [
    'XX 2S 3S 4S 5S 6S 7S 8S 9S XX',
    '6C 5C 4C 3C 2C AH KH QH 10H 10S',
    '7C AS 2D 3D 4D 5D 6D 7D 9H QS',
    '8C KS 6C 5C 4C 3C 2C 8D 8H KS',
    '9C QS 7C 6H 5H 4H AH 9D 7H AS',
    '10C 10S 8C 7H 2H 3H KH 10D 6H 2D',
    'QC 9S 9C 8H 9H 10H QH QD 5H 3D',
    'KC 8S 10C QC KC AC AD KD 4H 4D',
    'AC 7S 6S 5S 4S 3S 2S 2H 3H 5D',
    'XX AD KD QD 10D 9D 8D 7D 6D XX'
  ].map(row => row.split(' ').map(c => c === 'XX' ? null : c));

  const rankOf = c => c.slice(0, -1);
  const suitOf = c => c.slice(-1);
  const isRed = c => 'DH'.includes(suitOf(c));
  const isJack = c => rankOf(c) === 'J';
  const isTwoEyed = c => isJack(c) && 'DC'.includes(suitOf(c)); // wild: place anywhere
  const isOneEyed = c => isJack(c) && 'HS'.includes(suitOf(c)); // remove a chip
  const isCorner = (r, c) => (r === 0 || r === N - 1) && (c === 0 || c === N - 1);
  const cardLabel = c => rankOf(c) + SUITS[suitOf(c)];

  root.LINEUP = { N, SUITS, RANKS, COLORS, DIRS, LAYOUT, rankOf, suitOf, isRed, isJack, isTwoEyed, isOneEyed, isCorner, cardLabel };
})(window);

// ---------------- Networking ----------------
// Phones and the TV talk through a free public MQTT relay over secure WebSockets.
// Plain WebSockets work in every TV and phone browser and get through home routers,
// unlike direct peer-to-peer connections. Several relays are tried in order.
// "?net=bc" uses BroadcastChannel (same-browser tabs) for local testing.
(function (root) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const DEFAULT_BROKERS = [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
    'wss://mqtt.eclipseprojects.io:443/mqtt'
  ];
  const BROKERS = params.get('broker') ? params.get('broker').split(',') : DEFAULT_BROKERS;
  const TOPIC = code => 'lineup-tv/v2/' + code;
  const rnd = n => { let s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); };
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ---- Minimal MQTT 3.1.1 client (QoS 0) ----
  function concat(parts){ let n = 0; parts.forEach(p => n += p.length); const o = new Uint8Array(n); let k = 0; parts.forEach(p => { o.set(p, k); k += p.length; }); return o; }
  function mstr(s){ const b = enc.encode(s); return concat([new Uint8Array([b.length >> 8, b.length & 255]), b]); }
  function packet(type, body){
    const hdr = [type]; let x = body.length;
    do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; hdr.push(d); } while (x > 0);
    return concat([new Uint8Array(hdr), body]);
  }
  function Mqtt(url, o){
    let ws, buf = new Uint8Array(0), up = false, down = false, pingT = null, pid = 1;
    const fail = why => { if (down) return; down = true; up = false; clearInterval(pingT); try { ws.close(); } catch (e) {} o.onDown && o.onDown(why); };
    const raw = d => { try { if (ws.readyState === 1) ws.send(d); } catch (e) {} };
    try { ws = new WebSocket(url, ['mqtt']); } catch (e) { setTimeout(() => fail('ws'), 0); return { publish(){}, end(){} }; }
    ws.binaryType = 'arraybuffer';
    const openT = setTimeout(() => { if (!up) fail('timeout'); }, 8000);
    ws.onopen = () => {
      let flags = 0x02; const parts = [mstr('MQTT'), new Uint8Array([4])];
      const payload = [mstr('ltv' + rnd(16))];
      if (o.will) { flags |= 0x04; payload.push(mstr(o.will.topic), mstr(o.will.payload)); }
      parts.push(new Uint8Array([flags, 0, 30]));
      raw(packet(0x10, concat(parts.concat(payload))));
    };
    ws.onmessage = ev => {
      const d = new Uint8Array(ev.data);
      buf = buf.length ? concat([buf, d]) : d;
      for (;;) {
        if (buf.length < 2) break;
        let i = 1, len = 0, mult = 1, b;
        do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mult; mult *= 128; } while (b & 128);
        if (buf.length < i + len) break;
        const type = buf[0] >> 4, qos = (buf[0] >> 1) & 3, body = buf.subarray(i, i + len);
        buf = buf.slice(i + len);
        if (type === 2) {               // CONNACK
          if (body[1] !== 0) return fail('refused');
          const subs = (o.subs || []).map(t => concat([mstr(t), new Uint8Array([0])]));
          const id = pid++;
          raw(packet(0x82, concat([new Uint8Array([id >> 8, id & 255])].concat(subs))));
        } else if (type === 9) {        // SUBACK
          clearTimeout(openT); up = true;
          pingT = setInterval(() => raw(new Uint8Array([0xC0, 0])), 20000);
          o.onUp && o.onUp();
        } else if (type === 3) {        // PUBLISH
          const tl = (body[0] << 8) | body[1];
          const topic = dec.decode(body.subarray(2, 2 + tl));
          let p = 2 + tl; if (qos > 0) p += 2;
          o.onMessage && o.onMessage(topic, dec.decode(body.subarray(p)));
        }
      }
    };
    ws.onclose = () => fail('closed');
    ws.onerror = () => fail('error');
    return {
      publish(topic, str){ if (up) raw(packet(0x30, concat([mstr(topic), enc.encode(str)]))); },
      end(){ down = true; clearInterval(pingT); clearTimeout(openT); raw(new Uint8Array([0xE0, 0])); try { ws.close(); } catch (e) {} }
    };
  }
  const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

  // ---- TV side ----
  function mqttHost(code, h){
    const T = TOPIC(code), conns = new Map();
    let bi = 0, cli = null, dead = false, opened = false, tries = 0;
    function start(){
      if (dead) return;
      cli = Mqtt(BROKERS[bi], {
        subs: [T + '/h'],
        onUp(){ tries = 0; if (!opened) { opened = true; h.open && h.open({ broker: bi }); } },
        onDown(){
          if (dead) return;
          if (!opened) { bi = (bi + 1) % BROKERS.length; if (++tries === BROKERS.length) h.error && h.error({ type: 'network', message: 'no relay reachable' }); }
          setTimeout(start, opened ? 2000 : 400);
        },
        onMessage(topic, s){
          const m = parse(s); if (!m || typeof m.from !== 'string') return;
          const id = m.from.slice(0, 40); let e = conns.get(id);
          if (m.t === 'bye') { if (e && e.s === m.s) { conns.delete(id); h.close && h.close(e.conn); } return; }
          if (!e) {
            if (m.t !== 'hello') return;
            e = { s: m.s, last: Date.now(), conn: { send: msg => cli && cli.publish(T + '/c/' + id, JSON.stringify(msg)) } };
            conns.set(id, e); h.connect && h.connect(e.conn);
          }
          e.last = Date.now(); if (m.t === 'hello') e.s = m.s;
          if (m.t === 'ping') { e.conn.send({ t: 'pong' }); return; }
          h.data && h.data(e.conn, m);
        }
      });
    }
    const sweep = setInterval(() => {
      const now = Date.now();
      conns.forEach((e, id) => { if (now - e.last > 20000) { conns.delete(id); h.close && h.close(e.conn); } });
    }, 4000);
    start();
    return { destroy(){ dead = true; clearInterval(sweep); if (cli) cli.end(); } };
  }

  // ---- Phone side ----
  function mqttJoin(code, h, opt){
    opt = opt || {};
    const T = TOPIC(code), id = opt.id || rnd(12), s = rnd(8);
    let bi = (opt.broker | 0) % BROKERS.length, cli, dead = false, closed = false, lastHost = 0, pingT, dogT;
    const close = why => {
      if (closed || dead) return; closed = true;
      clearInterval(pingT); clearInterval(dogT); if (cli) cli.end();
      h.close && h.close(why);
    };
    const send = m => { if (cli) { m.from = id; m.s = s; cli.publish(T + '/h', JSON.stringify(m)); } };
    cli = Mqtt(BROKERS[bi], {
      subs: [T + '/c/' + id],
      will: { topic: T + '/h', payload: JSON.stringify({ from: id, s, t: 'bye' }) },
      onUp(){
        h.open && h.open();
        pingT = setInterval(() => send({ t: 'ping' }), 5000);
        dogT = setInterval(() => { if (lastHost && Date.now() - lastHost > 16000) close('lost'); }, 3000);
      },
      onDown(why){ close(why); },
      onMessage(topic, str){
        lastHost = Date.now();
        const m = parse(str); if (!m || m.t === 'pong') return;
        h.data && h.data(m);
      }
    });
    return { send, broker: bi, destroy(){ dead = true; clearInterval(pingT); clearInterval(dogT); if (cli) cli.end(); } };
  }

  // ---- Same-browser test transport ----
  function bcHost(code, h){
    const ch = new BroadcastChannel('lineup-' + code), conns = new Map();
    ch.onmessage = e => {
      const m = e.data; if (!m || m.to !== 'host') return;
      if (m.type === 'connect') {
        const conn = { send: p => ch.postMessage({ to: m.from, type: 'data', payload: p }) };
        conns.set(m.from, conn); ch.postMessage({ to: m.from, type: 'accept' }); h.connect && h.connect(conn);
      } else if (m.type === 'data') { const conn = conns.get(m.from); if (conn) h.data && h.data(conn, m.payload); }
      else if (m.type === 'close') { const conn = conns.get(m.from); if (conn) { conns.delete(m.from); h.close && h.close(conn); } }
    };
    setTimeout(() => h.open && h.open({}), 0);
    return { destroy(){ ch.close(); } };
  }
  function bcJoin(code, h){
    const id = rnd(10), ch = new BroadcastChannel('lineup-' + code);
    ch.onmessage = e => { const m = e.data; if (!m || m.to !== id) return; if (m.type === 'accept') h.open && h.open(); else if (m.type === 'data') h.data && h.data(m.payload); };
    ch.postMessage({ to: 'host', from: id, type: 'connect' });
    const bye = () => ch.postMessage({ to: 'host', from: id, type: 'close' });
    addEventListener('pagehide', bye);
    return { send(p){ ch.postMessage({ to: 'host', from: id, type: 'data', payload: p }); }, broker: 0, destroy(){ bye(); ch.close(); } };
  }

  const kind = () => params.get('net') === 'bc' ? 'bc' : 'mqtt';
  root.Net = {
    kind, brokerCount: BROKERS.length,
    // query params to carry from the TV's URL into the phone link (for testing setups)
    carry: () => ['net', 'broker'].filter(k => params.get(k)).map(k => '&' + k + '=' + encodeURIComponent(params.get(k))).join(''),
    host: (code, h) => kind() === 'bc' ? bcHost(code, h) : mqttHost(code, h),
    join: (code, h, opt) => kind() === 'bc' ? bcJoin(code, h) : mqttJoin(code, h, opt)
  };
})(window);
