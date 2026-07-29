(() => {
  "use strict";

  const DATA_FILES = {
    grammar: "assets/data/tang-thu-cac/grammar.json",
    idioms: "assets/data/tang-thu-cac/idioms.json",
    radicals: "assets/data/tang-thu-cac/radicals.json?v=2",
  };
  const ARCHIVE_TABS = ["dictionary", "grammar", "idioms", "radicals"];
  let radicalsResizeObserver = null;
  let radicalsResizeFrame = 0;

  const state = {
    activeTab: "",
    grammar: createCollectionState(),
    idioms: createCollectionState(),
    radicals: { ...createCollectionState(), category: "common" },
  };

  function createCollectionState() {
    return {
      loaded: false,
      loading: false,
      items: [],
      filtered: [],
      selectedId: "",
      query: "",
      level: "all",
      category: "all",
      initial: "all",
      strokeGroup: "all",
      page: 1,
      pageSize: 12,
      columns: 4,
    };
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim();
  }

  function init() {
    bindTabs();
    bindGrammarControls();
    bindIdiomControls();
    bindRadicalControls();
    initArchiveVideo();

    const requested = location.hash.replace("#", "").toLowerCase();
    if (ARCHIVE_TABS.includes(requested)) activateTab(requested, false);
  }

  function initArchiveVideo() {
    const video = $(".archive-video-frame__video");
    const source = video?.querySelector("source[data-src]");
    if (!video || !source) return;

    let scheduled = false;
    const loadVideo = () => {
      if (!source.dataset.src) return;
      source.src = source.dataset.src;
      delete source.dataset.src;
      video.load();
      if (document.documentElement.dataset.motion !== "off") {
        const playback = video.play();
        playback?.catch?.(() => {});
      }
    };
    const scheduleVideo = () => {
      if (scheduled || document.documentElement.dataset.motion === "off") return;
      scheduled = true;
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(loadVideo, { timeout: 1400 });
      } else {
        window.setTimeout(loadVideo, 650);
      }
    };

    scheduleVideo();
    window.addEventListener("cc:motionchange", (event) => {
      if (event.detail?.enabled) scheduleVideo();
    });
  }

  function bindTabs() {
    const tabs = $$("[data-archive-tab]");
    const tabList = $(".archive-tabs");
    let previewTab = null;

    const setPreview = (button) => {
      if (tabList?.classList.contains("is-compact")) return;
      previewTab = button || null;
      tabs.forEach((item) => {
        const active = item === previewTab;
        item.classList.toggle("is-preview", active);
        item.setAttribute("aria-expanded", active ? "true" : "false");
      });
      tabList?.classList.toggle("has-preview", Boolean(previewTab));
      if (previewTab) tabList.dataset.activeIndex = String(tabs.indexOf(previewTab));
      else delete tabList?.dataset.activeIndex;
    };

    tabs.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", (event) => {
        if (tabList?.classList.contains("is-compact") || button === previewTab) {
          activateTab(button.dataset.archiveTab);
          return;
        }
        event.preventDefault();
        setPreview(button);
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = tabs.indexOf(button);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        setPreview(tabs[nextIndex]);
      });
    });
    document.addEventListener("pointerdown", (event) => {
      if (!previewTab || event.target.closest(".archive-tabs")) return;
      setPreview(null);
    });
    document.addEventListener("focusin", (event) => {
      if (!previewTab || event.target.closest(".archive-tabs")) return;
      setPreview(null);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !previewTab) return;
      const previous = previewTab;
      setPreview(null);
      previous.focus();
    });
    window.addEventListener("hashchange", () => {
      const requested = location.hash.replace("#", "").toLowerCase();
      if (ARCHIVE_TABS.includes(requested)) activateTab(requested, false);
    });
  }

  async function activateTab(tab, updateHash = true) {
    state.activeTab = tab;
    const masthead = $(".archive-masthead");
    const tabList = $(".archive-tabs");
    masthead?.classList.add("is-browsing");
    tabList?.classList.add("is-compact");
    tabList?.classList.remove("has-preview");
    if (tabList) delete tabList.dataset.activeIndex;
    $$("[data-archive-tab]").forEach((button) => {
      const active = button.dataset.archiveTab === tab;
      button.classList.remove("is-preview");
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    $$("[data-archive-panel]").forEach((panel) => {
      const active = panel.dataset.archivePanel === tab;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

    if (updateHash) {
      try {
        history.replaceState(null, "", `#${tab}`);
      } catch (_error) {
        location.hash = tab;
      }
    }
    if (tab === "dictionary") await window.ensureDictionaryLoaded?.();
    if (tab === "grammar") await ensureLoaded("grammar");
    if (tab === "idioms") await ensureLoaded("idioms");
    if (tab === "radicals") await ensureLoaded("radicals");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function ensureLoaded(type) {
    const collection = state[type];
    if (collection.loaded || collection.loading) return;
    collection.loading = true;
    const list = $(`#${type}LibraryList`);
    const detail = $(`#${type}LibraryDetail`);
    if (list) list.innerHTML = '<div class="library-loading">Đang tải dữ liệu…</div>';
    if (detail) detail.innerHTML = '<div class="library-loading">Đang chuẩn bị nội dung…</div>';

    try {
      const response = await fetch(DATA_FILES[type], { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      collection.items = Array.isArray(payload.items) ? payload.items : [];
      collection.loaded = true;
      const requestedId = type === "idioms" ? new URLSearchParams(location.search).get("idiom") : "";
      collection.selectedId = type === "radicals"
        ? ""
        : requestedId || localStorage.getItem(`ttc_${type}_selected`) || collection.items[0]?.id || "";
      renderAlphabet(type, payload.meta?.initials || []);
      applyFilters(type);
      if (type === "radicals") observeRadicalGrid();
    } catch (error) {
      console.error(`[Tàng Thư Các] Không tải được ${type}:`, error);
      const message = '<div class="library-error">Không thể tải dữ liệu. Hãy chạy lại bằng Live Server/Vercel thay vì mở file HTML trực tiếp.</div>';
      if (list) list.innerHTML = message;
      if (detail) detail.innerHTML = message;
    } finally {
      collection.loading = false;
    }
  }

  function renderAlphabet(type, initials) {
    const container = $(`#${type}Alphabet`);
    if (!container) return;
    container.innerHTML = ["all", ...initials]
      .map((letter) => `<button type="button" class="library-letter-btn${letter === "all" ? " is-active" : ""}" data-${type}-initial="${escapeHtml(letter)}">${letter === "all" ? "Tất cả" : escapeHtml(letter)}</button>`)
      .join("");
    container.addEventListener("click", (event) => {
      const button = event.target.closest(`[data-${type}-initial]`);
      if (!button) return;
      state[type].initial = button.dataset[`${type}Initial`];
      $$(`[data-${type}-initial]`, container).forEach((item) => item.classList.toggle("is-active", item === button));
      applyFilters(type);
    });
  }

  function bindGrammarControls() {
    bindSearch("grammar", "grammarLibrarySearch", "grammarSearchClear");
    $$('[data-grammar-level]').forEach((button) => {
      button.addEventListener("click", () => {
        state.grammar.level = button.dataset.grammarLevel;
        $$('[data-grammar-level]').forEach((item) => item.classList.toggle("is-active", item === button));
        applyFilters("grammar");
      });
    });
  }

  function bindIdiomControls() {
    bindSearch("idioms", "idiomsLibrarySearch", "idiomsSearchClear");
    $$('[data-idioms-category]').forEach((button) => {
      button.addEventListener("click", () => {
        state.idioms.category = button.dataset.idiomsCategory;
        $$('[data-idioms-category]').forEach((item) => item.classList.toggle("is-active", item === button));
        applyFilters("idioms");
      });
    });
  }

  function bindRadicalControls() {
    bindSearch("radicals", "radicalsLibrarySearch", "radicalsSearchClear");
    $$("[data-radicals-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.radicals.category = button.dataset.radicalsCategory;
        $$("[data-radicals-category]").forEach((item) => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", active ? "true" : "false");
          const action = $(".radicals-group-card__action", item);
          if (action) action.innerHTML = active ? 'Đang chọn <b aria-hidden="true">→</b>' : 'Chọn lộ trình <b aria-hidden="true">→</b>';
        });
        resetRadicalSelection();
        applyFilters("radicals");
      });
    });
    $$("[data-radicals-strokes]").forEach((button) => {
      button.addEventListener("click", () => {
        state.radicals.strokeGroup = button.dataset.radicalsStrokes;
        $$("[data-radicals-strokes]").forEach((item) => item.classList.toggle("is-active", item === button));
        resetRadicalSelection();
        applyFilters("radicals");
      });
    });
  }

  function resetRadicalSelection() {
    state.radicals.selectedId = "";
    state.radicals.page = 1;
    const detail = $("#radicalsLibraryDetail");
    if (detail) {
      detail.hidden = true;
      detail.innerHTML = "";
    }
  }

  function observeRadicalGrid() {
    const list = $("#radicalsLibraryList");
    if (!list || typeof ResizeObserver !== "function") return;
    radicalsResizeObserver?.disconnect();
    radicalsResizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(radicalsResizeFrame);
      radicalsResizeFrame = requestAnimationFrame(updateRadicalPageSize);
    });
    radicalsResizeObserver.observe(list);
    updateRadicalPageSize();
  }

  function updateRadicalPageSize() {
    const list = $("#radicalsLibraryList");
    if (!list || !state.radicals.loaded) return;
    const width = list.clientWidth;
    if (!width) return;
    const minimumCardWidth = width <= 520 ? 250 : width <= 900 ? 255 : 270;
    const gap = width <= 680 ? 10 : 14;
    const columns = Math.max(1, Math.min(4, Math.floor((width + gap) / (minimumCardWidth + gap))));
    const rows = width <= 520 ? 4 : 3;
    const pageSize = Math.max(1, columns * rows);
    const collection = state.radicals;
    if (collection.columns === columns && collection.pageSize === pageSize) return;
    const firstVisibleIndex = (collection.page - 1) * collection.pageSize;
    collection.columns = columns;
    collection.pageSize = pageSize;
    collection.page = Math.floor(firstVisibleIndex / pageSize) + 1;
    list.style.setProperty("--radical-columns", String(columns));
    renderList("radicals");
  }

  function bindSearch(type, inputId, clearId) {
    const input = $(`#${inputId}`);
    const clear = $(`#${clearId}`);
    if (!input || !clear) return;
    let timer = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      clear.classList.toggle("is-visible", Boolean(input.value));
      timer = window.setTimeout(() => {
        state[type].query = input.value;
        if (type === "radicals") resetRadicalSelection();
        applyFilters(type);
      }, 120);
    });
    clear.addEventListener("click", () => {
      input.value = "";
      state[type].query = "";
      clear.classList.remove("is-visible");
      input.focus();
      if (type === "radicals") resetRadicalSelection();
      applyFilters(type);
    });
  }

  function applyFilters(type) {
    const collection = state[type];
    const query = normalize(collection.query);

    collection.filtered = collection.items.filter((item) => {
      const matchesInitial = collection.initial === "all" || item.initial === collection.initial;
      if (!matchesInitial) return false;

      if (type === "grammar") {
        const matchesLevel = collection.level === "all" || (item.levels || []).includes(collection.level);
        if (!matchesLevel) return false;
        if (!query) return true;
        const searchable = normalize([
          item.title, item.keyword, item.pattern, item.structure, item.explanation, item.usage,
          ...(item.examples || []).flatMap((example) => [example.zh, example.pinyin, example.vi]),
        ].join(" "));
        return searchable.includes(query);
      }

      if (type === "radicals") {
        const matchesCategory = item.category === collection.category;
        if (!matchesCategory) return false;
        const [minimum, maximum] = collection.strokeGroup === "all"
          ? [1, Number.POSITIVE_INFINITY]
          : collection.strokeGroup.split("-").map(Number);
        if (item.strokes < minimum || item.strokes > maximum) return false;
        if (!query) return true;
        const searchable = normalize([
          item.number, item.radical, ...(item.variants || []), item.pinyin, item.hanViet,
          item.meaningVi, item.meaningEn, ...(item.examples || []),
        ].join(" "));
        return searchable.includes(query);
      }

      const matchesCategory = collection.category === "all" || item.category === collection.category;
      if (!matchesCategory) return false;
      if (!query) return true;
      const searchable = normalize([
        item.hanzi, item.pinyin, item.meaning, item.equivalentVi, item.category, item.tone,
        item.example?.zh, item.example?.pinyin, item.example?.vi,
      ].join(" "));
      return searchable.includes(query);
    });

    if (type === "radicals") {
      collection.filtered.sort((left, right) => collection.category === "common"
        ? (left.commonRank || 999) - (right.commonRank || 999)
        : left.number - right.number);
    }
    if (!collection.filtered.some((item) => item.id === collection.selectedId)) {
      collection.selectedId = type === "radicals" ? "" : collection.filtered[0]?.id || "";
    }
    if (type === "radicals") {
      const totalPages = Math.max(1, Math.ceil(collection.filtered.length / collection.pageSize));
      collection.page = Math.min(Math.max(1, collection.page), totalPages);
    }
    renderList(type);
    renderDetail(type);
  }

  function renderList(type) {
    const collection = state[type];
    const list = $(`#${type}LibraryList`);
    const count = $(`#${type}LibraryCount`);
    const listCount = $(`#${type}ListCount`);
    if (count) count.textContent = collection.filtered.length.toLocaleString("vi-VN");
    if (listCount) listCount.textContent = `${collection.filtered.length.toLocaleString("vi-VN")} ${type === "radicals" ? "bộ" : "mục"}`;
    if (!list) return;

    if (!collection.filtered.length) {
      list.innerHTML = '<div class="library-empty-list">Không tìm thấy nội dung phù hợp với bộ lọc.</div>';
      if (type === "radicals") {
        const pagination = $("#radicalsPagination");
        if (pagination) pagination.hidden = true;
        const summary = $("#radicalsPageSummary");
        if (summary) summary.textContent = "Không có kết quả phù hợp";
      }
      return;
    }

    if (type === "radicals") {
      renderRadicalGrid(collection, list);
      return;
    }

    let previousInitial = "";
    const html = [];
    for (const item of collection.filtered) {
      if (item.initial !== previousInitial) {
        previousInitial = item.initial;
        html.push(`<div class="library-letter-heading">${escapeHtml(item.initial)}</div>`);
      }
      const active = item.id === collection.selectedId;
      if (type === "grammar") {
        html.push(`
          <button type="button" class="library-list-item${active ? " is-active" : ""}" data-library-id="${escapeHtml(item.id)}">
            <span class="library-list-item__title">${escapeHtml(item.title)}</span>
            <span class="library-list-item__meta">
              ${(item.levels || []).slice(0, 3).map((level) => `<span class="library-mini-badge">${escapeHtml(level)}</span>`).join("")}
              <span>${escapeHtml(item.keyword)}</span>
            </span>
          </button>`);
      } else {
        html.push(`
          <button type="button" class="library-list-item${active ? " is-active" : ""}" data-library-id="${escapeHtml(item.id)}">
            <span class="library-list-item__title">${escapeHtml(item.hanzi)}</span>
            <span class="library-list-item__meta"><span>${escapeHtml(item.pinyin)}</span><span>•</span><span>${escapeHtml(item.meaning)}</span></span>
          </button>`);
      }
    }
    list.innerHTML = html.join("");
    list.onclick = (event) => {
      const button = event.target.closest("[data-library-id]");
      if (!button) return;
      selectItem(type, button.dataset.libraryId);
    };
  }

  function renderRadicalGrid(collection, list) {
    const totalPages = Math.max(1, Math.ceil(collection.filtered.length / collection.pageSize));
    collection.page = Math.min(Math.max(1, collection.page), totalPages);
    const start = (collection.page - 1) * collection.pageSize;
    const pageItems = collection.filtered.slice(start, start + collection.pageSize);
    list.style.setProperty("--radical-columns", String(collection.columns));
    list.innerHTML = pageItems.map((item) => {
      const active = item.id === collection.selectedId;
      const variants = (item.variants || []).slice(0, 3);
      return `
        <button type="button" class="radical-library-card${active ? " is-active" : ""}" data-library-id="${escapeHtml(item.id)}" aria-pressed="${active ? "true" : "false"}">
          <span class="radical-library-card__glyph">${escapeHtml(item.radical)}</span>
          <span class="radical-library-card__copy">
            <strong>${escapeHtml(item.number)}. Bộ ${escapeHtml(item.hanViet)}</strong>
            <span class="radical-library-card__reading">${escapeHtml(item.pinyin)} · ${escapeHtml(item.meaningVi)}</span>
            <span class="radical-library-card__variants">${variants.length ? `Bộ kiện: ${variants.map(escapeHtml).join(" · ")}` : "Dùng nguyên dạng"}</span>
          </span>
          <span class="radical-library-card__meta">
            <small>${escapeHtml(item.strokes)} nét</small>
            <b aria-hidden="true">→</b>
          </span>
        </button>`;
    }).join("");
    list.onclick = (event) => {
      const button = event.target.closest("[data-library-id]");
      if (!button) return;
      selectItem("radicals", button.dataset.libraryId);
    };
    renderRadicalPagination(collection, totalPages, start, pageItems.length);
  }

  function renderRadicalPagination(collection, totalPages, start, shownCount) {
    const pagination = $("#radicalsPagination");
    const summary = $("#radicalsPageSummary");
    if (summary) {
      const from = collection.filtered.length ? start + 1 : 0;
      const to = start + shownCount;
      summary.textContent = `${from}–${to} / ${collection.filtered.length} bộ · ${collection.pageSize} bộ mỗi trang`;
    }
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.innerHTML = "";
      pagination.hidden = true;
      return;
    }
    pagination.hidden = false;
    const pages = new Set([1, totalPages, collection.page - 1, collection.page, collection.page + 1]);
    const visiblePages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
    const pageButtons = [];
    let previous = 0;
    for (const page of visiblePages) {
      if (previous && page - previous > 1) pageButtons.push('<span class="radicals-pagination__ellipsis" aria-hidden="true">…</span>');
      pageButtons.push(`<button type="button" data-radicals-page="${page}"${page === collection.page ? ' class="is-active" aria-current="page"' : ""}>${page}</button>`);
      previous = page;
    }
    pagination.innerHTML = `
      <button type="button" class="radicals-pagination__edge" data-radicals-page="${collection.page - 1}" ${collection.page === 1 ? "disabled" : ""} aria-label="Trang trước">←</button>
      <div class="radicals-pagination__pages">${pageButtons.join("")}</div>
      <span class="radicals-pagination__status">Trang ${collection.page}/${totalPages}</span>
      <button type="button" class="radicals-pagination__edge" data-radicals-page="${collection.page + 1}" ${collection.page === totalPages ? "disabled" : ""} aria-label="Trang sau">→</button>`;
    pagination.onclick = (event) => {
      const button = event.target.closest("[data-radicals-page]");
      if (!button || button.disabled) return;
      const page = Number(button.dataset.radicalsPage);
      if (!Number.isInteger(page) || page < 1 || page > totalPages || page === collection.page) return;
      collection.page = page;
      collection.selectedId = "";
      const detail = $("#radicalsLibraryDetail");
      if (detail) {
        detail.hidden = true;
        detail.innerHTML = "";
      }
      renderList("radicals");
      $(".radicals-collection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  function selectItem(type, id) {
    state[type].selectedId = id;
    localStorage.setItem(`ttc_${type}_selected`, id);
    if (type === "radicals") {
      const index = state.radicals.filtered.findIndex((item) => item.id === id);
      const targetPage = index >= 0 ? Math.floor(index / state.radicals.pageSize) + 1 : state.radicals.page;
      if (targetPage !== state.radicals.page) {
        state.radicals.page = targetPage;
        renderList("radicals");
      }
    }
    $$(`#${type}LibraryList [data-library-id]`).forEach((button) => {
      const active = button.dataset.libraryId === id;
      button.classList.toggle("is-active", active);
      if (type === "radicals") button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderDetail(type);
    if (type === "radicals") {
      requestAnimationFrame(() => $(`#${type}LibraryDetail`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else if (window.innerWidth <= 900) {
      $(`#${type}LibraryDetail`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderDetail(type) {
    const collection = state[type];
    const detail = $(`#${type}LibraryDetail`);
    if (!detail) return;
    const item = collection.filtered.find((entry) => entry.id === collection.selectedId);
    if (!item) {
      if (type === "radicals") {
        detail.hidden = true;
        detail.innerHTML = "";
        return;
      }
      detail.innerHTML = '<div class="library-detail-empty"><div><div class="library-detail-empty__icon">📚</div><h3>Chưa có nội dung được chọn</h3><p>Hãy thay đổi từ khóa hoặc bộ lọc.</p></div></div>';
      return;
    }

    detail.hidden = false;
    detail.innerHTML = type === "grammar"
      ? grammarDetailTemplate(item)
      : type === "radicals"
        ? radicalDetailTemplate(item)
        : idiomDetailTemplate(item);
    bindDetailNavigation(type, item);
  }

  function detailNavigationTemplate() {
    return `
      <div class="library-detail-nav">
        <button type="button" data-library-nav="prev">← Mục trước</button>
        <button type="button" data-library-nav="random">🎲 Ngẫu nhiên</button>
        <button type="button" data-library-nav="next">Mục sau →</button>
      </div>`;
  }

  function grammarDetailTemplate(item) {
    const examples = (item.examples || []).length
      ? `<div class="library-examples">${item.examples.map(exampleTemplate).join("")}</div>`
      : "Chưa có ví dụ riêng cho cấu trúc này.";
    return `
      <div class="library-detail-header">
        <div class="library-detail-header__top">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <div class="library-detail-header__sub">Xếp nhóm ${escapeHtml(item.initial)} · ${escapeHtml(item.keyword)}</div>
            <div class="library-detail-header__badges">${(item.levels || []).map((level) => `<span class="library-badge">${escapeHtml(level)}</span>`).join("")}</div>
          </div>
          <button type="button" class="library-speak-btn" data-library-speak="${escapeHtml(extractChinese(item.title) || item.pattern)}">🔊 Đọc cấu trúc</button>
        </div>
      </div>
      <div class="library-detail-body">
        ${detailNavigationTemplate()}
        <div class="library-info-grid">
          ${infoBox("Cấu trúc mẫu", item.pattern || item.title)}
          ${infoBox("Chức năng", item.structure || "Xem phần giải thích.")}
          ${infoBox("Giải thích", item.explanation || "Nội dung đang được hoàn thiện.", true)}
          ${item.usage ? infoBox("Lưu ý sử dụng", item.usage, true) : ""}
          ${infoBox("Ví dụ", examples, true, true)}
        </div>
      </div>`;
  }

  function idiomDetailTemplate(item) {
    const toneClass = item.tone === "Tích cực" ? "idiom-tone--positive" : item.tone === "Tiêu cực" ? "idiom-tone--negative" : "idiom-tone--neutral";
    return `
      <div class="library-detail-header">
        <div class="library-detail-header__top">
          <div>
            <h3 class="idiom-hanzi">${escapeHtml(item.hanzi)}</h3>
            <div class="library-detail-header__sub">${escapeHtml(item.pinyin)}</div>
            <div class="library-detail-header__badges">
              <span class="library-badge">${escapeHtml(item.category)}</span>
              <span class="library-badge ${toneClass}">${escapeHtml(item.tone)}</span>
              <span class="library-badge">HSK ${escapeHtml(item.hsk)}</span>
            </div>
          </div>
          <button type="button" class="library-speak-btn" data-library-speak="${escapeHtml(item.hanzi)}">🔊 Phát âm</button>
        </div>
      </div>
      <div class="library-detail-body">
        ${detailNavigationTemplate()}
        <div class="library-info-grid">
          ${infoBox("Đại ý", item.meaning)}
          ${infoBox("Tiếng Việt tương đương", `<span class="idiom-equivalent">${escapeHtml(item.equivalentVi)}</span>`, false, true)}
          ${infoBox("Cách dùng", item.usage, true)}
          ${infoBox("Ví dụ", `<div class="library-examples">${exampleTemplate(item.example || {})}</div>`, true, true)}
        </div>
      </div>`;
  }

  function radicalDetailTemplate(item) {
    const variants = (item.variants || []).length
      ? `<div class="radical-variant-row">${item.variants.map((variant) => `<span>${escapeHtml(variant)}</span>`).join("")}</div>`
      : '<span class="radical-no-variant">Bộ này thường giữ nguyên hình gốc.</span>';
    const examples = (item.examples || []).length
      ? `<div class="radical-example-row">${item.examples.map((example) => `<span>${escapeHtml(example)}</span>`).join("")}</div>`
      : "Chưa có chữ mẫu.";
    const groupLabel = item.category === "common"
      ? `Bộ thường gặp · hạng ${escapeHtml(item.commonRank)}`
      : "Nhóm mở rộng";
    return `
      <div class="library-detail-header radical-detail-header">
        <div class="library-detail-header__top">
          <div class="radical-detail-identity">
            <div class="radical-detail-glyph" aria-hidden="true">${escapeHtml(item.radical)}</div>
            <div>
              <div class="radical-detail-overline">${escapeHtml(item.number)}. Bộ ${escapeHtml(item.hanViet)}</div>
              <h3>${escapeHtml(item.radical)} · ${escapeHtml(item.meaningVi)}</h3>
              <div class="library-detail-header__sub">${escapeHtml(item.pinyin)}</div>
              <div class="library-detail-header__badges">
                <span class="library-badge">${escapeHtml(item.strokes)} nét</span>
                <span class="library-badge">${groupLabel}</span>
              </div>
            </div>
          </div>
          <button type="button" class="library-speak-btn" data-library-speak="${escapeHtml(item.radical)}">🔊 Phát âm</button>
        </div>
      </div>
      <div class="library-detail-body radical-detail-body">
        ${detailNavigationTemplate()}
        <div class="library-info-grid">
          ${infoBox("Dạng giản thể", `<span class="radical-inline-glyph">${escapeHtml(item.radical)}</span>`, false, true)}
          ${infoBox("Pinyin · Hán Việt", `<strong>${escapeHtml(item.pinyin)}</strong><br>${escapeHtml(item.hanViet)}`, false, true)}
          ${infoBox("Bộ kiện / biến thể", variants, true, true)}
          ${infoBox("Gợi nghĩa", `${escapeHtml(item.meaningVi)} <span class="radical-english">· ${escapeHtml(item.meaningEn)}</span>`, true, true)}
          ${infoBox("Chữ mẫu có bộ này", examples, true, true)}
        </div>
        <div class="radical-study-tip"><strong>Mẹo ghi nhớ</strong><span>Nhìn hình bộ → đọc nghĩa gợi ý → tìm lại bộ trong từng chữ mẫu. Bộ thủ giúp tra cứu và đoán trường nghĩa, nhưng không quyết định toàn bộ nghĩa của chữ.</span></div>
      </div>`;
  }

  function infoBox(label, value, wide = false, raw = false) {
    return `<div class="library-info-box${wide ? " is-wide" : ""}"><div class="library-info-box__label">${escapeHtml(label)}</div><div class="library-info-box__value">${raw ? value : escapeHtml(value || "—")}</div></div>`;
  }

  function exampleTemplate(example) {
    return `<div class="library-example">
      ${example.zh ? `<div class="library-example__zh">${escapeHtml(example.zh)}</div>` : ""}
      ${example.pinyin ? `<div class="library-example__pinyin">${escapeHtml(example.pinyin)}</div>` : ""}
      ${example.vi ? `<div class="library-example__vi">${escapeHtml(example.vi)}</div>` : ""}
    </div>`;
  }

  function extractChinese(value) {
    return (String(value || "").match(/[\u3400-\u9fff…]+/g) || []).join("");
  }

  function bindDetailNavigation(type, item) {
    const detail = $(`#${type}LibraryDetail`);
    if (!detail) return;
    detail.querySelectorAll("[data-library-nav]").forEach((button) => {
      button.addEventListener("click", () => navigate(type, button.dataset.libraryNav));
    });
    detail.querySelector("[data-library-speak]")?.addEventListener("click", (event) => {
      const text = event.currentTarget.dataset.librarySpeak;
      if (!text) return;
      if (window.CCAudio?.speak) {
        window.CCAudio.speak({
          text,
          mode: type === "idioms" || type === "radicals" ? "vocabulary" : "sentence",
          lang: "zh-CN",
          browserOnly: type === "grammar"
        }).catch(() => {});
      } else {
        console.warn("[CCAudio] Static audio service is unavailable", { type, text });
      }
    });
  }

  function navigate(type, direction) {
    const collection = state[type];
    if (!collection.filtered.length) return;
    let index = collection.filtered.findIndex((item) => item.id === collection.selectedId);
    if (direction === "random") {
      index = Math.floor(Math.random() * collection.filtered.length);
    } else if (direction === "prev") {
      index = (index - 1 + collection.filtered.length) % collection.filtered.length;
    } else {
      index = (index + 1) % collection.filtered.length;
    }
    selectItem(type, collection.filtered[index].id);
    const active = $(`#${type}LibraryList [data-library-id="${collection.filtered[index].id}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
