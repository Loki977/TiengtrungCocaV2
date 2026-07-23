const ROLE_DEFINITIONS = Object.freeze({
  subject: { symbol: "S", vi: "Chủ ngữ", zh: "主语" },
  predicate: { symbol: "V", vi: "Vị ngữ", zh: "谓语" },
  object: { symbol: "O", vi: "Tân ngữ", zh: "宾语" },
  adverbial: { symbol: "A", vi: "Trạng ngữ", zh: "状语" },
  time: { symbol: "A", vi: "Thời gian", zh: "时间状语" },
  location: { symbol: "A", vi: "Địa điểm", zh: "地点状语" },
  purpose: { symbol: "A", vi: "Mục đích", zh: "目的状语" },
  reason: { symbol: "A", vi: "Nguyên nhân", zh: "原因状语" },
  condition: { symbol: "A", vi: "Điều kiện", zh: "条件状语" },
  complement: { symbol: "C", vi: "Bổ ngữ", zh: "补语" },
  attribute: { symbol: "Att", vi: "Định ngữ", zh: "定语" },
  head: { symbol: "H", vi: "Trung tâm ngữ", zh: "中心语" },
  "subject-head": { symbol: "S/H", vi: "Trung tâm chủ ngữ", zh: "主语中心语" },
  "object-head": { symbol: "O/H", vi: "Trung tâm tân ngữ", zh: "宾语中心语" },
  pp: { symbol: "PP", vi: "Cụm giới từ", zh: "介词短语" },
  ba: { symbol: "Ba", vi: "Cấu trúc 把", zh: "把字句标记" },
  bei: { symbol: "Bei", vi: "Cấu trúc 被", zh: "被字句标记" },
  conjunction: { symbol: "", vi: "Liên từ", zh: "连词" },
  particle: { symbol: "", vi: "Trợ từ", zh: "助词" },
  verb: { symbol: "", vi: "Động từ", zh: "动词" },
  adverb: { symbol: "", vi: "Phó từ", zh: "副词" }
});

const LEGEND_KEYS = ["subject", "predicate", "object", "adverbial", "complement", "attribute", "head"];
const LEGEND_EXTRA_KEYS = ["conjunction", "particle", "verb", "adverb"];

function safeRole(value) {
  const key = String(value || "predicate").toLowerCase();
  return Object.hasOwn(ROLE_DEFINITIONS, key) ? key : "predicate";
}

export class SentenceStructure {
  constructor({ level = "hsk1" } = {}) {
    this.level = Number(String(level).match(/\d+/)?.[0] || 1);
  }

  getLabel(key) {
    const definition = ROLE_DEFINITIONS[safeRole(key)];
    return this.level >= 4 ? definition.zh : definition.vi;
  }

  render(container, components, { animate = false, showSymbols = true } = {}) {
    if (!container) return;
    container.replaceChildren();

    const structure = document.createElement("span");
    structure.className = `sentence-structure${animate ? " is-revealing" : ""}`;
    structure.setAttribute("aria-label", "Cấu trúc câu");

    for (const component of Array.isArray(components) ? components : []) {
      const key = safeRole(component?.key);
      const definition = ROLE_DEFINITIONS[key];
      const part = document.createElement("span");
      part.className = `sentence-structure__part sentence-structure__part--${key}`;
      part.title = `${definition.symbol ? `${definition.symbol} · ` : ""}${this.getLabel(key)}`;

      const text = document.createElement("span");
      text.className = "sentence-structure__text";
      text.textContent = String(component?.text || "");

      if (showSymbols) {
        const symbol = document.createElement("span");
        symbol.className = `sentence-structure__symbol${definition.symbol ? "" : " is-long-label"}`;
        symbol.textContent = definition.symbol || this.getLabel(key);
        part.append(symbol);
      }
      part.append(text);
      structure.append(part);
    }

    container.append(structure);
  }

  renderLegend(container) {
    if (!container) return;
    container.replaceChildren();
    for (const key of LEGEND_KEYS) {
      const definition = ROLE_DEFINITIONS[key];
      const item = document.createElement("span");
      item.className = `sentence-legend__item sentence-structure__part--${key}`;
      const symbol = document.createElement("strong");
      symbol.textContent = definition.symbol;
      const meaning = document.createElement("span");
      meaning.textContent = definition.vi;
      item.append(symbol, meaning);
      container.append(item);
    }
    for (const key of LEGEND_EXTRA_KEYS) {
      const item = document.createElement("span");
      item.className = `sentence-legend__item sentence-legend__item--extra sentence-structure__part--${key}`;
      const label = document.createElement("strong");
      label.textContent = this.getLabel(key);
      item.append(label);
      container.append(item);
    }
  }
}
