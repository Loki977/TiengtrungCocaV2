(() => {
  "use strict";

  const DATA_FILES = {
    grammar: "assets/data/tang-thu-cac/grammar.json",
    idioms: "assets/data/tang-thu-cac/idioms.json",
  };

  const state = {
    activeTab: "",
    grammar: createCollectionState(),
    idioms: createCollectionState(),
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

    const requested = location.hash.replace("#", "").toLowerCase();
    if (["dictionary", "grammar", "idioms"].includes(requested)) activateTab(requested, false);
  }

  function bindTabs() {
    const tabs = $$("[data-archive-tab]");
    tabs.forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.archiveTab));
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
        activateTab(tabs[nextIndex].dataset.archiveTab);
      });
    });
    window.addEventListener("hashchange", () => {
      const requested = location.hash.replace("#", "").toLowerCase();
      if (["dictionary", "grammar", "idioms"].includes(requested)) activateTab(requested, false);
    });
  }

  async function activateTab(tab, updateHash = true) {
    state.activeTab = tab;
    const masthead = $(".archive-masthead");
    const tabList = $(".archive-tabs");
    masthead?.classList.add("is-browsing");
    tabList?.classList.add("is-compact");
    $$("[data-archive-tab]").forEach((button) => {
      const active = button.dataset.archiveTab === tab;
      button.classList.toggle("is-active", active);
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
    if (tab === "grammar") await ensureLoaded("grammar");
    if (tab === "idioms") await ensureLoaded("idioms");
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
      collection.selectedId = requestedId || localStorage.getItem(`ttc_${type}_selected`) || collection.items[0]?.id || "";
      renderAlphabet(type, payload.meta?.initials || []);
      applyFilters(type);
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
        applyFilters(type);
      }, 120);
    });
    clear.addEventListener("click", () => {
      input.value = "";
      state[type].query = "";
      clear.classList.remove("is-visible");
      input.focus();
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

      const matchesCategory = collection.category === "all" || item.category === collection.category;
      if (!matchesCategory) return false;
      if (!query) return true;
      const searchable = normalize([
        item.hanzi, item.pinyin, item.meaning, item.equivalentVi, item.category, item.tone,
        item.example?.zh, item.example?.pinyin, item.example?.vi,
      ].join(" "));
      return searchable.includes(query);
    });

    if (!collection.filtered.some((item) => item.id === collection.selectedId)) {
      collection.selectedId = collection.filtered[0]?.id || "";
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
    if (listCount) listCount.textContent = `${collection.filtered.length.toLocaleString("vi-VN")} mục`;
    if (!list) return;

    if (!collection.filtered.length) {
      list.innerHTML = '<div class="library-empty-list">Không tìm thấy nội dung phù hợp với bộ lọc.</div>';
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

  function selectItem(type, id) {
    state[type].selectedId = id;
    localStorage.setItem(`ttc_${type}_selected`, id);
    $$(`#${type}LibraryList [data-library-id]`).forEach((button) => button.classList.toggle("is-active", button.dataset.libraryId === id));
    renderDetail(type);
    if (window.innerWidth <= 900) $(`#${type}LibraryDetail`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderDetail(type) {
    const collection = state[type];
    const detail = $(`#${type}LibraryDetail`);
    if (!detail) return;
    const item = collection.filtered.find((entry) => entry.id === collection.selectedId);
    if (!item) {
      detail.innerHTML = '<div class="library-detail-empty"><div><div class="library-detail-empty__icon">📚</div><h3>Chưa có nội dung được chọn</h3><p>Hãy thay đổi từ khóa hoặc bộ lọc.</p></div></div>';
      return;
    }

    detail.innerHTML = type === "grammar" ? grammarDetailTemplate(item) : idiomDetailTemplate(item);
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
          mode: type === "idioms" ? "vocabulary" : "sentence",
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
