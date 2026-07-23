(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const activeAnimations = new Set();
  const sloganStates = new Set();
  const rotationPattern = [-13, 9, -7, 14, -10, 6];
  const timingRanges = Object.freeze({
    chineseHold: [1400, 2100],
    translationGap: [240, 520],
    vietnameseHold: [1800, 2700],
    nextIdiomGap: [4800, 7200]
  });
  const idiomsUrl = 'assets/data/tang-thu-cac/idioms.json';
  const vietnameseOverrides = new Map([
    ['安居乐业', 'An cư lạc nghiệp'],
    ['一举两得', 'Nhất cử lưỡng tiện'],
    ['画蛇添足', 'Họa xà thiêm túc'],
    ['同甘共苦', 'Đồng cam cộng khổ'],
    ['百发百中', 'Bách phát bách trúng'],
    ['半途而废', 'Bỏ cuộc giữa chừng'],
    ['守株待兔', 'Ôm cây đợi thỏ'],
    ['亡羊补牢', 'Mất bò mới lo làm chuồng'],
    ['自相矛盾', 'Tự mâu thuẫn với chính mình'],
    ['对牛弹琴', 'Đàn gảy tai trâu'],
    ['雪中送炭', 'Giúp người lúc hoạn nạn']
  ]);
  let idiomsPromise;

  const motionIsEnabled = () => {
    if (reducedMotion.matches || document.documentElement.dataset.motion === 'off') return false;
    return !window.CCMotion || window.CCMotion.isEnabled();
  };

  const nextPaint = () => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const randomDelay = ([minimum, maximum]) => Math.round(minimum + (Math.random() * (maximum - minimum)));

  const waitForFonts = () => Promise.race([
    document.fonts?.ready || Promise.resolve(),
    new Promise(resolve => setTimeout(resolve, 700))
  ]);

  function createCharacter(character, index) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cc-hero-slogan__char';
    wrapper.dataset.charIndex = String(index);
    wrapper.setAttribute('aria-hidden', 'true');

    ['outer', 'cream', 'navy', 'fill'].forEach(layerName => {
      const layer = document.createElement('span');
      layer.className = `cc-hero-slogan__layer cc-hero-slogan__layer--${layerName}`;
      layer.textContent = character;
      wrapper.appendChild(layer);
    });

    return wrapper;
  }

  function createWord(word, startIndex) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cc-hero-slogan__word';
    Array.from(word).forEach((character, index) => {
      wrapper.appendChild(createCharacter(character, startIndex + index));
    });
    return wrapper;
  }

  function buildCharacters(slogan) {
    const lines = Array.from(slogan.querySelectorAll('[data-slogan-line]'));
    lines.forEach(line => {
      const text = line.textContent.trim();
      line.dataset.text = text;
      line.setAttribute('aria-label', text);
      line.textContent = '';
      if (line.lang === 'vi' && text.includes(' ')) {
        let characterIndex = 0;
        text.split(/\s+/).forEach(word => {
          line.appendChild(createWord(word, characterIndex));
          characterIndex += word.length;
        });
      } else {
        Array.from(text).forEach((character, index) => {
          line.appendChild(createCharacter(character, index));
        });
      }
    });
    slogan.setAttribute('aria-label', lines.map(line => line.dataset.text).join(' '));
    slogan.classList.add('is-built');
    return lines;
  }

  function cleanText(value) {
    return String(value || '').trim().replace(/[。.!?]+$/u, '');
  }

  function wordCount(value) {
    return cleanText(value).split(/\s+/u).filter(Boolean).length;
  }

  function hanziCount(value) {
    return (cleanText(value).match(/[\u3400-\u9fff]/gu) || []).length;
  }

  function capitalizeVietnamese(value) {
    const text = cleanText(value);
    return text ? text.charAt(0).toLocaleUpperCase('vi-VN') + text.slice(1) : '';
  }

  function isSuitableVietnamese(text, minimumWords) {
    return Boolean(text)
      && !/^(Ý nói rằng|Có nghĩa là|Dùng để chỉ)\b/i.test(text)
      && !/[()（）]/.test(text)
      && !/[,，:：]/.test(text)
      && wordCount(text) >= minimumWords
      && wordCount(text) <= 12
      && text.length <= 46;
  }

  function getDisplayVietnamese(item, hanzi) {
    const minimumWords = Math.max(1, hanziCount(hanzi));
    const targetWords = Math.max(4, Math.min(8, minimumWords + 1));
    const variants = [
      { text: vietnameseOverrides.get(hanzi), priority: 0 },
      { text: item.shortVietnameseMeaning, priority: 1 },
      { text: item.displayVietnamese, priority: 1 },
      ...String(item.equivalentVi || '').split(/[;；]/).map(text => ({ text, priority: 2 })),
      ...String(item.meaning || '').split(/[;；]/).map(text => ({ text, priority: 3 }))
    ]
      .map(candidate => ({ ...candidate, text: cleanText(candidate.text) }))
      .filter(candidate => isSuitableVietnamese(candidate.text, minimumWords))
      .sort((left, right) => left.priority - right.priority
        || Math.abs(wordCount(left.text) - targetWords) - Math.abs(wordCount(right.text) - targetWords)
        || left.text.length - right.text.length);

    return capitalizeVietnamese(variants[0]?.text);
  }

  function normalizeIdiom(item) {
    const id = cleanText(item?.id);
    const hanzi = cleanText(item?.hanzi);
    const displayVietnamese = getDisplayVietnamese(item || {}, hanzi);
    if (!id || !/[\u3400-\u9fff]/u.test(hanzi) || !displayVietnamese) return null;
    return { id, hanzi, displayVietnamese };
  }

  function loadIdioms() {
    if (!idiomsPromise) {
      idiomsPromise = fetch(idiomsUrl, { cache: 'force-cache' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(payload => (Array.isArray(payload.items) ? payload.items : []).map(normalizeIdiom).filter(Boolean))
        .catch(error => {
          console.warn('Không thể tải thành ngữ cho phần đầu trang:', error);
          return [];
        });
    }
    return idiomsPromise;
  }

  function chooseIdiom(items, previousId = '') {
    const candidates = items.length > 1 ? items.filter(item => item.id !== previousId) : items;
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function setLineVisible(line, visible) {
    line.querySelectorAll('.cc-hero-slogan__char').forEach(character => {
      character.style.opacity = visible ? '1' : '0';
      character.style.transform = 'none';
    });
  }

  function animationBelongsTo(animation, state) {
    return animation.effect?.target?.closest('[data-hero-slogan]') === state.slogan;
  }

  function cancelStateAnimations(state) {
    activeAnimations.forEach(animation => {
      if (!animationBelongsTo(animation, state)) return;
      animation.cancel();
      activeAnimations.delete(animation);
    });
  }

  function showReducedState(state) {
    state.slogan.classList.remove('is-preparing');
    state.slogan.classList.add('is-reduced');
    setLineVisible(state.lines[0], false);
    setLineVisible(state.lines[1], true);
  }

  function stopLoop(state, showStatic) {
    state.cancelled = true;
    state.restartRequested = false;
    clearStateWait(state);
    cancelStateAnimations(state);
    if (showStatic) showReducedState(state);
  }

  function setLineLengthClass(line, text) {
    line.classList.toggle('is-long', text.length > 18);
    line.classList.toggle('is-very-long', text.length > 28);
  }

  function applyIdiom(state, idiom, restartLoop = true) {
    if (!idiom) return;
    if (restartLoop) {
      state.cancelled = true;
      state.restartRequested = true;
      clearStateWait(state);
      cancelStateAnimations(state);
    }

    const [chineseLine, vietnameseLine] = state.lines;
    chineseLine.lang = 'zh-CN';
    vietnameseLine.lang = 'vi';
    chineseLine.textContent = idiom.hanzi;
    vietnameseLine.textContent = idiom.displayVietnamese;
    setLineLengthClass(chineseLine, idiom.hanzi);
    setLineLengthClass(vietnameseLine, idiom.displayVietnamese);
    state.lines = buildCharacters(state.slogan);
    state.selectedId = idiom.id;
    state.slogan.title = `${idiom.hanzi} — ${idiom.displayVietnamese}`;
    state.slogan.dataset.idiomId = idiom.id;

    if (restartLoop && state.hasEntered) requestLoop(state);
  }

  function showNextIdiom(state, restartLoop = true) {
    const idiom = chooseIdiom(state.idioms, state.selectedId);
    if (idiom) applyIdiom(state, idiom, restartLoop);
  }

  function openSelectedIdiom(state) {
    if (!state.selectedId) return;
    try {
      localStorage.setItem('ttc_idioms_selected', state.selectedId);
    } catch (_error) {
      // The id is also present in the URL, so navigation remains exact without storage.
    }
    location.href = `vocabulary.html?idiom=${encodeURIComponent(state.selectedId)}#idioms`;
  }

  function bindIdiomInteraction(state) {
    state.slogan.addEventListener('click', event => {
      event.stopPropagation();
      openSelectedIdiom(state);
    });

    Object.values(state.sources).forEach(source => {
      source.classList.add('cc-hero-slogan__source');
      source.addEventListener('click', event => {
        event.stopPropagation();
        showNextIdiom(state);
      });
    });
  }

  function syncScenePlayback(state) {
    const paused = document.hidden;
    state.scene.classList.toggle('is-paused', paused);
    activeAnimations.forEach(animation => {
      if (!animationBelongsTo(animation, state)) return;
      if (paused) animation.pause();
      else animation.play();
    });
  }

  function clearStateWait(state) {
    if (state.waitTimer) clearTimeout(state.waitTimer);
    state.waitTimer = 0;
    const resolve = state.waitResolve;
    state.waitResolve = null;
    if (resolve) resolve(false);
  }

  function waitWhileVisible(milliseconds, state) {
    if (state.cancelled) return Promise.resolve(false);
    return new Promise(resolve => {
      state.waitResolve = resolve;
      state.waitTimer = window.setTimeout(() => {
        state.waitTimer = 0;
        state.waitResolve = null;
        resolve(!state.cancelled);
      }, milliseconds);
    });
  }

  async function animateLine(state, line, source, direction) {
    const characters = Array.from(line.querySelectorAll('.cc-hero-slogan__char'));
    setLineVisible(line, false);

    const sourceRect = source.getBoundingClientRect();
    const sourceX = direction === 'mouse' ? sourceRect.right - 5 : sourceRect.left + 5;
    const sourceY = sourceRect.top + (sourceRect.height * .36);

    const flights = characters.map((character, index) => {
      const targetRect = character.getBoundingClientRect();
      const targetX = targetRect.left + (targetRect.width / 2);
      const targetY = targetRect.top + (targetRect.height / 2);
      const offsetX = sourceX - targetX;
      const offsetY = sourceY - targetY;
      const arcHeight = 30 + ((index % 3) * 9) + (index % 2 ? 4 : 0);
      const startRotation = rotationPattern[index % rotationPattern.length] * (direction === 'mouse' ? 1 : -1);
      const landingRotation = index % 2 ? -2 : 2;
      const duration = 640 + ((index % 3) * 40);

      const animation = character.animate([
        {
          opacity: 0,
          transform: `translate3d(${offsetX}px, ${offsetY}px, 0) rotate(${startRotation}deg) scale(.1)`
        },
        {
          opacity: .94,
          offset: .48,
          transform: `translate3d(${offsetX * .48}px, ${(offsetY * .48) - arcHeight}px, 0) rotate(${-startRotation * .35}deg) scale(.58)`
        },
        {
          opacity: 1,
          offset: .84,
          transform: `translate3d(${offsetX * .07}px, -4px, 0) rotate(${landingRotation}deg) scale(1.07)`
        },
        {
          opacity: 1,
          transform: 'translate3d(0, 0, 0) rotate(0) scale(1)'
        }
      ], {
        duration,
        delay: index * 105,
        easing: 'cubic-bezier(.2, .78, .24, 1.16)',
        fill: 'both'
      });

      activeAnimations.add(animation);
      return animation.finished
        .catch(() => undefined)
        .then(() => {
          activeAnimations.delete(animation);
          if (!state.cancelled) {
            character.style.opacity = '1';
            character.style.transform = 'none';
          }
          animation.cancel();
        });
    });

    await Promise.all(flights);
    return !state.cancelled;
  }

  async function hideLine(state, line) {
    const characters = Array.from(line.querySelectorAll('.cc-hero-slogan__char'));
    const exits = characters.map((character, index) => {
      const animation = character.animate([
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        { opacity: 0, transform: 'translate3d(0, -7px, 0) scale(.78)' }
      ], {
        duration: 280,
        delay: (characters.length - index - 1) * 18,
        easing: 'cubic-bezier(.4, 0, .8, .4)',
        fill: 'both'
      });

      activeAnimations.add(animation);
      return animation.finished
        .catch(() => undefined)
        .then(() => {
          activeAnimations.delete(animation);
          if (!state.cancelled) {
            character.style.opacity = '0';
            character.style.transform = 'none';
          }
          animation.cancel();
        });
    });

    await Promise.all(exits);
    return !state.cancelled;
  }

  async function runLoop(state) {
    if (state.running) {
      state.restartRequested = true;
      return;
    }

    state.running = true;
    state.cancelled = false;
    state.restartRequested = false;
    state.slogan.classList.remove('is-reduced');
    state.slogan.classList.add('is-preparing');
    setLineVisible(state.lines[0], false);
    setLineVisible(state.lines[1], false);

    try {
      await waitForFonts();
      await nextPaint();

      while (!state.cancelled && motionIsEnabled()) {
        if (!await animateLine(state, state.lines[0], state.sources.mouse, 'mouse')) break;
        if (!await waitWhileVisible(randomDelay(timingRanges.chineseHold), state)) break;
        if (!await hideLine(state, state.lines[0])) break;
        if (!await waitWhileVisible(randomDelay(timingRanges.translationGap), state)) break;

        if (!await animateLine(state, state.lines[1], state.sources.cat, 'cat')) break;
        if (!await waitWhileVisible(randomDelay(timingRanges.vietnameseHold), state)) break;
        if (!await hideLine(state, state.lines[1])) break;
        if (!await waitWhileVisible(randomDelay(timingRanges.nextIdiomGap), state)) break;
        showNextIdiom(state, false);
      }
    } catch (error) {
      console.warn('Không thể chạy hiệu ứng slogan:', error);
      stopLoop(state, true);
    } finally {
      state.running = false;
      if (state.restartRequested && motionIsEnabled() && state.hasEntered) runLoop(state);
    }
  }

  function requestLoop(state) {
    if (!motionIsEnabled()) {
      stopLoop(state, true);
      return;
    }
    state.restartRequested = true;
    if (!state.running && state.hasEntered) runLoop(state);
  }

  function initialiseSlogan(slogan) {
    const scene = slogan.closest('.hsk-hero-scene, .writing-hero-scene') || slogan.parentElement;
    const mouse = scene.querySelector(slogan.dataset.mouse);
    const cat = scene.querySelector(slogan.dataset.cat);
    if (!mouse || !cat) return;

    const state = {
      slogan,
      scene,
      lines: buildCharacters(slogan),
      sources: { mouse, cat },
      hasEntered: false,
      running: false,
      cancelled: false,
      restartRequested: false,
      waitTimer: 0,
      waitResolve: null,
      idioms: [],
      selectedId: ''
    };
    sloganStates.add(state);
    bindIdiomInteraction(state);

    loadIdioms().then(items => {
      if (!items.length) return;
      state.idioms = items;
      applyIdiom(state, chooseIdiom(items));
    });

    if (motionIsEnabled() && typeof Element.prototype.animate === 'function') {
      slogan.classList.add('is-preparing');
      setLineVisible(state.lines[0], false);
      setLineVisible(state.lines[1], false);
    } else {
      showReducedState(state);
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        state.hasEntered = true;
        requestLoop(state);
        syncScenePlayback(state);
      }, { threshold: .2 });
      observer.observe(scene);
    } else {
      state.hasEntered = true;
      requestLoop(state);
    }

    window.addEventListener('cc:motionchange', event => {
      if (event.detail?.enabled === false) stopLoop(state, true);
      else requestLoop(state);
    });
  }

  document.querySelectorAll('[data-hero-slogan]').forEach(initialiseSlogan);

  reducedMotion.addEventListener?.('change', event => {
    sloganStates.forEach(state => {
      if (event.matches) stopLoop(state, true);
      else requestLoop(state);
    });
  });

  document.addEventListener('visibilitychange', () => {
    sloganStates.forEach(syncScenePlayback);
  });

  window.addEventListener('pagehide', () => {
    sloganStates.forEach(state => stopLoop(state, false));
  }, { once: true });
})();
