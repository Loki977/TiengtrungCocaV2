/* Shared pinyin lookup for HSK 1-3 course lessons. */
(function () {
  'use strict';

  const MAX_LEVEL = 3;
  const dictionaries = new Map();
  const dictionaryPromises = new Map();
  const lessonIndexes = new WeakMap();
  const PINYIN_INITIALS = ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
  const PINYIN_FINALS = ['a', 'o', 'e', 'i', 'u', 'v', 'ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 've', 'er', 'an', 'en', 'in', 'un', 'vn', 'ang', 'eng', 'ing', 'ong', 'ia', 'iao', 'ian', 'iang', 'iong', 'ua', 'uo', 'uai', 'uan', 'uang', 'ueng'];
  const PINYIN_SYLLABLES = new Set(PINYIN_INITIALS.flatMap(initial => PINYIN_FINALS.map(final => initial + final)).concat(['m', 'n', 'ng']));
  const TONE_BASES = { ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e', ī: 'i', í: 'i', ǐ: 'i', ì: 'i', ō: 'o', ó: 'o', ǒ: 'o', ò: 'o', ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v', ü: 'v' };

  function chineseOnly(value = '') {
    return (String(value).replace(/<[^>]*>/g, '').match(/[\u3400-\u9fff]+/g) || []).join('');
  }

  function cleanPinyin(value = '') {
    return String(value)
      .replace(/[，。！？、；：,“”‘’]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitReadingForCharacters(reading, expectedCount) {
    if (!expectedCount || expectedCount > 8) return [];
    const spaced = reading.split(/\s+/).filter(Boolean);
    if (spaced.length === expectedCount) return spaced;
    const original = reading.replace(/[\s'’-]/g, '');
    const normalized = [...original].map(character => TONE_BASES[character.toLowerCase()] || character.toLowerCase()).join('');
    const search = (cursor, remaining) => {
      if (!remaining) return cursor === normalized.length ? [] : null;
      const maxEnd = Math.min(normalized.length, cursor + 6);
      for (let end = maxEnd; end > cursor; end -= 1) {
        if (normalized.length - end < remaining - 1) continue;
        if (!PINYIN_SYLLABLES.has(normalized.slice(cursor, end))) continue;
        const rest = search(end, remaining - 1);
        if (rest) return [original.slice(cursor, end), ...rest];
      }
      return null;
    };
    return search(0, expectedCount) || [];
  }

  function addEntry(index, hanzi, pinyin, overwrite = false, deriveCharacters = true) {
    const word = chineseOnly(hanzi);
    const reading = cleanPinyin(pinyin);
    if (!word || !reading || (!overwrite && index.words.has(word))) return;
    index.words.set(word, reading);
    const first = word[0];
    const entries = index.byFirst.get(first) || [];
    const existing = entries.findIndex(item => item.word === word);
    if (existing >= 0) entries.splice(existing, 1);
    entries.push({ word, pinyin: reading });
    entries.sort((a, b) => b.word.length - a.word.length);
    index.byFirst.set(first, entries);

    const characters = [...word];
    const syllables = splitReadingForCharacters(reading, characters.length);
    if (deriveCharacters && characters.length > 1 && characters.length === syllables.length) {
      characters.forEach((character, position) => {
        if (!index.words.has(character)) {
          index.words.set(character, syllables[position]);
          const characterEntries = index.byFirst.get(character) || [];
          characterEntries.push({ word: character, pinyin: syllables[position] });
          index.byFirst.set(character, characterEntries);
        }
      });
    }
  }

  function makeIndex() {
    return { words: new Map(), byFirst: new Map() };
  }

  const COMMON_COURSE_READINGS = {
    '旁白': 'páng bái',
    '苏明': 'Sū Míng',
    '明月': 'Míng Yuè',
    '安娜': 'Ān Nà',
    '玛丽': 'Mǎ Lì',
    '老师': 'lǎo shī',
    '广播': 'guǎng bō',
    '管理员': 'guǎn lǐ yuán',
    '服务员': 'fú wù yuán',
    '售货员': 'shòu huò yuán',
    '护士': 'hù shi',
    '打算': 'dǎ suàn',
    '存现句': 'cún xiàn jù',
    '发': 'fā'
  };

  async function loadDictionary(level) {
    const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
    if (dictionaries.has(safeLevel)) return dictionaries.get(safeLevel);
    if (dictionaryPromises.has(safeLevel)) return dictionaryPromises.get(safeLevel);

    const promise = (async () => {
      const index = makeIndex();
      for (let current = 1; current <= safeLevel; current += 1) {
        const response = await fetch(`assets/data/hsk${current}.json`);
        if (!response.ok) throw new Error(`Không tải được từ điển pinyin HSK${current}`);
        const items = await response.json();
        items.forEach(item => {
          addEntry(index, item.hanzi, item.pinyin);
          (item.examples || []).forEach(example => addEntry(index, example.hanzi, example.pinyin, false, false));
        });
      }
      dictionaries.set(safeLevel, index);
      return index;
    })().catch(error => {
      console.warn('[course-pinyin]', error);
      const empty = makeIndex();
      dictionaries.set(safeLevel, empty);
      return empty;
    });

    dictionaryPromises.set(safeLevel, promise);
    return promise;
  }

  function collectLessonEntries(lesson, index) {
    const seen = new WeakSet();
    const visit = value => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      const hanzi = value.hanzi || value.chinese || value.zh || '';
      if (hanzi && value.pinyin) addEntry(index, hanzi, value.pinyin, true);
      if (value.example && value.examplePinyin) addEntry(index, value.example, value.examplePinyin, true);
      if (Array.isArray(value.segments)) {
        value.segments.forEach(segment => addEntry(index, segment.text, segment.pinyin, true));
      }
      Object.values(value).forEach(visit);
    };
    visit(lesson);
  }

  async function prepare(lesson, level) {
    const safeLevel = Number(level || lesson?.level) || 1;
    if (safeLevel < 1 || safeLevel > MAX_LEVEL || !lesson) return;
    const base = await loadDictionary(safeLevel);
    const local = makeIndex();
    Object.entries(COMMON_COURSE_READINGS).forEach(([hanzi, pinyin]) => addEntry(local, hanzi, pinyin));
    collectLessonEntries(lesson, local);
    lessonIndexes.set(lesson, { base, local, level: safeLevel });
  }

  function findEntry(run, cursor, indexes) {
    for (const index of indexes) {
      const match = (index?.byFirst.get(run[cursor]) || [])
        .find(item => run.startsWith(item.word, cursor));
      if (match) return match;
    }
    return null;
  }

  function get(text, lesson) {
    const prepared = lessonIndexes.get(lesson);
    if (!prepared || prepared.level > MAX_LEVEL) return '';
    const plainText = String(text || '').replace(/<[^>]*>/g, '');
    const runs = plainText.match(/[\u3400-\u9fff]+/g) || [];
    const indexes = [prepared.local, prepared.base];
    const completeText = chineseOnly(plainText);
    for (const index of indexes) {
      const exact = index.words.get(completeText);
      if (exact) return exact;
    }

    return runs.map(run => {
      for (const index of indexes) {
        const exact = index.words.get(run);
        if (exact) return exact;
      }
      const readings = [];
      let cursor = 0;
      while (cursor < run.length) {
        const match = findEntry(run, cursor, indexes);
        if (match) {
          readings.push(match.pinyin);
          cursor += match.word.length;
        } else {
          cursor += 1;
        }
      }
      return readings.join(' ');
    }).filter(Boolean).join(' · ');
  }

  window.CoursePinyin = { prepare, get };
})();
