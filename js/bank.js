// Демо-банк карточек. Позже заменяется настоящим банком (341 песня и события).
// Год песни = год первого выхода (сингл, альбом или фильм).
(function (root) {
  function sp(q) { return 'https://open.spotify.com/search/' + encodeURIComponent(q); }
  var songs = [
    ['Кино', 'Группа крови', 1988, 'ru'],
    ['Кино', 'Звезда по имени Солнце', 1989, 'ru'],
    ['Алла Пугачёва', 'Миллион алых роз', 1982, 'ru'],
    ['Наутилус Помпилиус', 'Скованные одной цепью', 1986, 'ru'],
    ['Сплин', 'Выхода нет', 1998, 'ru'],
    ['Мумий Тролль', 'Утекай', 1997, 'ru'],
    ['Земфира', 'Ариведерчи', 1999, 'ru'],
    ['t.A.T.u.', 'Я сошла с ума', 2000, 'ru'],
    ['Валерий Меладзе', 'Самба белого мотылька', 1995, 'ru'],
    ['ДДТ', 'Что такое осень', 1991, 'ru'],
    ['Би-2', 'Полковнику никто не пишет', 2000, 'ru'],
    ['Queen', 'Bohemian Rhapsody', 1975, 'foreign'],
    ['ABBA', 'Dancing Queen', 1976, 'foreign'],
    ['Michael Jackson', 'Smooth Criminal', 1987, 'foreign'],
    ['Modern Talking', "You're My Heart, You're My Soul", 1984, 'foreign'],
    ['a-ha', 'Take On Me', 1984, 'foreign'],
    ['Nirvana', 'Smells Like Teen Spirit', 1991, 'foreign'],
    ['Madonna', 'Like a Virgin', 1984, 'foreign'],
    ['Boney M.', 'Rasputin', 1978, 'foreign'],
    ['Eurythmics', 'Sweet Dreams (Are Made of This)', 1983, 'foreign'],
    ['Whitney Houston', 'I Will Always Love You', 1992, 'foreign'],
    ['Spice Girls', 'Wannabe', 1996, 'foreign'],
    ['Britney Spears', '...Baby One More Time', 1998, 'foreign'],
    ['Eminem', 'Lose Yourself', 2002, 'foreign'],
    ['The Beatles', 'Yesterday', 1965, 'foreign'],
    ['Gloria Gaynor', 'I Will Survive', 1978, 'foreign'],
    ['Europe', 'The Final Countdown', 1986, 'foreign'],
    ['Haddaway', 'What Is Love', 1993, 'foreign'],
    ['PSY', 'Gangnam Style', 2012, 'foreign']
  ].map(function (s, i) {
    return {
      id: 's' + (i + 1), type: 'song', artist: s[0], title: s[1], year: s[2], lang: s[3],
      tier: 1, yearVerified: true, spotifyUrl: sp(s[0] + ' ' + s[1]), synonyms: { artist: [], title: [] }
    };
  });
  songs[7].synonyms.artist = ['Тату', 'tatu'];

  var events = [
    ['Юрий Гагарин полетел в космос', 1961, 'история'],
    ['Люди впервые высадились на Луну', 1969, 'история'],
    ['Пала Берлинская стена', 1989, 'история'],
    ['Летняя Олимпиада в Москве', 1980, 'спорт'],
    ['Вышел первый iPhone', 2007, 'поп-культура'],
    ['Основана компания Google', 1998, 'поп-культура'],
    ['Запустилась соцсеть Facebook', 2004, 'поп-культура'],
    ['Вышел фильм «Титаник» Джеймса Кэмерона', 1997, 'поп-культура'],
    ['Вышел первый фильм о Гарри Поттере', 2001, 'поп-культура'],
    ['Вышла Windows 95', 1995, 'поп-культура'],
    ['Алексей Пажитнов создал «Тетрис»', 1984, 'поп-культура'],
    ['Чемпионат мира по футболу прошёл в России', 2018, 'спорт'],
    ['Зимняя Олимпиада в Сочи', 2014, 'спорт'],
    ['Вышли первые «Звёздные войны»', 1977, 'поп-культура'],
    ['Вышла игра Super Mario Bros.', 1985, 'поп-культура'],
    ['Запустился YouTube', 2005, 'поп-культура'],
    ['Сборная России вышла в полуфинал Евро', 2008, 'спорт'],
    ['Запустилась Википедия', 2001, 'поп-культура'],
    ['Вышел фильм «Брат» Алексея Балабанова', 1997, 'поп-культура'],
    ['Дима Билан победил на Евровидении', 2008, 'поп-культура'],
    ['Отправлена первая в мире SMS', 1992, 'история'],
    ['Вышел мультфильм «Шрек»', 2001, 'поп-культура']
  ].map(function (e, i) {
    return { id: 'e' + (i + 1), type: 'event', text: e[0], year: e[1], theme: e[2], yearVerified: true };
  });

  root.BANK = songs.concat(events);
})(typeof window !== 'undefined' ? window : globalThis);
