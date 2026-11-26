// Транспорт. Игровая логика о нём не знает: телефоны шлют действия,
// телевизор (хост) применяет их и рассылает снимок состояния.
// Основной транспорт — PeerJS (WebRTC). ?net=local — BroadcastChannel
// для проверки в нескольких вкладках одного браузера.
(function (root) {
  var PREFIX = 'discogame-v1-';
  var useLocal = /[?&]net=local\b/.test(location.search);

  function localHost(room, h) {
    var ch = new BroadcastChannel(PREFIX + room);
    ch.onmessage = function (e) {
      var m = e.data;
      if (m.to !== 'host') return;
      if (m.kind === 'hello') h.onJoin && h.onJoin(m.from);
      if (m.kind === 'bye') h.onLeave && h.onLeave(m.from);
      if (m.kind === 'data') h.onMessage(m.from, m.data);
    };
    setTimeout(function () { h.onStatus && h.onStatus('online'); ch.postMessage({ to: '*', kind: 'hostup' }); }, 0);
    return {
      send: function (cid, data) { ch.postMessage({ to: cid, kind: 'data', data: data }); },
      peers: function () { return null; }
    };
  }
  function localClient(room, cid, h) {
    var ch = new BroadcastChannel(PREFIX + room);
    ch.onmessage = function (e) {
      var m = e.data;
      if (m.kind === 'hostup') { ch.postMessage({ to: 'host', kind: 'hello', from: cid }); return; }
      if (m.to === cid && m.kind === 'data') h.onMessage(m.data);
    };
    setTimeout(function () { ch.postMessage({ to: 'host', kind: 'hello', from: cid }); h.onStatus && h.onStatus('online'); }, 0);
    window.addEventListener('beforeunload', function () { ch.postMessage({ to: 'host', kind: 'bye', from: cid }); });
    return { send: function (data) { ch.postMessage({ to: 'host', kind: 'data', from: cid, data: data }); } };
  }

  // ---------- PeerJS ----------
  var PEER_OPTS = { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };

  function peerHost(room, h) {
    var conns = {}, peer = null, retry = 0;
    function start() {
      h.onStatus && h.onStatus('connecting');
      peer = new Peer(PREFIX + room, PEER_OPTS);
      peer.on('open', function () { retry = 0; h.onStatus && h.onStatus('online'); });
      peer.on('connection', function (conn) {
        var cid = (conn.metadata && conn.metadata.clientId) || conn.peer;
        conn.on('open', function () {
          if (conns[cid] && conns[cid] !== conn) { try { conns[cid].close(); } catch (e) {} }
          conns[cid] = conn;
          h.onJoin && h.onJoin(cid);
        });
        conn.on('data', function (d) { h.onMessage(cid, d); });
        conn.on('close', function () { if (conns[cid] === conn) { delete conns[cid]; h.onLeave && h.onLeave(cid); } });
        conn.on('error', function () {});
      });
      peer.on('disconnected', function () { h.onStatus && h.onStatus('connecting'); setTimeout(function () { if (!peer.destroyed) peer.reconnect(); }, 1500); });
      peer.on('error', function (err) {
        // после перезагрузки вкладки сервер ещё держит старый id — пробуем снова
        if (err.type === 'unavailable-id' || err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
          h.onStatus && h.onStatus(err.type === 'unavailable-id' ? 'busy' : 'offline');
          try { peer.destroy(); } catch (e) {}
          setTimeout(start, Math.min(10000, 2000 + retry++ * 1000));
        }
      });
    }
    start();
    return {
      send: function (cid, data) { var c = conns[cid]; if (c && c.open) c.send(data); },
      peers: function () { return Object.keys(conns); }
    };
  }

  function peerClient(room, cid, h) {
    var peer = null, conn = null, timer = null, alive = false;
    function schedule() { if (timer) return; timer = setTimeout(function () { timer = null; connect(); }, 2000); }
    function connect() {
      if (!peer || peer.destroyed) {
        peer = new Peer(PEER_OPTS);
        peer.on('open', connect);
        peer.on('error', function (err) {
          if (err.type === 'peer-unavailable') { h.onStatus && h.onStatus('nohost'); alive = false; schedule(); return; }
          h.onStatus && h.onStatus('offline');
          if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') { try { peer.destroy(); } catch (e) {} schedule(); }
        });
        peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { peer.reconnect(); }, 1500); });
        return;
      }
      if (!peer.open) return;
      h.onStatus && h.onStatus('connecting');
      conn = peer.connect(PREFIX + room, { reliable: true, metadata: { clientId: cid } });
      conn.on('open', function () { alive = true; h.onStatus && h.onStatus('online'); });
      conn.on('data', function (d) { h.onMessage(d); });
      conn.on('close', function () { alive = false; h.onStatus && h.onStatus('offline'); schedule(); });
      conn.on('error', function () { alive = false; schedule(); });
    }
    connect();
    // телефон уснул и проснулся — переподключиться
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !alive) { if (timer) { clearTimeout(timer); timer = null; } connect(); } });
    return { send: function (data) { if (conn && conn.open) conn.send(data); } };
  }

  root.Net = {
    local: useLocal,
    host: function (room, h) { return useLocal ? localHost(room, h) : peerHost(room, h); },
    client: function (room, cid, h) { return useLocal ? localClient(room, cid, h) : peerClient(room, cid, h); }
  };
})(window);
