// Экраны телевизора (хост). Режимы: «Одно устройство» (ввод на этом же экране)
// и «Телефоны» (ведущий и команды подключаются по QR, этот экран — источник истины).
(function () {
  var E = window.Engine, S = window.Sound;
  var GAME_NAME = 'ДИСКО-ГОД';
  var LS = { lobby: 'disco.lobby', game: 'disco.game', played: 'disco.played', room: 'disco.room', players: 'disco.players' };

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return 't' + Math.random().toString(36).slice(2, 8); }

  var ui = { screen: 'lobby', betIdx: 0, betHidden: true, betDraft: { bet: 0, slot: null }, prevPhase: null };
  var lobby = load(LS.lobby) || {
    teams: [{ id: uid(), name: 'Команда А', color: TEAM_COLORS[0] }, { id: uid(), name: 'Команда Б', color: TEAM_COLORS[1] }, { id: uid(), name: 'Команда В', color: TEAM_COLORS[2] }],
    settings: defaultSettings()
  };
  lobby.settings = Object.assign(defaultSettings(), lobby.settings);
  var game = load(LS.game);
  if (game && game.phase === 'GAME_END') game = null;

  // ---------- комната и телефоны ----------
  function newRoom() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = ''; for (var i = 0; i < 4; i++) r += a[Math.floor(Math.random() * a.length)]; return r; }
  var room = load(LS.room) || newRoom();
  save(LS.room, room);
  var players = load(LS.players) || {};   // clientId -> { role, teamId }
  var online = {};                        // clientId -> true
  var net = null;
  var netStatus = 'off';
  function isMulti() { return lobby.settings.mode === 'multi'; }
  function savePlayers() { save(LS.players, players); }
  function teamPlayers(teamId) {
    return Object.keys(players).filter(function (c) { return players[c].role === 'team' && players[c].teamId === teamId; });
  }
  function hostOnline() { return Object.keys(players).some(function (c) { return players[c].role === 'host' && online[c]; }); }
  function joinUrl(role) {
    var base = location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, '');
    var q = '?room=' + room + (role === 'host' ? '&role=host' : '') + (window.Net && Net.local ? '&net=local' : '');
    return base + 'phone.html' + q;
  }
  function startNet() {
    if (net || !window.Net || !window.Peer && !Net.local) return;
    net = Net.host(room, {
      onStatus: function (st) { netStatus = st; render(); },
      onJoin: function (cid) { online[cid] = true; sendState(cid); },
      onLeave: function (cid) { delete online[cid]; render(); },
      onMessage: onClientMessage
    });
  }
  function sanitize(g, role, teamId) {
    if (!g) return null;
    var c = JSON.parse(JSON.stringify(g));
    c.deckLeft = g.deck.length; delete c.deck; delete c.played; delete c.usedLines;
    if (role !== 'host') {
      var open = c.phase === 'REVEAL' || c.phase === 'RESULT';
      if (c.current && c.current.card && !open) {
        var k = c.current.card;
        c.current.card = { id: k.id, type: k.type, text: k.text, theme: k.theme };
      }
      if (c.phase !== 'LAST_BET_RESULT' && c.phase !== 'GAME_END') {
        if (c.lastBetCard) c.lastBetCard = { id: c.lastBetCard.id, type: c.lastBetCard.type, text: c.lastBetCard.text };
        if (c.lastBet) Object.keys(c.lastBet.bets).forEach(function (t) { if (t !== teamId) c.lastBet.bets[t] = { hidden: true }; });
      }
    }
    return c;
  }
  function viewFor(cid) {
    var p = players[cid] || {};
    return {
      t: 'state', room: room, role: p.role || null, teamId: p.teamId || null, hostOnline: hostOnline(),
      lobby: {
        settings: lobby.settings,
        teams: lobby.teams.map(function (t) { return { id: t.id, name: t.name, color: t.color, players: teamPlayers(t.id).length }; })
      },
      game: sanitize(game, p.role, p.teamId)
    };
  }
  function sendState(cid) { if (net) net.send(cid, viewFor(cid)); }
  function broadcast() { if (!net) return; Object.keys(online).forEach(sendState); }

  var TEAM_ACTIONS = { SET_ANSWER: 1, SUBMIT_ANSWER: 1, CHALLENGE: 1, CHALLENGE_SLOT: 1, CANCEL_CHALLENGE: 1, LAST_BET_SET: 1 };
  function teamMay(teamId, a) {
    if (!game || !TEAM_ACTIONS[a.type]) return false;
    var cur = game.current;
    switch (a.type) {
      case 'SET_ANSWER': case 'SUBMIT_ANSWER': return game.phase === 'PLAY' && cur.teamId === teamId;
      case 'CHALLENGE': return a.teamId === teamId;
      case 'CHALLENGE_SLOT': case 'CANCEL_CHALLENGE': return !!(cur.challenge && cur.challenge.teamId === teamId);
      case 'LAST_BET_SET': return a.teamId === teamId;
    }
    return false;
  }
  function onClientMessage(cid, m) {
    if (!m || typeof m !== 'object') return;
    online[cid] = true;
    var p = players[cid];
    if (m.t === 'hello') {
      if (m.role === 'host') players[cid] = { role: 'host' };
      else if (!p || p.role !== 'team') players[cid] = { role: 'team', teamId: null };
      if (players[cid].teamId && !E.findTeam({ teams: lobby.teams }, players[cid].teamId)) players[cid].teamId = null;
      savePlayers(); render(); broadcast(); return;
    }
    if (!p) return;
    if (p.role === 'team') {
      if (m.t === 'joinTeam' && !game) {
        if (E.findTeam({ teams: lobby.teams }, m.teamId)) { p.teamId = m.teamId; S.play('join'); }
      } else if (m.t === 'joinTeam' && game) {
        if (E.findTeam(game, m.teamId)) { p.teamId = m.teamId; }
      } else if (m.t === 'createTeam' && !game && lobby.teams.length < 8) {
        var name = String(m.name || '').trim().slice(0, 18) || ('Команда ' + 'АБВГДЕЖЗ'[lobby.teams.length]);
        var used = lobby.teams.map(function (t) { return t.color; });
        var color = TEAM_COLORS.filter(function (c) { return used.indexOf(c) < 0; })[0] || TEAM_COLORS[0];
        var t = { id: uid(), name: name, color: color };
        lobby.teams.push(t); saveLobby(); p.teamId = t.id; S.play('join');
      } else if (m.t === 'leaveTeam' && !game) {
        p.teamId = null;
      } else if (m.t === 'action' && p.teamId && teamMay(p.teamId, m.action)) {
        if (m.action.type === 'CHALLENGE') S.play('challenge');
        dispatch(m.action, { silent: m.action.type === 'SET_ANSWER' && !('slot' in m.action.answer) });
        if (m.action.type === 'SET_ANSWER' && !('slot' in m.action.answer)) broadcast();
        return;
      } else return;
      savePlayers(); render(); broadcast(); return;
    }
    if (p.role === 'host') hostCommand(m);
  }
  function hostCommand(m) {
    if (m.t === 'action') {
      if (m.action.type === 'CLOSE_CHALLENGE') S.play('drum');
      dispatch(m.action); return;
    }
    if (m.t === 'setting' && !game) {
      applySetting(m.key, m.value); saveLobby();
    } else if (m.t === 'removeTeam' && !game) {
      if (lobby.teams.length > 1) lobby.teams = lobby.teams.filter(function (t) { return t.id !== m.teamId; });
      Object.keys(players).forEach(function (c) { if (players[c].teamId === m.teamId) players[c].teamId = null; });
      saveLobby(); savePlayers();
    } else if (m.t === 'start') {
      if (game && game.phase !== 'GAME_END' && !m.force) return;
      startGame(); return;
    } else if (m.t === 'toLobby') {
      if (game && game.phase === 'GAME_END') { game = null; save(LS.game, null); }
      ui.screen = 'lobby';
    } else if (m.t === 'resume') {
      if (game) ui.screen = 'game';
    } else return;
    render(); broadcast();
  }
  function applySetting(k, v) {
    var s = lobby.settings;
    if (k === 'preset') { s.preset = v; if (PRESETS[v]) s.songShare = PRESETS[v].songShare; }
    else if (k === 'lastBet') s.lastBet = v === 'on' || v === true;
    else if (k === 'mod') { s.mods[v] = !s.mods[v]; s.preset = 'custom'; }
    else if (k === 'songShare') { s.songShare = Math.max(30, Math.min(90, Number(v) || 60)); }
    else if (k === 'reset') { lobby.settings = Object.assign(defaultSettings(), { mode: s.mode }); }
    else { s[k] = v; if (k === 'songLang' || k === 'modFrequency') s.preset = 'custom'; }
  }

  // ---------- состояние ----------
  function dispatch(action, opts) {
    if (!game) return;
    var next = E.reduce(game, action);
    if (next === game) return;
    var prev = game.phase;
    game = next;
    save(LS.game, game);
    if (opts && opts.silent) return;
    effects(prev, game);
    render();
    broadcast();
  }
  function effects(prev, g) {
    var p = g.phase;
    if (p === 'MODIFIER_REVEAL' && prev !== p) S.play('modifier');
    else if (p === 'PLAY' && prev !== p) S.play('card');
    else if (p === 'RESULT' && prev !== p) {
      var k = g.current.commentKind;
      S.play(k === 'exact' ? 'exact' : (k === 'wrong' || k === 'challengeLost') ? 'wrong' : 'right');
    } else if (p === 'LAST_BET_RESULT' && prev !== p) S.play('drum');
    else if (p === 'GAME_END' && prev !== p) { S.play('fanfare'); setTimeout(function () { S.music(true); }, 1200); }
  }
  function saveLobby() { save(LS.lobby, lobby); }

  // ---------- общие куски ----------
  function bg() {
    var pal = ['#FF3EA5', '#23E5DB', '#FFD23F', '#9B5CFF', '#FF8A3D'], tiles = '';
    for (var i = 0; i < 20; i++) tiles += '<div style="background:' + pal[(i * 3) % 5] + ';animation-delay:' + ((i * 0.37) % 1.6).toFixed(2) + 's"></div>';
    return '<div class="beam l"></div><div class="beam r"></div><div class="floor">' + tiles + '</div>';
  }
  function muteBtn() { return '<button class="iconbtn" data-act="mute" title="Звук">' + (S.isMuted() ? '🔇' : '🔊') + '</button>'; }
  function teamName(id) { var t = E.findTeam(game, id); return t ? t.name : ''; }

  function teamBox(t, opts) {
    opts = opts || {};
    var d = opts.delta;
    var deltaHtml = (d != null && d !== 0) ? '<span class="delta ' + (d > 0 ? 'plus' : 'minus') + '">' + (d > 0 ? '+' : '') + d + '</span>' : '';
    return '<div class="team' + (opts.active ? ' active' : '') + '" style="--c:' + t.color + '">' +
      '<div class="head"><div class="name"><div class="dot"></div><span>' + esc(t.name) + '</span>' +
      (opts.active ? '<div class="turn-tag">ХОДИТ</div>' : '') + '</div>' +
      '<div style="display:flex;gap:10px;align-items:center">' + deltaHtml + '<div class="score">' + t.score + '</div></div></div>' +
      '<div class="chips">' + t.timeline.map(function (c) { return '<div class="chip">' + c.year + '</div>'; }).join('') + '</div></div>';
  }

  // Лента со слотами. mode: 'pick' | 'challenge' | 'show'
  function timeline(team, o) {
    var tl = team.timeline, h = '';
    for (var i = 0; i <= tl.length; i++) {
      var cls = 'slot';
      if (o.sel === i) cls += ' sel';
      if (o.sel2 === i) cls += ' sel2';
      if (o.correctYear != null && E.slotOk(tl, i, o.correctYear)) cls += ' ok';
      var dis = !o.act || o.disabled === i;
      h += '<button class="' + cls + '"' + (dis ? ' disabled' : '') + ' data-act="' + (o.act || '') + '" data-arg="' + i + '">+</button>';
      if (i < tl.length) h += '<div class="chip" style="--c:' + team.color + '">' + tl[i].year + '</div>';
    }
    return '<div class="tl">' + h + '</div>';
  }

  function qrHtml(url) {
    if (window.qrcode) {
      try { var q = window.qrcode(0, 'M'); q.addData(url); q.make(); return '<div class="qr">' + q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) + '</div>'; } catch (e) {}
    }
    return '';
  }

  function cardHtml(card, opened) {
    if (card.type === 'song') {
      return '<div class="card"><div class="ch"><span>♪ ПЕСНЯ</span><span class="pix" style="font-size:20px">' + (opened ? card.year : '????') + '</span></div><div class="cb">' +
        (opened
          ? '<div class="bigyear">' + card.year + '</div><div class="songname">' + esc(card.artist) + ' — «' + esc(card.title) + '»</div>'
          : qrHtml(card.spotifyUrl) + '<div class="row" style="font-size:17px;font-weight:600">Ведущий, отсканируй код или <a class="btn cyan small" href="' + esc(card.spotifyUrl) + '" target="_blank" rel="noopener">Открыть в Spotify</a></div>') +
        '</div></div>';
    }
    return '<div class="card event"><div class="ch"><span>★ СОБЫТИЕ</span><span class="pix" style="font-size:20px">' + (opened ? card.year : '????') + '</span></div><div class="cb">' +
      '<div class="evtext">' + esc(card.text) + '</div>' + (opened ? '<div class="bigyear">' + card.year + '</div>' : '') + '</div></div>';
  }

  // ---------- ЛОББИ ----------
  function qrBig(url, size) {
    if (!window.qrcode) return '';
    try { var q = window.qrcode(0, 'M'); q.addData(url); q.make(); return '<div class="qr" style="padding:12px">' + q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }).replace('<svg ', '<svg style="width:' + size + 'px;height:' + size + 'px" ') + '</div>'; } catch (e) { return ''; }
  }
  function netLabel() {
    return { online: 'на связи', connecting: 'подключаемся…', busy: 'комната занята, ждём…', offline: 'нет связи, пробуем снова…', off: '' }[netStatus] || netStatus;
  }
  function renderLobby() {
    var s = lobby.settings, multi = isMulti();
    var n = lobby.teams.length, cards = n * CONFIG.deck.turnsPerTeam[s.length];
    var teamsHtml = lobby.teams.map(function (t, i) {
      var pc = teamPlayers(t.id).length;
      return '<div class="lteam" style="--c:' + t.color + '"><div style="display:flex;gap:8px;align-items:center"><div class="dot"></div>' +
        '<input type="text" maxlength="18" value="' + esc(t.name) + '" data-team-name="' + i + '">' +
        (n > 2 ? '<button class="iconbtn" style="width:38px;height:38px;flex:none" data-act="delTeam" data-arg="' + i + '">✕</button>' : '') + '</div>' +
        (multi ? '<div class="muted" style="font-size:16px">' + (pc ? '📱 игроков: ' + pc : 'ждём игроков…') + '</div>' : '') +
        '<div class="colors">' + TEAM_COLORS.map(function (c) {
          return '<div class="sw' + (c === t.color ? ' on' : '') + '" style="background:' + c + '" data-act="color" data-arg="' + i + ':' + c + '"></div>';
        }).join('') + '</div></div>';
    }).join('') + (n < 8 ? '<button class="addteam" data-act="addTeam">+ Команда</button>' : '');
    var info = '<div class="muted" style="font-size:18px">' + esc(PRESETS[s.preset] ? PRESETS[s.preset].name : 'Свои настройки') + ' · ' + cards + ' карточек · около ' +
      Math.round(cards * CONFIG.deck.minutesPerTurn) + ' мин</div>';
    var buttons = '<div class="row">' +
      (game ? '<button class="btn cyan" data-act="resume">Продолжить партию</button>' : '') +
      '<button class="btn ghost" data-act="toSettings">Настройки партии</button>' +
      '<button class="btn pink" data-act="start">' + (game ? 'Новая партия' : 'Начать игру') + '</button></div>';
    var top = '<div class="topbar"><div class="logo">' + GAME_NAME + '</div><div class="badges">' +
      '<button class="badge pink" style="background:none;color:#fff;cursor:pointer" data-act="toggleMode">' + (multi ? '📱 Телефоны' : '💻 Одно устройство') + ' · сменить</button>' + muteBtn() + '</div></div>';
    if (!multi) {
      return bg() + '<div class="layer">' + top + '<div class="screen"><div class="ball" style="margin-top:6px"></div>' +
        '<h2 style="font-size:40px;margin:0">Собираем команды</h2><div class="lobby-grid">' + teamsHtml + '</div>' + info + buttons + '</div></div>';
    }
    var ho = hostOnline();
    return bg() + '<div class="layer">' + top + '<div class="lobby-multi">' +
      '<div class="lm-left"><h2 style="font-size:36px;margin:0">Собираем команды</h2><div class="lobby-grid three">' + teamsHtml + '</div>' + info + buttons + '</div>' +
      '<div class="lm-right"><div class="joinbox">' + qrBig(joinUrl('team'), 230) +
      '<div class="russo" style="font-size:24px;color:var(--cyan)">Подключайтесь с телефона</div>' +
      '<div style="font-size:17px;color:var(--muted)">Сканируйте код. Комната</div><div class="pix" style="font-size:38px;color:var(--pink);letter-spacing:4px">' + room + '</div>' +
      '<div class="muted" style="font-size:14px">Связь: ' + netLabel() + '</div></div>' +
      '<div class="hostbox">' + qrBig(joinUrl('host'), 96) + '<div><div class="russo" style="font-size:18px;color:var(--yellow)">Пульт ведущего</div>' +
      '<div style="font-size:15px;color:var(--muted)">' + (ho ? '✅ ведущий подключён' : 'Ведущий сканирует этот код') + '</div></div></div>' +
      '</div></div></div>';
  }

  // ---------- НАСТРОЙКИ ----------
  function seg(key, options, cur) {
    return '<div class="seg">' + options.map(function (o) {
      return '<button class="' + (o[0] === cur ? 'on' : '') + '" data-act="set" data-arg="' + key + ':' + o[0] + '"' + (o[2] ? ' disabled' : '') + '>' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function renderSettings() {
    var s = lobby.settings, n = lobby.teams.length;
    var total = n * CONFIG.deck.turnsPerTeam[s.length];
    var songs = Math.round(total * s.songShare / 100);
    var bank = BANK.filter(function (c) { return c.yearVerified; });
    var bs = bank.filter(function (c) { return c.type === 'song' && (s.songLang === 'all' || c.lang === s.songLang); }).length;
    var be = bank.filter(function (c) { return c.type !== 'song'; }).length;
    var warn = [];
    if (total + n + 1 > bs + be) warn.push('В банке ' + (bs + be) + ' карточек, а партии нужно ' + (total + n + 1) + ' (с учётом стартовых). Сократите партию или уменьшите число команд.');
    else {
      if (songs > bs) warn.push('Песен в банке ' + bs + ', а нужно ' + songs + '. Уменьшите долю песен — иначе добавлю событий.');
      if (total - songs > be) warn.push('Событий в банке ' + be + ', а нужно ' + (total - songs) + '. Увеличьте долю песен — иначе добавлю песен.');
    }
    var mods = Object.keys(MODIFIERS).map(function (k) {
      return '<button class="' + (s.mods[k] ? 'on' : '') + '" data-act="mod" data-arg="' + k + '">' + MODIFIERS[k].label + '</button>';
    }).join('');
    return bg() + '<div class="layer"><div class="topbar"><div class="logo">НАСТРОЙКИ ПАРТИИ</div><div class="badges">' + muteBtn() + '</div></div>' +
      '<div class="screen" style="margin-top:20px">' +
      '<div class="settings">' +
      '<div class="set" style="grid-column:1/3"><div class="lab">Пресет</div>' +
      seg('preset', [['less', 'Менее музыкальная · 50/50'], ['standard', 'Стандартная · 60/40'], ['more', 'Более музыкальная · 75/25'], ['custom', 'Свои настройки']], s.preset) + '</div>' +
      '<div class="set"><div class="lab">Длина партии <span class="pix" style="font-size:13px;color:var(--yellow)">' + total + ' карт · ~' + total * CONFIG.deck.minutesPerTurn + ' мин</span></div>' +
      seg('length', [['short', 'Коротко · 8 ходов'], ['normal', 'Норм · 9'], ['long', 'Долго · 12']], s.length) + '</div>' +
      '<div class="set"><div class="lab">Песни / события <span class="pix" style="font-size:13px;color:var(--yellow)">' + s.songShare + ' / ' + (100 - s.songShare) + '</span></div>' +
      '<input type="range" min="30" max="90" step="5" value="' + s.songShare + '" data-range="songShare"><div class="muted" style="font-size:14px">' + songs + ' песен, ' + (total - songs) + ' событий</div></div>' +
      '<div class="set"><div class="lab">Песни</div>' + seg('songLang', [['all', 'Все'], ['ru', 'Только русские'], ['foreign', 'Только иностранные']], s.songLang) + '</div>' +
      '<div class="set"><div class="lab">Частота модификаторов</div>' + seg('modFrequency', [['off', 'Выкл'], ['rare', 'Редко'], ['medium', 'Средне'], ['often', 'Часто']], s.modFrequency) + '</div>' +
      '<div class="set"><div class="lab">Модификаторы</div><div class="seg">' + mods + '</div></div>' +
      '<div class="set"><div class="lab">Финал</div>' + seg('lastBet', [['on', 'С «Последней ставкой»'], ['off', 'Без неё']], s.lastBet ? 'on' : 'off') +
      '<div class="muted" style="font-size:14px;margin-top:8px">Финальный круг ×2 — последние ' + n + ' карточек</div></div>' +
      '<div class="set"><div class="lab">Режим</div>' + seg('mode', [['single', 'Одно устройство'], ['multi', 'Телефоны ведущего и команд']], s.mode) + '</div>' +
      '<div class="set"><div class="lab">Особые карточки ★</div><div class="muted" style="font-size:15px">Блиц, Дуэль, Аукцион и другие появятся в следующей версии.</div></div>' +
      '</div>' +
      (warn.length ? '<div class="warn">' + warn.map(esc).join('<br>') + '</div>' : '') +
      '<div class="row"><button class="btn ghost" data-act="resetSettings">Сбросить к стандартной</button><button class="btn" data-act="toLobby">Готово</button></div>' +
      '</div></div>';
  }

  // ---------- СТОЛ ----------
  function renderBoard() {
    var g = game, cur = g.current, active = cur ? cur.teamId : null;
    var deltas = (g.phase === 'RESULT' && cur.result) ? cur.result.applied : (g.phase === 'LAST_BET_RESULT' ? g.lastBet.applied : {});
    var teams = g.teams.map(function (t) { return teamBox(t, { active: t.id === active && g.phase !== 'LAST_BET' && g.phase !== 'LAST_BET_RESULT', delta: deltas[t.id] }); });
    var half = Math.ceil(teams.length / 2);
    var played = g.deckTotal - g.deck.length;
    var isFinalRound = cur && cur.final;
    var top = '<div class="topbar"><div class="logo">' + GAME_NAME + '</div><div class="badges">' +
      (isFinalRound && g.phase.indexOf('LAST_BET') < 0 ? '<div class="badge final">ФИНАЛЬНЫЙ КРУГ ×2</div>' : '') +
      (g.phase.indexOf('LAST_BET') === 0 ? '<div class="badge final">ПОСЛЕДНЯЯ СТАВКА</div>' : '<div class="badge">Карточка <span class="pix">' + played + ' / ' + g.deckTotal + '</span></div>') +
      muteBtn() + '<button class="iconbtn" data-act="toLobby" title="В лобби">☰</button></div></div>';
    var center = '<div class="center">' + centerHtml() + '</div>';
    var html = bg() + '<div class="layer">' + top + '<div class="board"><div class="col">' + teams.slice(0, half).join('') + '</div>' + center +
      '<div class="col">' + teams.slice(half).join('') + '</div></div></div>';
    if (g.phase === 'MODIFIER_REVEAL') {
      var m = MODIFIERS[cur.modifier];
      html += '<div class="overlay"><div class="sub">' + esc(teamName(cur.teamId)) + ', модификатор хода</div><div class="huge">' + m.label + '</div><div class="sub">' + m.text + '</div>' +
        '<button class="btn pink" data-act="modContinue">' + (cur.modifier === 'skip' ? 'Ход переходит дальше' : 'Тянуть карточку') + '</button></div>';
    }
    return html;
  }

  function modTag() {
    var cur = game.current, h = '';
    if (cur.modifier && cur.modifier !== 'skip') h += '<div class="modtag">⚡ ' + MODIFIERS[cur.modifier].label + '</div>';
    return h;
  }

  function centerHtml() {
    var g = game, cur = g.current;
    switch (g.phase) {
      case 'MODIFIER_REVEAL': return '';
      case 'PLAY': return modTag() + cardHtml(cur.card, false) + (isMulti() ? tvAnswerStatus() : answerPanel());
      case 'CHALLENGE': return modTag() + cardHtml(cur.card, false) + (isMulti() ? tvChallengeStatus() : challengePanel());
      case 'REVEAL': return modTag() + cardHtml(cur.card, true) + revealPanel();
      case 'RESULT': return resultPanel();
      case 'LAST_BET': return isMulti() ? tvLastBetStatus() : lastBetPanel();
      case 'LAST_BET_RESULT': return lastBetResult();
    }
    return '';
  }

  // ---------- статусы для телевизора в режиме «Телефоны» ----------
  function tvAnswerStatus() {
    var cur = game.current, team = E.findTeam(game, cur.teamId);
    return '<div class="panel"><div class="title" style="color:' + team.color + '">' + esc(team.name) + ' отвечает на телефоне…</div>' +
      timeline(team, { sel: cur.answer.slot }) +
      '<div class="muted" style="text-align:center">' + (cur.answer.slot == null ? 'Выбирают место в ленте' : 'Место выбрано, ждём подтверждения') + '</div></div>';
  }
  function tvChallengeStatus() {
    var cur = game.current, team = E.findTeam(game, cur.teamId), ch = cur.challenge;
    var h = '<div class="panel"><div class="title">' + (ch ? '<span style="color:' + E.findTeam(game, ch.teamId).color + '">' + esc(teamName(ch.teamId)) + ' бросает вызов!</span>' : 'Окно вызова открыто: жмите «Вызов!» на телефоне') + '</div>' +
      timeline(team, { sel: cur.answer.slot, sel2: ch ? ch.slot : null });
    h += '<div class="muted" style="text-align:center">' + (ch && ch.slot == null ? 'Выбирают другое место…' : 'Ведущий открывает год, когда все готовы') + '</div></div>';
    return h;
  }
  function tvLastBetStatus() {
    var g = game;
    return cardHtml(g.lastBetCard, false) + '<div class="panel"><div class="title">Последняя ставка: каждая команда тайно ставит на телефоне</div><div class="row">' +
      g.teams.map(function (t) {
        var done = g.lastBet.bets[t.id] && g.lastBet.bets[t.id].slot != null;
        return '<span class="badge" style="border-color:' + t.color + '">' + esc(t.name) + ' ' + (done ? '✅' : '⏳') + '</span>';
      }).join('') + '</div></div>';
  }

  function answerPanel() {
    var cur = game.current, team = E.findTeam(game, cur.teamId), a = cur.answer, song = cur.card.type === 'song';
    return '<div class="panel"><div class="title" style="color:' + team.color + '">' + esc(team.name) + ': куда в ленту?</div>' +
      timeline(team, { sel: a.slot, act: 'slot' }) +
      '<div class="fields"><label>Точный год (+10)<input type="number" min="1900" max="2100" placeholder="—" value="' + esc(a.year) + '" data-ans="year"></label>' +
      (song ? '<label>Исполнитель (+5)<input type="text" value="' + esc(a.artist) + '" data-ans="artist"></label><label>Название (+5)<input type="text" value="' + esc(a.title) + '" data-ans="title"></label>' : '') +
      '</div><div class="row"><button class="btn" data-act="submit"' + (a.slot == null ? ' disabled' : '') + '>Ответ готов</button></div></div>';
  }

  function challengePanel() {
    var cur = game.current, team = E.findTeam(game, cur.teamId), ch = cur.challenge;
    var h = '<div class="panel"><div class="title">Кто-то хочет оспорить? <span class="muted" style="font-size:15px;font-family:Rubik">Вызов спорит только место</span></div>';
    if (!ch) {
      h += timeline(team, { sel: cur.answer.slot }) + '<div class="row">' + game.teams.filter(function (t) { return t.id !== cur.teamId; }).map(function (t) {
        return '<button class="btn small" style="background:' + t.color + ';box-shadow:none" data-act="challenge" data-arg="' + t.id + '">' + esc(t.name) + ': Вызов!</button>';
      }).join('') + '</div>';
    } else {
      var ct = E.findTeam(game, ch.teamId);
      h += '<div style="color:' + ct.color + ';font-family:Russo One;font-size:18px">' + esc(ct.name) + ' бросает вызов! Выберите другое место:</div>' +
        timeline(team, { sel: cur.answer.slot, sel2: ch.slot, act: 'chSlot', disabled: cur.answer.slot }) +
        '<div class="row"><button class="btn ghost small" data-act="cancelChallenge">Отменить вызов</button></div>';
    }
    h += '<div class="row"><button class="btn pink" data-act="closeChallenge"' + (ch && ch.slot == null ? ' disabled' : '') + '>Открыть год</button></div></div>';
    return h;
  }

  function revealPanel() {
    var cur = game.current, card = cur.card, team = E.findTeam(game, cur.teamId), a = cur.answer;
    var r = E.computeTurn(game);
    var h = '<div class="panel">' + timeline(team, { sel: a.slot, sel2: cur.challenge ? cur.challenge.slot : null, correctYear: card.year }) +
      '<div class="row muted" style="font-size:16px">' + (a.year !== '' ? 'Год команды: <b style="color:#fff">' + esc(a.year) + '</b>' + (r.yearOk ? ' ✅' : ' ❌') : 'Год не назван') + '</div>';
    if (card.type === 'song') {
      ['artist', 'title'].forEach(function (f) {
        var val = a[f];
        h += '<div class="verdict"><div class="what">' + (f === 'artist' ? 'Исполнитель' : 'Название') + ': <b>' + (val ? esc(val) : '—') + '</b>' +
          (val ? '<small>' + (cur.suggest[f] ? 'Игра думает: похоже, верно' : 'Игра думает: не совпало') + '</small>' : '') + '</div>' +
          (val ? '<div style="display:flex;gap:6px"><button class="vbtn yes' + (cur.verdict[f] ? ' on' : '') + '" data-act="verdict" data-arg="' + f + ':1">✅</button>' +
            '<button class="vbtn no' + (!cur.verdict[f] ? ' on' : '') + '" data-act="verdict" data-arg="' + f + ':0">❌</button></div>' : '') + '</div>';
      });
    }
    h += '<div class="row"><span class="muted">Ведущий проверяет и засчитывает</span><button class="btn" data-act="confirm">Засчитать</button></div></div>';
    return h;
  }

  function resultPanel() {
    var cur = game.current, r = cur.result, card = cur.card;
    var placed = r.placedTo ? 'Карточка уходит в ленту: ' + esc(teamName(r.placedTo)) : 'Карточка сгорает';
    var h = '<div class="comment">' + esc(cur.comment) + '</div>' + cardHtml(card, true) +
      '<div class="panel"><div class="lines">' + r.lines.map(esc).join(' · ') + '</div><div>' + placed + '</div>';
    if (cur.challenge) {
      h += '<div class="muted">Вызов от ' + esc(teamName(cur.challenge.teamId)) + ': ' + (r.challengeOk ? 'место верное' : 'место неверное') + '</div>';
    }
    h += '<div class="row">' + Object.keys(r.applied).map(function (id) {
      var d = r.applied[id];
      return '<span style="font-size:18px">' + esc(teamName(id)) + ': <b class="pix" style="font-size:15px;color:' + (d > 0 ? 'var(--good)' : d < 0 ? 'var(--bad)' : 'var(--muted)') + '">' + (d > 0 ? '+' : '') + d + '</b></span>';
    }).join('') + '</div>';
    var last = game.deck.length === 0;
    h += '<div class="row"><button class="btn pink" data-act="next">' + (last ? (game.settings.lastBet ? 'К последней ставке' : 'К итогам') : 'Следующий ход') + '</button></div></div>';
    return h;
  }

  // Последняя ставка: тайно, по очереди
  function lastBetPanel() {
    var g = game, teams = g.teams, i = ui.betIdx;
    if (i >= teams.length) {
      return cardHtml(g.lastBetCard, false) + '<div class="panel"><div class="title">Все ставки сделаны!</div><div class="row">' +
        '<button class="btn pink" data-act="lastBetReveal">Открыть год</button></div></div>';
    }
    var t = teams[i];
    if (ui.betHidden) {
      return '<div class="panel cover"><div class="title" style="font-size:28px;color:' + t.color + '">' + esc(t.name) + '</div>' +
        '<div class="muted" style="font-size:18px;text-align:center">Остальные отворачиваются. Ставка и ответ тайные.<br>Ставить можно любую часть своих очков (сейчас ' + t.score + ').</div>' +
        '<button class="btn" data-act="betShow">Мы готовы</button></div>';
    }
    var d = ui.betDraft;
    return cardHtml(g.lastBetCard, false) + '<div class="panel"><div class="title" style="color:' + t.color + '">' + esc(t.name) + ': ставка и место</div>' +
      timeline(t, { sel: d.slot, act: 'betSlot' }) +
      '<div class="fields"><label>Ставка (0–' + t.score + ')<input type="number" min="0" max="' + t.score + '" value="' + d.bet + '" data-bet="1"></label></div>' +
      '<div class="row"><button class="btn" data-act="betSave"' + (d.slot == null ? ' disabled' : '') + '>Спрятать ответ</button></div></div>';
  }
  function lastBetResult() {
    var g = game, card = g.lastBetCard;
    return cardHtml(card, true) + '<div class="panel"><div class="row">' + g.teams.map(function (t) {
      var b = g.lastBet.bets[t.id], ok = g.lastBet.results[t.id], d = g.lastBet.applied[t.id];
      return '<span style="font-size:18px">' + esc(t.name) + ' (ставка ' + b.bet + '): ' + (ok ? '✅' : '❌') + ' <b class="pix" style="font-size:14px;color:' + (d > 0 ? 'var(--good)' : d < 0 ? 'var(--bad)' : 'var(--muted)') + '">' + (d > 0 ? '+' : '') + d + '</b></span>';
    }).join('') + '</div><div class="row"><button class="btn pink" data-act="finish">К итогам</button></div></div>';
  }

  // ---------- ПОБЕДИТЕЛЬ ----------
  function renderWinner() {
    var st = E.standings(game);
    var order = [1, 0, 2], heights = [300, 220, 160], cols = ['#FFD23F', '#C9CCE0', '#FF8A3D'];
    var pod = order.filter(function (i) { return st[i]; }).map(function (i) {
      var t = st[i];
      return '<div class="step" style="animation-delay:' + (0.3 * (2 - i)) + 's"><div class="russo" style="font-size:28px;color:' + t.color + ';text-align:center">' + esc(t.name) + '</div>' +
        '<div class="score" style="font-size:30px">' + t.score + '</div><div class="muted">лента: ' + t.timeline.length + '</div>' +
        '<div class="ped" style="height:' + heights[i] + 'px;background:' + cols[i] + '">' + (i + 1) + '</div></div>';
    }).join('');
    var others = st.slice(3).map(function (t, k) {
      return '<div class="badge" style="border-color:' + t.color + '">' + (k + 4) + '. ' + esc(t.name) + ' · <span class="pix">' + t.score + '</span></div>';
    }).join('');
    return bg() + '<div class="layer"><div class="topbar"><div class="logo">' + GAME_NAME + '</div><div class="badges">' + muteBtn() + '</div></div>' +
      '<div class="screen"><div class="ball"></div><div class="logo" style="font-size:64px">ПОБЕДА: ' + esc(st[0].name) + '!</div>' +
      '<div class="podium">' + pod + '</div><div class="others">' + others + '</div>' +
      '<div class="row"><button class="btn pink" data-act="newGame">Новая партия</button></div></div></div>';
  }

  // ---------- рендер ----------
  var stage = document.getElementById('stage');
  function render() {
    var html;
    if (ui.screen === 'settings') html = renderSettings();
    else if (ui.screen === 'lobby' || !game) html = renderLobby();
    else if (game.phase === 'GAME_END') html = renderWinner();
    else html = renderBoard();
    var key = ui.screen + ':' + (game ? game.phase + ':' + game.turn + ':' + (ui.betIdx) + ui.betHidden : '');
    stage.classList.toggle('enter', key !== ui.lastKey);
    ui.lastKey = key;
    stage.innerHTML = html;
    S.music(ui.screen !== 'game' || !game || game.phase === 'GAME_END');
  }
  function fit() {
    var k = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stage.style.transform = 'scale(' + k + ')';
  }
  window.addEventListener('resize', fit);

  // ---------- события ----------
  document.addEventListener('pointerdown', function () { S.unlock(); }, { once: false });

  stage.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var act = el.getAttribute('data-act'), arg = el.getAttribute('data-arg');
    if (act !== 'mute') S.play('click');
    var s = lobby.settings;
    switch (act) {
      case 'mute': S.toggleMute(); break;
      case 'addTeam':
        var used = lobby.teams.map(function (t) { return t.color; });
        var color = TEAM_COLORS.filter(function (c) { return used.indexOf(c) < 0; })[0] || TEAM_COLORS[0];
        lobby.teams.push({ id: uid(), name: 'Команда ' + 'АБВГДЕЖЗ'[lobby.teams.length], color: color });
        S.play('join'); saveLobby(); break;
      case 'delTeam': lobby.teams.splice(Number(arg), 1); saveLobby(); break;
      case 'color': var p = arg.split(':'); lobby.teams[Number(p[0])].color = p[1]; saveLobby(); break;
      case 'toSettings': ui.screen = 'settings'; break;
      case 'toLobby': ui.screen = 'lobby'; break;
      case 'resume': ui.screen = 'game'; break;
      case 'set':
        var kv = arg.split(':');
        applySetting(kv[0], kv[1]);
        if (kv[0] === 'mode' && kv[1] === 'multi') startNet();
        saveLobby(); break;
      case 'toggleMode':
        s.mode = s.mode === 'multi' ? 'single' : 'multi';
        if (s.mode === 'multi') startNet();
        saveLobby(); break;
      case 'mod': s.mods[arg] = !s.mods[arg]; s.preset = 'custom'; saveLobby(); break;
      case 'resetSettings': lobby.settings = defaultSettings(); saveLobby(); break;
      case 'start':
      case 'newGame':
        if (act === 'start' && game && !confirmNew()) return;
        startGame(); return;
      case 'modContinue': dispatch({ type: 'MODIFIER_CONTINUE' }); return;
      case 'slot': dispatch({ type: 'SET_ANSWER', answer: { slot: Number(arg) } }); return;
      case 'submit': dispatch({ type: 'SUBMIT_ANSWER' }); return;
      case 'challenge': S.play('challenge'); dispatch({ type: 'CHALLENGE', teamId: arg }); return;
      case 'chSlot': dispatch({ type: 'CHALLENGE_SLOT', slot: Number(arg) }); return;
      case 'cancelChallenge': dispatch({ type: 'CANCEL_CHALLENGE' }); return;
      case 'closeChallenge': S.play('drum'); dispatch({ type: 'CLOSE_CHALLENGE' }); return;
      case 'verdict': var fv = arg.split(':'); dispatch({ type: 'SET_VERDICT', field: fv[0], value: fv[1] === '1' }); return;
      case 'confirm': dispatch({ type: 'CONFIRM_REVEAL' }); return;
      case 'next':
        if (game.deck.length === 0) { ui.betIdx = 0; ui.betHidden = true; ui.betDraft = { bet: 0, slot: null }; }
        dispatch({ type: 'NEXT_TURN' }); return;
      case 'betShow': ui.betHidden = false; ui.betDraft = { bet: 0, slot: null }; break;
      case 'betSlot': ui.betDraft.slot = Number(arg); break;
      case 'betSave':
        var t = game.teams[ui.betIdx];
        dispatch({ type: 'LAST_BET_SET', teamId: t.id, bet: ui.betDraft.bet, slot: ui.betDraft.slot }, { silent: true });
        ui.betIdx++; ui.betHidden = true; break;
      case 'lastBetReveal': dispatch({ type: 'LAST_BET_REVEAL' }); return;
      case 'finish': dispatch({ type: 'FINISH' }); return;
    }
    render();
    broadcast();
  });

  function confirmNew() {
    // без системных диалогов: второе нажатие подтверждает
    if (ui.confirmNew) { ui.confirmNew = false; return true; }
    ui.confirmNew = true;
    var b = stage.querySelector('[data-act="start"]');
    if (b) b.textContent = 'Точно? Текущая партия пропадёт';
    setTimeout(function () { ui.confirmNew = false; }, 4000);
    return false;
  }

  function startGame() {
    var played = load(LS.played) || [];
    var settings = JSON.parse(JSON.stringify(lobby.settings));
    var teams = lobby.teams;
    if (isMulti()) {
      // в игре участвуют команды, где есть хотя бы один игрок
      var withPlayers = teams.filter(function (t) { return teamPlayers(t.id).length > 0; });
      if (withPlayers.length) teams = withPlayers;
    }
    ui.betIdx = 0; ui.betHidden = true; ui.betDraft = { bet: 0, slot: null };
    game = E.reduce(null, { type: 'START_GAME', settings: settings, teams: teams, bank: BANK, played: played });
    save(LS.played, game.played);
    save(LS.game, game);
    ui.screen = 'game';
    S.music(false);
    if (game.phase === 'MODIFIER_REVEAL') S.play('modifier'); else S.play('card');
    render();
    broadcast();
  }

  stage.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-team-name')) { lobby.teams[Number(el.getAttribute('data-team-name'))].name = el.value || 'Команда'; saveLobby(); broadcast(); }
    else if (el.hasAttribute('data-range')) {
      lobby.settings[el.getAttribute('data-range')] = Number(el.value);
      lobby.settings.preset = 'custom';
      var match = Object.keys(PRESETS).filter(function (k) { return PRESETS[k].songShare === Number(el.value); })[0];
      if (match) lobby.settings.preset = match;
      saveLobby();
    } else if (el.hasAttribute('data-ans')) {
      var o = {}; o[el.getAttribute('data-ans')] = el.value;
      dispatch({ type: 'SET_ANSWER', answer: o }, { silent: true });
    } else if (el.hasAttribute('data-bet')) {
      ui.betDraft.bet = Number(el.value) || 0;
    }
  });
  stage.addEventListener('change', function (e) { if (e.target.hasAttribute('data-range')) render(); });

  window.__game = { get state() { return game; }, dispatch: dispatch };
  if (game) ui.screen = 'game';
  if (isMulti()) startNet();
  fit();
  render();
})();
