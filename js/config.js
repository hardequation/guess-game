// Все числа правил живут здесь (раздел 11 спецификации).
// Меняем правила — меняем этот файл, код игры не трогаем.
(function (root) {
  var CONFIG = {
    score: { placement: 10, exactYear: 10, artist: 5, title: 5, floor: 0 },
    challenge: { maxPerTurn: 1, maxPerGame: Infinity },
    modifier: {
      // вероятность модификатора перед ходом: редко / средне / часто
      frequency: { rare: 1 / 6.5, medium: 1 / 4.5, often: 1 / 2.5 },
      // множитель очков при верном месте
      multiplier: { x2: 2, x3: 3, minus: 1, minus2: 1, risk: 2 },
      // штраф за ошибку места, в долях очков за место
      penalty: { x2: 0, x3: 0, minus: 1, minus2: 2, risk: 2 },
      weights: { x2: 3, x3: 1, minus: 3, minus2: 2, risk: 2, skip: 2 }
    },
    final: { roundMultiplier: 2, lastBet: true },
    deck: {
      turnsPerTeam: { short: 8, normal: 9, long: 12 },
      minutesPerTurn: 2
    }
  };

  var MODIFIERS = {
    x2: { label: '×2', text: 'Все очки хода удваиваются' },
    x3: { label: '×3', text: 'Все очки хода утраиваются' },
    minus: { label: 'МИНУС', text: 'Ошибка места стоит −10' },
    minus2: { label: 'МИНУС ×2', text: 'Ошибка места стоит −20' },
    risk: { label: 'РИСК ×2', text: 'Верно — всё ×2, ошибка места — −20' },
    skip: { label: 'ПРОПУСК ХОДА', text: 'Команда пропускает этот ход' }
  };

  var PRESETS = {
    less: { name: 'Менее музыкальная', songShare: 50 },
    standard: { name: 'Стандартная', songShare: 60 },
    more: { name: 'Более музыкальная', songShare: 75 }
  };

  function defaultSettings() {
    return {
      preset: 'standard',
      length: 'normal',          // short / normal / long
      songShare: 60,             // % песен от песен + событий
      songLang: 'all',           // all / ru / foreign
      modFrequency: 'medium',    // off / rare / medium / often
      mods: { x2: true, x3: true, minus: true, minus2: true, risk: true, skip: true },
      lastBet: true,
      mode: 'multi'              // multi — телефоны ведущего и команд; single — одно устройство
    };
  }

  var TEAM_COLORS = ['#FF3EA5', '#23E5DB', '#FFD23F', '#9B5CFF', '#FF8A3D', '#4BE36B', '#5AA9FF', '#FF5A5A'];

  root.CONFIG = CONFIG;
  root.MODIFIERS = MODIFIERS;
  root.PRESETS = PRESETS;
  root.defaultSettings = defaultSettings;
  root.TEAM_COLORS = TEAM_COLORS;
})(typeof window !== 'undefined' ? window : globalThis);
