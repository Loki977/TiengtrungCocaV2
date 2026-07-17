const VIP_STYLE_ID = "cc-vip-user-styles";
const VIP_SIZE_CLASSES = [
  "cc-user-avatar--header",
  "cc-user-avatar--sm",
  "cc-user-avatar--md",
  "cc-user-avatar--xl"
];

function ensureVipStyles() {
  if (document.getElementById(VIP_STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = VIP_STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("../css/vip-user.css", import.meta.url).href;
  document.head.appendChild(link);
}

function asVipData(source = {}) {
  const value = source && typeof source === "object" ? source : {};
  const publicData = value.public && typeof value.public === "object" ? value.public : {};
  const stats = value.stats && typeof value.stats === "object" ? value.stats : {};
  return { ...value, ...publicData, ...stats };
}

function normalizeFlag(value) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "off", "no", "inactive", "expired"].includes(normalized)) return false;
    if (["true", "1", "on", "yes", "active", "vip", "premium"].includes(normalized)) return true;
  }
  return Boolean(value);
}

function roleIncludesVip(role) {
  const roles = Array.isArray(role) ? role : [role];
  return roles.some((item) => ["vip", "premium"].includes(String(item || "").trim().toLowerCase()));
}

function readVipFlag(data) {
  if (data.isVip !== undefined) return normalizeFlag(data.isVip);
  if (data.vip !== undefined) return normalizeFlag(data.vip);
  return roleIncludesVip(data.role ?? data.roles);
}

function readVipExpiry(data) {
  for (const key of ["vipUntil", "vipExpiresAt", "vipExpiry", "vip_expires_at"]) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
      return { field: key, value: data[key] };
    }
  }
  return { field: null, value: null };
}

function parseVipDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  const seconds = Number(value?.seconds ?? value?._seconds);
  if (Number.isFinite(seconds)) {
    const milliseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0) / 1e6;
    const date = new Date(seconds * 1000 + milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "number") {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return parseVipDate(Number(value.trim()));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getVipState(source = {}, now = Date.now()) {
  const data = asVipData(source);
  const enabled = readVipFlag(data);
  const expiry = readVipExpiry(data);
  if (!enabled) return { active: false, enabled: false, expiryField: expiry.field, expiresAt: null };
  if (!expiry.value) return { active: true, enabled: true, expiryField: null, expiresAt: null };

  const expiryDate = parseVipDate(expiry.value);
  if (!expiryDate) {
    return { active: false, enabled: true, expiryField: expiry.field, expiresAt: null, invalidExpiry: true };
  }

  return {
    active: expiryDate.getTime() > Number(now),
    enabled: true,
    expiryField: expiry.field,
    expiresAt: expiryDate.toISOString()
  };
}

export function isVipActive(source = {}, now = Date.now()) {
  return getVipState(source, now).active;
}

export function applyVipState(element, source = {}) {
  if (!element) return false;
  ensureVipStyles();
  const state = getVipState(source);
  element.classList.add("cc-user-avatar");
  element.classList.toggle("is-vip", state.active);
  element.dataset.vipActive = state.active ? "true" : "false";
  if (state.expiresAt) element.dataset.vipExpiresAt = state.expiresAt;
  else delete element.dataset.vipExpiresAt;
  return state.active;
}

export function renderVipAvatar(container, user = {}, source = {}, options = {}) {
  if (!container) return false;
  ensureVipStyles();
  VIP_SIZE_CLASSES.forEach((className) => container.classList.remove(className));
  container.classList.add("cc-user-avatar", `cc-user-avatar--${options.size || "header"}`);
  container.replaceChildren();

  const label = user.displayName || user.email || "Học viên";
  if (user.photoURL) {
    const image = document.createElement("img");
    image.className = "cc-user-avatar__image";
    image.src = user.photoURL;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    container.appendChild(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "cc-user-avatar__fallback";
    fallback.textContent = options.fallback !== undefined ? String(options.fallback) : "👤";
    container.appendChild(fallback);
  }

  container.setAttribute("role", "img");
  container.setAttribute("aria-label", `Ảnh đại diện của ${label}`);
  return applyVipState(container, source);
}

export function syncVipCard(card, source = {}) {
  if (!card) return false;
  ensureVipStyles();
  const state = getVipState(source);
  card.classList.add("cc-vip-card");
  card.classList.toggle("is-vip", state.active);

  let badge = card.querySelector("[data-cc-vip-badge]");
  if (state.active && !badge) {
    badge = document.createElement("span");
    badge.className = "cc-vip-badge";
    badge.dataset.ccVipBadge = "";
    badge.textContent = "VIP";
    badge.setAttribute("aria-label", "Tài khoản VIP");
    card.appendChild(badge);
  } else if (!state.active) {
    badge?.remove();
  }

  return state.active;
}

ensureVipStyles();

window.CCVip = Object.freeze({
  getState: getVipState,
  isActive: isVipActive,
  applyAvatar: applyVipState,
  renderAvatar: renderVipAvatar,
  syncCard: syncVipCard
});
