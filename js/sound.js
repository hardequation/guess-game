// 8-битные звуки, синтез в браузере (Web Audio). Чужих мелодий нет.
(function (root) {
  var ctx = null, master = null, musicGain = null, sfxGain = null, musicTimer = null;
  var state = { muted: false, music: 0.35, sfx: 0.6 };
  try { var saved = JSON.parse(localStorage.getItem('disco.sound') || 'null'); if (saved) state = Object.assign(state, saved); } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    apply();
    return ctx;
  }
  function apply() {
    if (!ctx) return;
    master.gain.value = state.muted ? 0 : 1;
    musicGain.gain.value = state.music * 0.25;
    sfxGain.gain.value = state.sfx * 0.4;
    try { localStorage.setItem('disco.sound', JSON.stringify(state)); } catch (e) {}
  }
  function tone(freq, start, dur, type, dest, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 1, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(start); o.stop(start + dur + 0.02);
  }
  function seq(notes, step, type) {
    if (!ensure()) return;
    var t = ctx.currentTime + 0.01;
    notes.forEach(function (n, i) { if (n) tone(n, t + i * step, step * 0.95, type); });
  }

  var SFX = {
    card: function () { seq([523, 784], 0.07); },
    modifier: function () { seq([392, 523, 659, 784, 1047], 0.06, 'sawtooth'); },
    right: function () { seq([523, 659, 784, 1047], 0.08); },
    exact: function () { seq([784, 988, 1175, 1568, 1175, 1568], 0.07); },
    wrong: function () { seq([311, 233], 0.18, 'sawtooth'); },
    challenge: function () { seq([880, 0, 880, 0, 1175], 0.06); },
    click: function () { seq([660], 0.03); },
    join: function () { seq([440, 660], 0.06, 'triangle'); },
    drum: function () {
      if (!ensure()) return;
      var t = ctx.currentTime;
      for (var i = 0; i < 16; i++) tone(90 + (i % 2) * 20, t + i * 0.06, 0.05, 'triangle', sfxGain, 0.8);
    },
    fanfare: function () { seq([523, 523, 523, 698, 0, 659, 698, 0, 1047], 0.11); }
  };

  // Фоновая 8-битная петля для меню и финала
  var LOOP = [262, 330, 392, 523, 392, 330, 294, 349, 440, 587, 440, 349, 247, 294, 392, 494, 392, 294, 262, 330, 392, 523, 659, 523];
  var BASS = [131, 131, 147, 147, 123, 123, 131, 131];
  function startMusic() {
    if (musicTimer || !ensure()) return;
    var step = 0, dur = 0.16;
    musicTimer = setInterval(function () {
      if (ctx.state === 'suspended') return;
      var t = ctx.currentTime + 0.02;
      tone(LOOP[step % LOOP.length], t, dur * 0.8, 'square', musicGain, 0.5);
      if (step % 3 === 0) tone(BASS[Math.floor(step / 3) % BASS.length], t, dur * 2.5, 'triangle', musicGain, 0.9);
      step++;
    }, dur * 1000);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  root.Sound = {
    play: function (name) { try { if (SFX[name]) SFX[name](); } catch (e) {} },
    music: function (on) { if (on) startMusic(); else stopMusic(); },
    unlock: function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    toggleMute: function () { state.muted = !state.muted; ensure(); apply(); return state.muted; },
    isMuted: function () { return state.muted; },
    set: function (k, v) { state[k] = v; ensure(); apply(); },
    get: function (k) { return state[k]; }
  };
})(window);
