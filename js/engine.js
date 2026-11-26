// Игровая логика. Не знает ни про экран, ни про транспорт:
// состояние меняется только через reduce(state, action).
(function (root) {
  var C = root.CONFIG;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- Лента и слоты ----------
  function sortTimeline(tl) { return tl.slice().sort(function (a, b) { return a.year - b.year; }); }

  // Слот i: между карточкой i-1 и i. Слотов N+1.
  function slotBounds(tl, slot) {
    var L = slot === 0 ? -Infinity : tl[slot - 1].year;
    var R = slot === tl.length ? Infinity : tl[slot].year;
    return [L, R];
  }
  function slotOk(tl, slot, year) {
    if (slot == null || slot < 0 || slot > tl.length) return false;
    var b = slotBounds(tl, slot);
    return b[0] <= year && year <= b[1];
  }
  function insertCard(team, card) { team.timeline = sortTimeline(team.timeline.concat([card])); }

  // ---------- Сравнение текстов ----------
  var TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  function norm(s) {
    s = String(s || '').toLowerCase().replace(/ё/g, 'е');
    var out = '';
    for (var i = 0; i < s.length; i++) { var ch = s[i]; out += TR[ch] != null ? TR[ch] : ch; }
    return out.replace(/[^a-z0-9]/g, '');
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [];
    for (var i = 0; i <= m; i++) { d[i] = [i]; }
    for (var j = 0; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[m][n];
  }
  function textMatch(input, target, synonyms) {
    var a = norm(input);
    if (!a) return false;
    var all = [target].concat(synonyms || []);
    for (var i = 0; i < all.length; i++) {
      var b = norm(all[i]);
      if (!b) continue;
      if (a === b) return true;
      if (lev(a, b) <= Math.max(1, Math.floor(b.length / 5))) return true;
    }
    return false;
  }

  // ---------- Колода ----------
  function buildDeck(settings, nTeams, bank, played, rnd) {
    var total = nTeams * C.deck.turnsPerTeam[settings.length];
    var usable = bank.filter(function (c) { return c.yearVerified; });
    var fresh = usable.filter(function (c) { return played.indexOf(c.id) < 0; });
    var resetPlayed = false;
    // нужно total + стартовые (nTeams) + последняя ставка (1)
    if (fresh.length < total + nTeams + 1) { fresh = usable; resetPlayed = true; }

    var songs = shuffle(fresh.filter(function (c) {
      return c.type === 'song' && (settings.songLang === 'all' || c.lang === settings.songLang);
    }), rnd);
    var events = shuffle(fresh.filter(function (c) { return c.type !== 'song'; }), rnd);

    var warnings = [];
    var needSongs = Math.round(total * settings.songShare / 100);
    var needEvents = total - needSongs;
    if (songs.length < needSongs + 1) warnings.push('Песен в банке мало для этой доли — добавила событий.');
    if (events.length < needEvents + 1) warnings.push('Событий в банке мало — добавила песен.');

    // стартовые карточки и последняя ставка — сверх колоды, лучше из событий
    var extra = [];
    function take(fromA, fromB) { return fromA.length ? fromA.pop() : fromB.pop(); }
    for (var i = 0; i < nTeams + 1; i++) {
      var c = (events.length > needEvents) ? events.pop() : (songs.length > needSongs ? songs.pop() : take(events, songs));
      if (c) extra.push(c);
    }
    var deck = [];
    for (i = 0; i < needSongs && songs.length; i++) deck.push(songs.pop());
    for (i = 0; i < needEvents && events.length; i++) deck.push(events.pop());
    var rest = songs.concat(events);
    while (deck.length < total && rest.length) deck.push(rest.pop());
    if (deck.length < total) warnings.push('В банке хватило только на ' + deck.length + ' карточек вместо ' + total + '.');
    shuffle(deck, rnd);
    return { deck: deck, starters: extra.slice(0, nTeams), lastBetCard: extra[nTeams] || null, warnings: warnings, resetPlayed: resetPlayed };
  }

  // ---------- Модификаторы ----------
  function rollModifier(settings, rnd) {
    if (settings.modFrequency === 'off') return null;
    var p = C.modifier.frequency[settings.modFrequency];
    if (rnd() >= p) return null;
    var keys = Object.keys(C.modifier.weights).filter(function (k) { return settings.mods[k]; });
    var sum = keys.reduce(function (s, k) { return s + C.modifier.weights[k]; }, 0);
    if (!sum) return null;
    var r = rnd() * sum;
    for (var i = 0; i < keys.length; i++) { r -= C.modifier.weights[keys[i]]; if (r < 0) return keys[i]; }
    return keys[keys.length - 1];
  }

  // ---------- Очки ----------
  function isFinal(state) { return state.deck.length <= state.teams.length && state.deckTotal > state.teams.length; }

  function findTeam(state, id) { for (var i = 0; i < state.teams.length; i++) if (state.teams[i].id === id) return state.teams[i]; return null; }

  // Возвращает расчёт хода, ничего не меняя.
  function computeTurn(state) {
    var cur = state.current, sc = C.score, card = cur.card, team = findTeam(state, cur.teamId);
    var ans = cur.answer, isSong = card.type === 'song';
    var placeOk = slotOk(team.timeline, ans.slot, card.year);
    var yearOk = ans.year !== '' && ans.year != null && Number(ans.year) === card.year;
    var artistOk = isSong && !!cur.verdict.artist;
    var titleOk = isSong && !!cur.verdict.title;
    var bonus = (yearOk ? sc.exactYear : 0) + (artistOk ? sc.artist : 0) + (titleOk ? sc.title : 0);
    var mod = cur.modifier;
    var mult = mod ? C.modifier.multiplier[mod] : 1;
    var penalty = mod ? C.modifier.penalty[mod] * sc.placement : 0;
    var fm = cur.final ? C.final.roundMultiplier : 1;
    var stake = sc.placement * mult * fm;
    var lines = [];

    var answerPts;
    if (placeOk) answerPts = (sc.placement + bonus) * mult;
    else answerPts = bonus * mult - penalty;
    answerPts *= fm;

    var res = { placeOk: placeOk, yearOk: yearOk, artistOk: artistOk, titleOk: titleOk, stake: stake, deltas: {}, placedTo: null, challengeOk: null };
    res.deltas[team.id] = 0;

    var ch = cur.challenge;
    if (ch && ch.slot != null) {
      var chOk = slotOk(team.timeline, ch.slot, card.year);
      res.challengeOk = chOk;
      res.deltas[ch.teamId] = 0;
      if (placeOk && !chOk) { res.placedTo = team.id; res.deltas[ch.teamId] = -stake; }
      else if (!placeOk && chOk) { res.placedTo = ch.teamId; answerPts = bonus * mult * fm; res.deltas[ch.teamId] = stake; }
      else if (placeOk && chOk) { res.placedTo = team.id; }
      else { res.placedTo = null; res.deltas[ch.teamId] = -stake; }
    } else if (placeOk) res.placedTo = team.id;
    res.deltas[team.id] = answerPts;

    if (placeOk) lines.push('Место в ленте +' + sc.placement);
    else lines.push('Место неверное');
    if (yearOk) lines.push('Точный год +' + sc.exactYear);
    if (artistOk) lines.push('Исполнитель +' + sc.artist);
    if (titleOk) lines.push('Название +' + sc.title);
    if (mod && mod !== 'skip') lines.push('Модификатор ' + root.MODIFIERS[mod].label);
    if (fm > 1) lines.push('Финальный круг ×' + fm);
    res.lines = lines;
    return res;
  }

  function applyDeltas(state, deltas) {
    var real = {};
    Object.keys(deltas).forEach(function (id) {
      var t = findTeam(state, id);
      var before = t.score;
      t.score = Math.max(C.score.floor, t.score + deltas[id]);
      real[id] = t.score - before;
    });
    return real;
  }

  // ---------- Комментатор ----------
  var LINES = {
    exact: ['В яблочко! Год в год!', 'Машина времени у вас в кармане?', 'Это не угадывание, это знание!'],
    right: ['Верно! Лента растёт.', 'Чётко по месту!', 'Есть контакт!'],
    wrong: ['Мимо! Карточка сгорает.', 'Эх, время вас обмануло.', 'Не тот год, не та эпоха.'],
    challengeLost: ['Вызов не удался — дорогое удовольствие!', 'Смело, но мимо!'],
    challengeWon: ['Перехват! Вот это реакция!', 'Карточка уходит соперникам!'],
    lead: ['У нас новый лидер!', 'Смена власти на табло!']
  };
  function pickLine(state, kind, rnd) {
    var used = state.usedLines[kind] || [];
    var pool = LINES[kind].map(function (_, i) { return i; }).filter(function (i) { return used.indexOf(i) < 0; });
    if (!pool.length) { used = []; pool = LINES[kind].map(function (_, i) { return i; }); }
    var idx = pool[Math.floor(rnd() * pool.length)];
    state.usedLines[kind] = used.concat([idx]);
    return LINES[kind][idx];
  }
  function leader(state) {
    var best = null;
    state.teams.forEach(function (t) { if (!best || t.score > best.score) best = t; });
    var tied = state.teams.filter(function (t) { return t.score === best.score; }).length > 1;
    return tied ? null : best.id;
  }

  // ---------- Ход ----------
  function currentTeamId(state) { return state.order[state.turn % state.order.length]; }

  function startTurn(state, rnd) {
    if (!state.deck.length) {
      if (state.settings.lastBet && state.lastBetCard) { state.phase = 'LAST_BET'; state.lastBet = { bets: {} }; }
      else state.phase = 'GAME_END';
      return;
    }
    var fin = isFinal(state);
    var mod = fin ? null : rollModifier(state.settings, rnd);
    state.current = {
      teamId: currentTeamId(state), card: null, modifier: mod, final: fin,
      answer: { slot: null, year: '', artist: '', title: '' }, challenge: null,
      verdict: { artist: false, title: false }, result: null, comment: ''
    };
    if (mod) { state.phase = 'MODIFIER_REVEAL'; return; }
    drawCard(state);
  }

  function drawCard(state) {
    state.current.card = state.deck.shift();
    state.phase = 'PLAY';
  }

  function nextTurn(state, rnd) {
    state.turn += 1;
    startTurn(state, rnd);
  }

  // ---------- reduce ----------
  function reduce(state, action, rnd) {
    rnd = rnd || Math.random;
    var s = clone(state);
    var cur = s && s.current;
    switch (action.type) {
      case 'START_GAME': {
        var teams = action.teams;
        var built = buildDeck(action.settings, teams.length, action.bank, action.played || [], rnd);
        var ns = {
          v: 1, phase: 'TURN', settings: action.settings, turn: 0, current: null,
          teams: teams.map(function (t, i) {
            return { id: t.id, name: t.name, color: t.color, score: 0, timeline: built.starters[i] ? [built.starters[i]] : [] };
          }),
          order: shuffle(teams.map(function (t) { return t.id; }), rnd),
          deck: built.deck, deckTotal: built.deck.length, lastBetCard: built.lastBetCard,
          warnings: built.warnings, log: [], usedLines: {}, lastBet: null,
          played: (built.resetPlayed ? [] : (action.played || [])).concat(
            built.deck.concat(built.starters, built.lastBetCard ? [built.lastBetCard] : []).map(function (c) { return c.id; }))
        };
        startTurn(ns, rnd);
        return ns;
      }
      case 'MODIFIER_CONTINUE': {
        if (s.phase !== 'MODIFIER_REVEAL') return state;
        if (cur.modifier === 'skip') {
          s.log.push({ turn: s.turn, teamId: cur.teamId, skipped: true, deltas: {} });
          nextTurn(s, rnd);
          return s;
        }
        drawCard(s);
        return s;
      }
      case 'SET_ANSWER': {
        if (s.phase !== 'PLAY') return state;
        Object.keys(action.answer).forEach(function (k) { cur.answer[k] = action.answer[k]; });
        return s;
      }
      case 'SUBMIT_ANSWER': {
        if (s.phase !== 'PLAY' || cur.answer.slot == null) return state;
        s.phase = 'CHALLENGE';
        return s;
      }
      case 'CHALLENGE': {
        // первый вызов выигрывает, остальные игнорируются
        if (s.phase !== 'CHALLENGE' || cur.challenge) return state;
        if (action.teamId === cur.teamId) return state;
        cur.challenge = { teamId: action.teamId, slot: null };
        return s;
      }
      case 'CHALLENGE_SLOT': {
        if (s.phase !== 'CHALLENGE' || !cur.challenge) return state;
        if (action.slot === cur.answer.slot) return state;
        cur.challenge.slot = action.slot;
        return s;
      }
      case 'CANCEL_CHALLENGE': {
        if (s.phase !== 'CHALLENGE') return state;
        cur.challenge = null;
        return s;
      }
      case 'CLOSE_CHALLENGE': {
        if (s.phase !== 'CHALLENGE') return state;
        if (cur.challenge && cur.challenge.slot == null) cur.challenge = null;
        s.phase = 'REVEAL';
        var card = cur.card;
        if (card.type === 'song') {
          cur.verdict.artist = textMatch(cur.answer.artist, card.artist, card.synonyms && card.synonyms.artist);
          cur.verdict.title = textMatch(cur.answer.title, card.title, card.synonyms && card.synonyms.title);
          cur.suggest = { artist: cur.verdict.artist, title: cur.verdict.title };
        }
        return s;
      }
      case 'SET_VERDICT': {
        if (s.phase !== 'REVEAL') return state;
        cur.verdict[action.field] = !!action.value;
        return s;
      }
      case 'CONFIRM_REVEAL': {
        if (s.phase !== 'REVEAL') return state;
        var prevLeader = leader(s);
        var r = computeTurn(s);
        r.applied = applyDeltas(s, r.deltas);
        if (r.placedTo) insertCard(findTeam(s, r.placedTo), cur.card);
        cur.result = r;
        var kind;
        if (cur.challenge && r.challengeOk && !r.placeOk) kind = 'challengeWon';
        else if (cur.challenge && !r.challengeOk) kind = 'challengeLost';
        else if (r.placeOk && r.yearOk) kind = 'exact';
        else if (r.placeOk) kind = 'right';
        else kind = 'wrong';
        var nl = leader(s);
        if (nl && nl !== prevLeader && prevLeader !== null && kind !== 'wrong') kind = 'lead';
        cur.comment = pickLine(s, kind, rnd);
        cur.commentKind = kind;
        s.log.push({ turn: s.turn, teamId: cur.teamId, cardId: cur.card.id, placedTo: r.placedTo, deltas: r.applied });
        s.phase = 'RESULT';
        return s;
      }
      case 'NEXT_TURN': {
        if (s.phase !== 'RESULT') return state;
        nextTurn(s, rnd);
        return s;
      }
      case 'LAST_BET_SET': {
        if (s.phase !== 'LAST_BET') return state;
        var t = findTeam(s, action.teamId);
        var bet = Math.max(0, Math.min(t.score, Math.floor(Number(action.bet) || 0)));
        s.lastBet.bets[action.teamId] = { bet: bet, slot: action.slot };
        return s;
      }
      case 'LAST_BET_REVEAL': {
        if (s.phase !== 'LAST_BET') return state;
        var allIn = s.teams.every(function (t) { var b = s.lastBet.bets[t.id]; return b && b.slot != null; });
        if (!allIn) return state;
        var results = {};
        var deltas = {};
        s.teams.forEach(function (t) {
          var b = s.lastBet.bets[t.id];
          var ok = slotOk(t.timeline, b.slot, s.lastBetCard.year);
          results[t.id] = ok;
          deltas[t.id] = ok ? b.bet : -b.bet;
        });
        var applied = applyDeltas(s, deltas);
        s.teams.forEach(function (t) { if (results[t.id]) insertCard(t, clone(s.lastBetCard)); });
        s.lastBet.results = results;
        s.lastBet.applied = applied;
        s.phase = 'LAST_BET_RESULT';
        return s;
      }
      case 'FINISH': {
        if (s.phase !== 'LAST_BET_RESULT') return state;
        s.phase = 'GAME_END';
        return s;
      }
      default:
        return state;
    }
  }

  function standings(state) {
    return state.teams.slice().sort(function (a, b) {
      return b.score - a.score || b.timeline.length - a.timeline.length;
    });
  }

  root.Engine = {
    reduce: reduce, computeTurn: computeTurn, slotOk: slotOk, slotBounds: slotBounds, textMatch: textMatch,
    buildDeck: buildDeck, standings: standings, findTeam: findTeam, isFinal: isFinal, norm: norm
  };
})(typeof window !== 'undefined' ? window : globalThis);
