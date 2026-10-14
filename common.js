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
// "peer": PeerJS (WebRTC) — the TV hosts a room, phones connect directly. Works on GitHub Pages, no server.
// "bc":   BroadcastChannel — same-browser tabs only, used for local testing (?net=bc).
(function (root) {
  'use strict';
  const PREFIX = 'lineup-tv-v1-';
  const PEER_SRC = [
    'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js',
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
  ];

  function loadPeer(cb) {
    if (root.Peer) return cb(null);
    let i = 0;
    (function next() {
      if (i >= PEER_SRC.length) return cb(new Error('Could not load the connection library'));
      const s = document.createElement('script');
      s.src = PEER_SRC[i++];
      s.onload = () => root.Peer ? cb(null) : next();
      s.onerror = next;
      document.head.appendChild(s);
    })();
  }

  function parse(m) { if (typeof m === 'string') { try { return JSON.parse(m); } catch (e) { return null; } } return m; }

  function peerHost(code, h) {
    let peer = null, dead = false;
    loadPeer(err => {
      if (err) return h.error && h.error({ type: 'library', message: err.message });
      peer = new Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => h.open && h.open());
      peer.on('error', e => h.error && h.error(e));
      peer.on('disconnected', () => { if (!dead) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1500); });
      peer.on('connection', c => {
        const conn = { send: m => { try { if (c.open) c.send(m); } catch (e) {} } };
        let closed = false;
        const close = () => { if (!closed) { closed = true; h.close && h.close(conn); } };
        c.on('open', () => h.connect && h.connect(conn));
        c.on('data', m => { const msg = parse(m); if (msg) h.data && h.data(conn, msg); });
        c.on('close', close);
        c.on('error', close);
      });
    });
    return { destroy() { dead = true; if (peer) peer.destroy(); } };
  }

  function peerJoin(code, h) {
    let peer = null, conn = null, dead = false, closed = false;
    const close = () => { if (!closed && !dead) { closed = true; h.close && h.close(); } };
    loadPeer(err => {
      if (err) return h.error && h.error({ type: 'library', message: err.message });
      peer = new Peer({ debug: 0 });
      peer.on('open', () => {
        conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => h.open && h.open());
        conn.on('data', m => { const msg = parse(m); if (msg) h.data && h.data(msg); });
        conn.on('close', close);
        conn.on('error', close);
      });
      peer.on('error', e => { h.error && h.error(e); close(); });
    });
    return {
      send(m) { try { if (conn && conn.open) conn.send(m); } catch (e) {} },
      destroy() { dead = true; if (peer) peer.destroy(); }
    };
  }

  function bcHost(code, h) {
    const ch = new BroadcastChannel('lineup-' + code), conns = new Map();
    ch.onmessage = e => {
      const m = e.data; if (!m || m.to !== 'host') return;
      if (m.type === 'connect') {
        const conn = { send: p => ch.postMessage({ to: m.from, type: 'data', payload: p }) };
        conns.set(m.from, conn);
        ch.postMessage({ to: m.from, type: 'accept' });
        h.connect && h.connect(conn);
      } else if (m.type === 'data') {
        const conn = conns.get(m.from); if (conn) h.data && h.data(conn, m.payload);
      } else if (m.type === 'close') {
        const conn = conns.get(m.from); if (conn) { conns.delete(m.from); h.close && h.close(conn); }
      }
    };
    setTimeout(() => h.open && h.open(), 0);
    return { destroy() { ch.close(); } };
  }

  function bcJoin(code, h) {
    const id = Math.random().toString(36).slice(2);
    const ch = new BroadcastChannel('lineup-' + code);
    ch.onmessage = e => {
      const m = e.data; if (!m || m.to !== id) return;
      if (m.type === 'accept') h.open && h.open();
      else if (m.type === 'data') h.data && h.data(m.payload);
    };
    ch.postMessage({ to: 'host', from: id, type: 'connect' });
    const bye = () => ch.postMessage({ to: 'host', from: id, type: 'close' });
    addEventListener('pagehide', bye);
    return {
      send(p) { ch.postMessage({ to: 'host', from: id, type: 'data', payload: p }); },
      destroy() { bye(); ch.close(); }
    };
  }

  const kind = () => new URLSearchParams(location.search).get('net') === 'bc' ? 'bc' : 'peer';
  root.Net = {
    kind,
    host: (code, h) => kind() === 'bc' ? bcHost(code, h) : peerHost(code, h),
    join: (code, h) => kind() === 'bc' ? bcJoin(code, h) : peerJoin(code, h)
  };
})(window);
