// Телефон: пульт ведущего (?role=host) или телефон команды.
(function () {
  var E = window.Engine;
  var params = new URLSearchParams(location.search);
  var room = (params.get('room') || '').toUpperCase();
  var wantRole = params.get('role') === 'host' ? 'host' : 'team';
  var app = document.getElementById('app');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var cid = params.get('cid') || ls('disco.cid.' + wantRole);
  if (!cid) { cid = wantRole[0] + Math.random().toString(36).slice(2, 10); ls('disco.cid.' + wantRole, cid); }

  var view = null, status = 'connecting', net = null;
  var draft = { year: '', artist: '', title: '', bet: '', betSlot: null, turnKey: null, newTeam: '' };

  function send(m) { if (net) net.send(m); }
  function act(a) { send({ t: 'action', action: a }); }

  // ---------- общие куски ----------
  function teamOf(id) { if (!view) return null; var g = view.game; var src = g ? g.teams : view.lobby.teams; for (var i = 0; i < src.length; i++) if (src[i].id === id) return src[i]; return null; }
  function statusBadge() {
    var map = { online: ['на связи', 'ok'], connecting: ['подключаемся…', ''], nohost: ['ждём телевизор…', 'bad'], offline: ['нет связи…', 'bad'] };
    var m = map[status] || [status, ''];
    return '<span class="net ' + m[1] + '">' + m[0] + '</span>';
  }
  function top(extra) { return '<div class="top"><div class="logo">ДИСКО-ГОД</div>' + statusBadge() + '</div>' + (extra || ''); }
  function meBox(t) {
    if (!t) return '';
    return '<div class="me" style="--c:' + t.color + '"><div class="n"><div class="dot"></div>' + esc(t.name) + '</div>' + (t.score != null ? '<div class="score">' + t.score + '</div>' : '') + '</div>';
  }
  function timeline(team, o) {
    var tl = team.timeline, h = '';
    for (var i = 0; i <= tl.length; i++) {
      var label = i === 0 ? (tl.length ? 'раньше ' + tl[0].year : 'сюда') : i === tl.length ? 'позже ' + tl[i - 1].year : 'между ' + tl[i - 1].year + ' и ' + tl[i].year;
      var cls = 'slot' + (o.sel === i ? ' sel' : '') + (o.sel2 === i ? ' sel2' : '');
      var dis = !o.act || o.disabled === i;
      h += '<button class="' + cls + '"' + (dis ? ' disabled' : '') + ' data-act="' + (o.act || '') + '" data-arg="' + i + '">' + label + '</button>';
      if (i < tl.length) h += '<div class="chip" style="--c:' + team.color + '">' + tl[i].year + '</div>';
    }
    return '<div class="tl">' + h + '</div>';
  }
  function modBox(cur) { return cur && cur.modifier && cur.modifier !== 'skip' ? '<div class="mod">⚡ ' + MODIFIERS[cur.modifier].label + ' — ' + MODIFIERS[cur.modifier].text + '</div>' : ''; }
  function finalBox(cur) { return cur && cur.final ? '<div class="mod" style="background:var(--yellow);color:var(--bg)">ФИНАЛЬНЫЙ КРУГ ×2</div>' : ''; }

  // ---------- КОМАНДА ----------
  function renderTeam() {
    var g = view.game, myId = view.teamId, me = teamOf(myId);
    if (!myId || !me) return renderJoin();
    if (!g) {
      return top() + meBox(me) + '<div class="box center"><h1>Вы в игре!</h1><div class="muted">Ждём, когда ведущий начнёт партию. Смотрите на телевизор.</div></div>' +
        '<button class="btn ghost" data-act="leave">Сменить команду</button>';
    }
    var cur = g.current, mine = cur && cur.teamId === myId, activeTeam = cur ? teamOf(cur.teamId) : null;
    var h = top() + meBox(me);
    switch (g.phase) {
      case 'MODIFIER_REVEAL':
        h += '<div class="box center"><div class="muted">Модификатор хода команды «' + esc(activeTeam.name) + '»</div><div class="mod" style="font-size:30px">' + MODIFIERS[cur.modifier].label + '</div><div>' + MODIFIERS[cur.modifier].text + '</div></div>';
        break;
      case 'PLAY':
        h += finalBox(cur) + modBox(cur);
        if (mine) {
          resetDraftIfNewTurn(g);
          var song = cur.card.type === 'song';
          h += '<div class="box hl"><h1>Ваш ход!</h1><div class="muted">' + (song ? '♪ Слушайте песню. Когда она вышла?' : '★ Событие: <b style="color:#fff">' + esc(cur.card.text) + '</b>') + '</div>' +
            '<h2>1. Куда в вашу ленту?</h2>' + timeline(me, { sel: cur.answer.slot, act: 'slot' }) +
            '<h2>2. Бонусы (по желанию)</h2>' +
            '<label>Точный год (+10)<input id="f-year" type="number" inputmode="numeric" placeholder="например, 1986" value="' + esc(draft.year) + '" data-f="year"></label>' +
            (song ? '<label>Исполнитель (+5)<input id="f-artist" type="text" autocomplete="off" value="' + esc(draft.artist) + '" data-f="artist"></label>' +
              '<label>Название (+5)<input id="f-title" type="text" autocomplete="off" value="' + esc(draft.title) + '" data-f="title"></label>' : '') +
            '<button class="btn pink" data-act="submit"' + (cur.answer.slot == null ? ' disabled' : '') + '>Ответ готов</button></div>';
        } else {
          h += '<div class="box center"><h1>Отвечает «' + esc(activeTeam.name) + '»</h1>' +
            (cur.card.type === 'event' ? '<div class="muted">Событие: <b style="color:#fff">' + esc(cur.card.text) + '</b></div>' : '<div class="muted">♪ Играет песня</div>') +
            '<div class="muted small">Готовьтесь: после их ответа можно бросить вызов.</div></div>';
        }
        break;
      case 'CHALLENGE':
        h += modBox(cur);
        var ch = cur.challenge;
        if (mine) h += '<div class="box center"><h1>Ответ принят</h1><div class="muted">Ждём вызовов от соперников…</div></div>';
        else if (!ch) {
          h += '<div class="box center"><div class="muted">«' + esc(activeTeam.name) + '» поставили карточку. Думаете, ошиблись?</div>' +
            timeline(activeTeam, { sel: cur.answer.slot }) +
            '<button class="btn pink big" data-act="challenge">ВЫЗОВ!</button><div class="muted small">Если ошибётесь, потеряете очки на кону.</div></div>';
        } else if (ch.teamId === myId) {
          h += '<div class="box hl"><h1>Ваш вызов! Куда на самом деле?</h1><div class="muted small">Выберите место в ленте «' + esc(activeTeam.name) + '», не то, что выбрали они.</div>' +
            timeline(activeTeam, { sel: cur.answer.slot, sel2: ch.slot, act: 'chSlot', disabled: cur.answer.slot }) +
            '<button class="btn ghost" data-act="cancelChallenge">Передумали</button></div>';
        } else {
          h += '<div class="box center"><h1>Вызов уже бросила «' + esc(teamOf(ch.teamId).name) + '»</h1></div>';
        }
        break;
      case 'REVEAL':
        h += '<div class="box center"><h1>Открываем год…</h1><div class="year">' + cur.card.year + '</div>' +
          (cur.card.type === 'song' ? '<div>' + esc(cur.card.artist) + ' — «' + esc(cur.card.title) + '»</div>' : '<div>' + esc(cur.card.text) + '</div>') +
          '<div class="muted small">Ведущий проверяет ответы</div></div>';
        break;
      case 'RESULT':
        var d = cur.result.applied[myId];
        h += '<div class="box center"><div class="muted">' + esc(cur.comment) + '</div><div class="year">' + cur.card.year + '</div>' +
          (d != null ? '<div class="delta ' + (d > 0 ? 'plus' : d < 0 ? 'minus' : '') + '">' + (d > 0 ? '+' : '') + d + '</div>' : '<div class="muted">Этот ход вас не касался</div>') + '</div>';
        break;
      case 'LAST_BET':
        var b = g.lastBet.bets[myId];
        if (b && b.slot != null && !draft.editBet) {
          h += '<div class="box center"><h1>Ставка принята: ' + b.bet + '</h1><div class="muted">Ждём остальных. Ответ можно поменять, пока ведущий не открыл год.</div>' +
            '<button class="btn ghost" data-act="editBet">Изменить</button></div>';
        } else {
          h += '<div class="box hl"><h1>Последняя ставка</h1><div class="muted">' + (g.lastBetCard.type === 'event' ? 'Событие: <b style="color:#fff">' + esc(g.lastBetCard.text) + '</b>' : '♪ Слушайте песню') + '</div>' +
            '<label>Ставка: от 0 до ' + me.score + '<input id="f-bet" type="number" inputmode="numeric" min="0" max="' + me.score + '" value="' + esc(draft.bet) + '" data-f="bet"></label>' +
            '<h2>Куда в вашу ленту?</h2>' + timeline(me, { sel: draft.betSlot, act: 'betSlot' }) +
            '<button class="btn pink" data-act="betSave"' + (draft.betSlot == null ? ' disabled' : '') + '>Поставить тайно</button></div>';
        }
        break;
      case 'LAST_BET_RESULT':
        var ok = g.lastBet.results[myId], dd = g.lastBet.applied[myId];
        h += '<div class="box center"><div class="year">' + g.lastBetCard.year + '</div><h1>' + (ok ? 'Верно!' : 'Мимо') + '</h1><div class="delta ' + (dd > 0 ? 'plus' : dd < 0 ? 'minus' : '') + '">' + (dd > 0 ? '+' : '') + dd + '</div></div>';
        break;
      case 'GAME_END':
        h += standingsBox(g);
        break;
    }
    return h;
  }
  function standingsBox(g) {
    var st = E.standings(g);
    return '<div class="box"><h1>Итоги</h1><div class="list">' + st.map(function (t, i) {
      return '<div class="li" style="border-left:6px solid ' + t.color + '"><span>' + (i + 1) + '. ' + esc(t.name) + '</span><span class="score">' + t.score + '</span></div>';
    }).join('') + '</div></div>';
  }
  function resetDraftIfNewTurn(g) {
    var key = g.turn + ':' + (g.current.card && g.current.card.id);
    if (draft.turnKey !== key) { draft.turnKey = key; draft.year = ''; draft.artist = ''; draft.title = ''; }
  }
  function renderJoin() {
    var g = view.game;
    var teams = g ? g.teams : view.lobby.teams;
    var h = top() + '<div class="box"><h1>' + (g ? 'Партия уже идёт. Кто вы?' : 'Выберите команду') + '</h1><div class="teams">' + teams.map(function (t) {
      return '<button class="tbtn" style="--c:' + t.color + '" data-act="join" data-arg="' + t.id + '"><span>' + esc(t.name) + '</span><small>' + (t.players != null ? (t.players ? 'игроков: ' + t.players : 'пока никого') : '') + '</small></button>';
    }).join('') + '</div></div>';
    if (!g && teams.length < 8) {
      h += '<div class="box"><h2>Или создайте свою</h2><input id="f-newTeam" type="text" maxlength="18" placeholder="Название команды" value="' + esc(draft.newTeam) + '" data-f="newTeam">' +
        '<button class="btn cyan" data-act="create">Создать команду</button></div>';
    }
    return h;
  }

  // ---------- ВЕДУЩИЙ ----------
  function seg(key, options, cur) {
    return '<div class="seg">' + options.map(function (o) {
      return '<button class="' + (o[0] === cur ? 'on' : '') + '" data-act="setting" data-arg="' + key + ':' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function renderHost() {
    var g = view.game, s = view.lobby.settings;
    var h = top('<div class="mod" style="background:var(--yellow);color:var(--bg);font-size:16px">ПУЛЬТ ВЕДУЩЕГО · комната ' + esc(view.room) + '</div>');
    if (!g || g.phase === 'GAME_END') {
      if (g) h += standingsBox(g);
      var n = view.lobby.teams.filter(function (t) { return t.players > 0; }).length;
      h += '<div class="box"><h2>Команды</h2><div class="list">' + view.lobby.teams.map(function (t) {
        return '<div class="li" style="border-left:6px solid ' + t.color + '"><span>' + esc(t.name) + ' <span class="muted small">' + (t.players ? '📱 ' + t.players : 'нет игроков') + '</span></span>' +
          (t.players ? '' : '<button class="btn ghost" style="width:auto;padding:6px 10px;font-size:14px" data-act="removeTeam" data-arg="' + t.id + '">убрать</button>') + '</div>';
      }).join('') + '</div><div class="muted small">Играют команды, где есть хотя бы один телефон.</div></div>' +
        '<div class="box"><h2>Партия</h2>' +
        seg('preset', [['less', 'Меньше музыки'], ['standard', 'Стандарт'], ['more', 'Больше музыки']], s.preset) +
        seg('length', [['short', 'Коротко'], ['normal', 'Норм'], ['long', 'Долго']], s.length) +
        '<div class="muted small">Модификаторы</div>' + seg('modFrequency', [['off', 'Выкл'], ['rare', 'Редко'], ['medium', 'Средне'], ['often', 'Часто']], s.modFrequency) +
        seg('lastBet', [['on', 'С последней ставкой'], ['off', 'Без неё']], s.lastBet ? 'on' : 'off') + '</div>' +
        '<button class="btn pink" data-act="start"' + (n ? '' : ' disabled') + '>' + (g ? 'Новая партия' : 'Начать игру') + '</button>' +
        (n ? '' : '<div class="muted small center">Ждём, пока команды подключатся по QR на телевизоре.</div>');
      return h;
    }
    var cur = g.current, team = cur ? teamOf(cur.teamId) : null;
    h += '<div class="muted small center">Карточка ' + (g.deckTotal - g.deckLeft) + ' из ' + g.deckTotal + (cur && cur.final ? ' · ФИНАЛ ×2' : '') + '</div>';
    if (team && g.phase.indexOf('LAST_BET') < 0) h += meBox(team);
    switch (g.phase) {
      case 'MODIFIER_REVEAL':
        h += '<div class="box center"><div class="mod" style="font-size:28px">' + MODIFIERS[cur.modifier].label + '</div><div>' + MODIFIERS[cur.modifier].text + '</div>' +
          '<button class="btn" data-act="hostAct" data-arg="MODIFIER_CONTINUE">' + (cur.modifier === 'skip' ? 'Ход дальше' : 'Тянуть карточку') + '</button></div>';
        break;
      case 'PLAY':
      case 'CHALLENGE':
        h += modBox(cur) + cardForHost(cur.card);
        if (g.phase === 'PLAY') {
          h += '<div class="box"><div class="muted">' + (cur.answer.slot == null ? 'Команда выбирает место на телефоне…' : 'Место выбрано, ждём «Ответ готов»') + '</div>' +
            '<details><summary class="muted small">Телефон команды не работает? Ответьте за неё</summary>' + timeline(team, { sel: cur.answer.slot, act: 'hostSlot' }) +
            '<button class="btn ghost" data-act="hostAct" data-arg="SUBMIT_ANSWER"' + (cur.answer.slot == null ? ' disabled' : '') + '>Ответ готов</button></details></div>';
        } else {
          var ch = cur.challenge;
          h += '<div class="box"><h2>Окно вызова</h2><div class="muted">' + (ch ? 'Вызов от «' + esc(teamOf(ch.teamId).name) + '»' + (ch.slot == null ? ', выбирают место…' : ', место выбрано') : 'Пока никто не оспорил') + '</div>' +
            '<button class="btn pink" data-act="hostAct" data-arg="CLOSE_CHALLENGE"' + (ch && ch.slot == null ? ' disabled' : '') + '>Открыть год</button></div>';
        }
        break;
      case 'REVEAL':
        var r = E.computeTurn(g), a = cur.answer;
        h += cardForHost(cur.card) + '<div class="box"><div>Год команды: <b>' + (a.year !== '' ? esc(a.year) + (r.yearOk ? ' ✅' : ' ❌') : '—') + '</b> · место ' + (r.placeOk ? '✅' : '❌') +
          (cur.challenge ? ' · вызов ' + (r.challengeOk ? '✅' : '❌') : '') + '</div>';
        if (cur.card.type === 'song') {
          ['artist', 'title'].forEach(function (f) {
            var val = a[f];
            h += '<div class="verdict"><div>' + (f === 'artist' ? 'Исполнитель' : 'Название') + ': <b>' + (val ? esc(val) : '—') + '</b>' +
              (val ? '<div class="muted small">' + (cur.suggest[f] ? 'похоже, верно' : 'не совпало') + '</div>' : '') + '</div>' +
              (val ? '<div class="row" style="flex:none"><button class="vb yes' + (cur.verdict[f] ? ' on' : '') + '" data-act="verdict" data-arg="' + f + ':1">✅</button><button class="vb no' + (!cur.verdict[f] ? ' on' : '') + '" data-act="verdict" data-arg="' + f + ':0">❌</button></div>' : '') + '</div>';
          });
        }
        h += '<div class="muted small">Сейчас: ' + Object.keys(r.deltas).map(function (id) { return esc(teamOf(id).name) + ' ' + (r.deltas[id] > 0 ? '+' : '') + r.deltas[id]; }).join(', ') + '</div>' +
          '<button class="btn" data-act="hostAct" data-arg="CONFIRM_REVEAL">Засчитать</button></div>';
        break;
      case 'RESULT':
        h += '<div class="box center"><div class="muted">' + esc(cur.comment) + '</div><div>' + Object.keys(cur.result.applied).map(function (id) {
          var d = cur.result.applied[id]; return esc(teamOf(id).name) + ': <b class="' + (d > 0 ? 'plus' : d < 0 ? 'minus' : '') + '">' + (d > 0 ? '+' : '') + d + '</b>';
        }).join(' · ') + '</div><button class="btn pink" data-act="hostAct" data-arg="NEXT_TURN">' + (g.deckLeft ? 'Следующий ход' : (g.settings.lastBet ? 'К последней ставке' : 'К итогам')) + '</button></div>';
        break;
      case 'LAST_BET':
        var all = g.teams.every(function (t) { var b = g.lastBet.bets[t.id]; return b && b.slot != null; });
        h += cardForHost(g.lastBetCard) + '<div class="box"><h2>Последняя ставка</h2><div class="list">' + g.teams.map(function (t) {
          var b = g.lastBet.bets[t.id]; return '<div class="li"><span>' + esc(t.name) + '</span><span>' + (b && b.slot != null ? '✅ ' + b.bet : '⏳') + '</span></div>';
        }).join('') + '</div><button class="btn pink" data-act="hostAct" data-arg="LAST_BET_REVEAL"' + (all ? '' : ' disabled') + '>Открыть год</button></div>';
        break;
      case 'LAST_BET_RESULT':
        h += '<div class="box center"><button class="btn pink" data-act="hostAct" data-arg="FINISH">К итогам</button></div>';
        break;
    }
    return h;
  }
  function cardForHost(card) {
    if (card.type === 'song') {
      return '<div class="box"><div class="muted small">♪ ПЕСНЯ · видно только ведущему</div><h1>' + esc(card.artist) + ' — «' + esc(card.title) + '»</h1><div class="year">' + card.year + '</div>' +
        '<a class="btn cyan" href="' + esc(card.spotifyUrl) + '" target="_blank" rel="noopener">▶ Открыть в Spotify</a></div>';
    }
    return '<div class="box"><div class="muted small">★ СОБЫТИЕ</div><h1>' + esc(card.text) + '</h1><div class="year">' + card.year + '</div></div>';
  }

  // ---------- рендер ----------
  function render() {
    var focus = document.activeElement && document.activeElement.id, sel = null;
    try { sel = focus ? document.activeElement.selectionStart : null; } catch (e) {}
    if (!room) { app.innerHTML = top() + '<div class="box"><h1>Нет кода комнаты</h1><div class="muted">Отсканируйте QR-код на телевизоре.</div></div>'; return; }
    if (!view) { app.innerHTML = top() + '<div class="box center"><h1>Комната ' + esc(room) + '</h1><div class="muted">Подключаемся к телевизору…</div></div>'; return; }
    app.innerHTML = view.role === 'host' ? renderHost() : renderTeam();
    if (focus) { var el = document.getElementById(focus); if (el) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch (e) {} } }
  }

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var a = el.getAttribute('data-act'), arg = el.getAttribute('data-arg');
    var g = view && view.game;
    switch (a) {
      case 'join': send({ t: 'joinTeam', teamId: arg }); break;
      case 'create': send({ t: 'createTeam', name: draft.newTeam }); draft.newTeam = ''; break;
      case 'leave': send({ t: 'leaveTeam' }); break;
      case 'slot': act({ type: 'SET_ANSWER', answer: { slot: Number(arg) } }); break;
      case 'submit':
        act({ type: 'SET_ANSWER', answer: { year: draft.year, artist: draft.artist, title: draft.title } });
        act({ type: 'SUBMIT_ANSWER' }); break;
      case 'challenge': act({ type: 'CHALLENGE', teamId: view.teamId }); if (navigator.vibrate) navigator.vibrate(80); break;
      case 'chSlot': act({ type: 'CHALLENGE_SLOT', slot: Number(arg) }); break;
      case 'cancelChallenge': act({ type: 'CANCEL_CHALLENGE' }); break;
      case 'betSlot': draft.betSlot = Number(arg); render(); break;
      case 'editBet': draft.editBet = true; render(); break;
      case 'betSave':
        act({ type: 'LAST_BET_SET', teamId: view.teamId, bet: Number(draft.bet) || 0, slot: draft.betSlot }); draft.editBet = false; break;
      // ведущий
      case 'setting': var kv = arg.split(':'); send({ t: 'setting', key: kv[0], value: kv[1] }); break;
      case 'removeTeam': send({ t: 'removeTeam', teamId: arg }); break;
      case 'start': send({ t: 'start', force: !!(g && g.phase === 'GAME_END') }); break;
      case 'hostAct': act({ type: arg }); break;
      case 'hostSlot': act({ type: 'SET_ANSWER', answer: { slot: Number(arg) } }); break;
      case 'verdict': var fv = arg.split(':'); act({ type: 'SET_VERDICT', field: fv[0], value: fv[1] === '1' }); break;
    }
  });
  app.addEventListener('input', function (e) {
    var f = e.target.getAttribute('data-f');
    if (!f) return;
    draft[f] = e.target.value;
    if (f === 'year' || f === 'artist' || f === 'title') {
      var o = {}; o[f] = e.target.value;
      act({ type: 'SET_ANSWER', answer: o });
    }
    if (f === 'bet') { var btn = app.querySelector('[data-act="betSave"]'); if (btn) btn.disabled = draft.betSlot == null; }
  });

  if (room) {
    net = Net.client(room, cid, {
      onStatus: function (st) {
        status = st;
        if (st === 'online') send({ t: 'hello', role: wantRole });
        render();
      },
      onMessage: function (m) { if (m && m.t === 'state') { view = m; render(); } }
    });
  }
  render();
  window.__phone = { get view() { return view; } };
})();
