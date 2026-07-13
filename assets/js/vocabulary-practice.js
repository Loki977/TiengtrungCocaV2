/* Vocabulary practice: sentence creation + microphone pronunciation.
   Isolated from authentication and lesson flow to avoid regressions. */
(function () {
  'use strict';

  const STORAGE_KEY = 'cc_vocabulary_practice_v1';

  function normalize(text = '') {
    return String(text).trim().replace(/[\s。！？?!，,.、；;：:“”"'（）()]/g, '').toLowerCase();
  }

  function hasChinese(text = '') {
    return /[\u3400-\u9fff]/.test(String(text));
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeCache(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (error) { console.warn('[vocabulary-practice] Không lưu được cache.', error); }
  }

  function getRecordKey(card) {
    const level = card.dataset.level || 'hsk';
    const lessonId = card.dataset.lessonId || '0';
    const wordKey = card.dataset.wordKey || card.dataset.word || 'word';
    return `${level}:${lessonId}:${wordKey}`;
  }

  async function persistRecord(card, patch) {
    const key = getRecordKey(card);
    const cache = readCache();
    const previous = cache[key] || {};
    cache[key] = { ...previous, ...patch, updatedAt: new Date().toISOString() };
    writeCache(cache);

    const firebase = window.CCFirebase;
    if (!firebase?.getCurrentUser?.() || !firebase?.saveUserData) return;
    try {
      await firebase.saveUserData('vocabularyPractice', { records: cache });
    } catch (error) {
      console.warn('[vocabulary-practice] Firebase chưa sẵn sàng, đã lưu local.', error);
    }
  }

  function setFeedback(card, type, message) {
    const box = card.querySelector('.gt-practice-feedback');
    if (!box) return;
    box.className = `gt-practice-feedback show ${type || ''}`;
    box.textContent = message;
  }

  function evaluateSentence(sentence, word) {
    const cleanSentence = normalize(sentence);
    const cleanWord = normalize(word);
    if (!sentence.trim()) return { valid: false, score: 0, message: 'Bạn chưa nhập câu.' };
    if (!hasChinese(sentence)) return { valid: false, score: 10, message: 'Hãy nhập một câu bằng tiếng Trung.' };
    if (!cleanSentence.includes(cleanWord)) return { valid: false, score: 30, message: `Câu cần có từ “${word}”.` };
    if (cleanSentence === cleanWord || cleanSentence.length < cleanWord.length + 2) {
      return { valid: false, score: 45, message: 'Câu còn quá ngắn. Hãy bổ sung chủ ngữ, thời gian, địa điểm hoặc đối tượng.' };
    }
    if (/(.)\1\1\1/.test(cleanSentence)) return { valid: false, score: 35, message: 'Câu có dấu hiệu lặp ký tự bất thường.' };

    let score = 75;
    if (cleanSentence.length >= 6) score += 8;
    if (cleanSentence.length >= 10) score += 7;
    if (/[。！？?!]$/.test(sentence.trim())) score += 5;
    score = Math.min(score, 95);
    return {
      valid: true,
      score,
      message: `Câu hợp lệ ở mức cơ bản (${score}/100). Bạn đã dùng đúng từ “${word}”.`
    };
  }

  function getRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return Recognition ? new Recognition() : null;
  }

  async function requestMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  }

  async function startRecognition(card, targetText, mode) {
    const recognition = getRecognition();
    if (!recognition) {
      setFeedback(card, 'wrong', 'Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Hãy thử Chrome hoặc Edge và mở web bằng HTTPS.');
      return;
    }

    try {
      await requestMicrophonePermission();
    } catch (error) {
      setFeedback(card, 'wrong', 'Bạn chưa cấp quyền micro. Hãy cho phép micro trong cài đặt trình duyệt rồi thử lại.');
      return;
    }

    const button = card.querySelector(mode === 'sentence' ? '[data-practice-speak-sentence]' : '[data-practice-speak-word]');
    if (button) {
      button.disabled = true;
      button.classList.add('listening');
      button.textContent = '🎙️ Đang nghe…';
    }
    setFeedback(card, '', 'Đang nghe, hãy đọc rõ ràng…');

    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;

    recognition.onresult = async event => {
      const alternatives = Array.from(event.results?.[0] || []).map(item => item.transcript || '');
      const target = normalize(targetText);
      let bestText = alternatives[0] || '';
      let bestScore = 0;

      alternatives.forEach(text => {
        const heard = normalize(text);
        let score = 0;
        if (heard === target) score = 100;
        else if (heard.includes(target) || target.includes(heard)) score = 82;
        else {
          const targetChars = [...new Set(target)];
          const matched = targetChars.filter(char => heard.includes(char)).length;
          score = targetChars.length ? Math.round((matched / targetChars.length) * 70) : 0;
        }
        if (score > bestScore) { bestScore = score; bestText = text; }
      });

      const passed = bestScore >= 75;
      setFeedback(card, passed ? 'correct' : 'wrong', `${passed ? 'Đọc đạt' : 'Cần đọc lại'}: ${bestScore}/100. Nhận diện được: ${bestText || 'không rõ'}.`);
      await persistRecord(card, mode === 'sentence'
        ? { sentencePronunciationScore: bestScore, recognizedSentence: bestText }
        : { wordPronunciationScore: bestScore, recognizedWord: bestText });
    };

    recognition.onerror = event => {
      const messages = {
        'not-allowed': 'Quyền micro đã bị từ chối.',
        'no-speech': 'Không nghe thấy giọng nói. Hãy thử lại ở nơi yên tĩnh.',
        'audio-capture': 'Không tìm thấy micro hoạt động.',
        'network': 'Dịch vụ nhận diện giọng nói đang gặp lỗi mạng.'
      };
      setFeedback(card, 'wrong', messages[event.error] || 'Không thể nhận diện giọng nói. Hãy thử lại.');
    };

    recognition.onend = () => {
      if (button) {
        button.disabled = false;
        button.classList.remove('listening');
        button.textContent = mode === 'sentence' ? '🎤 Đọc câu' : '🎤 Đọc từ';
      }
    };

    recognition.start();
  }

  document.addEventListener('click', async event => {
    const card = event.target.closest('.gt-vocab-card');
    if (!card) return;

    if (event.target.closest('[data-practice-check]')) {
      const input = card.querySelector('.gt-practice-input');
      const word = card.dataset.word || '';
      const result = evaluateSentence(input?.value || '', word);
      setFeedback(card, result.valid ? 'correct' : 'wrong', result.message);
      await persistRecord(card, {
        word,
        sentence: input?.value?.trim() || '',
        sentenceScore: result.score,
        sentenceValid: result.valid
      });
      return;
    }

    if (event.target.closest('[data-practice-speak-word]')) {
      await startRecognition(card, card.dataset.word || '', 'word');
      return;
    }

    if (event.target.closest('[data-practice-speak-sentence]')) {
      const sentence = card.querySelector('.gt-practice-input')?.value?.trim() || '';
      const result = evaluateSentence(sentence, card.dataset.word || '');
      if (!result.valid) {
        setFeedback(card, 'wrong', 'Hãy nhập và kiểm tra một câu hợp lệ trước khi luyện đọc câu.');
        return;
      }
      await startRecognition(card, sentence, 'sentence');
    }
  });

  window.CCVocabularyPractice = { evaluateSentence };
})();
