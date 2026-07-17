const VIP_STYLE_ID = "cc-vip-user-styles";
const VIP_MODAL_ID = "ccVipPurchaseModal";
const VIP_SIZE_CLASSES = [
  "cc-user-avatar--header",
  "cc-user-avatar--sm",
  "cc-user-avatar--md",
  "cc-user-avatar--xl"
];

export const VIP_PLANS = Object.freeze([
  { id: "30d", label: "1 tháng", amount: 69000, durationDays: 30, icon: "✦" },
  { id: "180d", label: "6 tháng", amount: 299000, durationDays: 180, icon: "◆" },
  { id: "365d", label: "1 năm", amount: 389000, durationDays: 365, icon: "♛", featured: true },
  { id: "lifetime", label: "Vĩnh viễn", amount: 459000, durationDays: null, icon: "∞", best: true }
]);

const PAYMENT_INFO = Object.freeze({
  bank: "MB Bank",
  owner: "NGO QUANG THANH",
  account: "06287599896666",
  qrUrl: "assets/images/donate/qr.png"
});

function ensureVipStyles() {
  if (document.getElementById(VIP_STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = VIP_STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("../css/vip-user.css", import.meta.url).href;
  document.head.appendChild(link);
}

function canonicalVipData(source = {}) {
  const value = source && typeof source === "object" ? source : {};
  // Khi Admin truyền cả public document và stats, private/stats là nguồn quyền duy nhất.
  if (value.stats && typeof value.stats === "object" && !Array.isArray(value.stats)) {
    return value.stats;
  }
  return value;
}

export function parseVipDate(value) {
  if (value === null || value === undefined || value === "") return null;
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
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getVipState(source = {}, now = Date.now()) {
  const data = canonicalVipData(source);
  const enabled = data.isVip === true;
  const hasExpiry = Object.prototype.hasOwnProperty.call(data, "vipUntil");
  const vipPlan = typeof data.vipPlan === "string" ? data.vipPlan : null;

  if (!enabled) {
    return { active: false, enabled: false, permanent: false, expired: false, expiresAt: null, daysRemaining: 0, vipPlan };
  }

  // vipUntil = null là VIP vĩnh viễn. Trường bị thiếu không được coi là vĩnh viễn.
  if (hasExpiry && data.vipUntil === null) {
    return { active: true, enabled: true, permanent: true, expired: false, expiresAt: null, daysRemaining: null, vipPlan };
  }

  if (!hasExpiry) {
    return { active: false, enabled: true, permanent: false, expired: false, invalidExpiry: true, expiresAt: null, daysRemaining: 0, vipPlan };
  }

  const expiryDate = parseVipDate(data.vipUntil);
  if (!expiryDate) {
    return { active: false, enabled: true, permanent: false, expired: false, invalidExpiry: true, expiresAt: null, daysRemaining: 0, vipPlan };
  }

  const remainingMs = expiryDate.getTime() - Number(now);
  const active = remainingMs > 0;
  return {
    active,
    enabled: true,
    permanent: false,
    expired: !active,
    expiresAt: expiryDate.toISOString(),
    expiresDate: expiryDate,
    daysRemaining: active ? Math.max(1, Math.ceil(remainingMs / 86400000)) : 0,
    vipPlan
  };
}

export function isVipActive(source = {}, now = Date.now()) {
  return getVipState(source, now).active;
}

export function getVipStatusLabel(source = {}, now = Date.now()) {
  const state = getVipState(source, now);
  if (!state.enabled) return "Không VIP";
  if (state.permanent) return "VIP vĩnh viễn";
  if (state.expired || state.invalidExpiry) return "Đã hết hạn";
  return `Còn ${state.daysRemaining} ngày`;
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

function getAvatarFallback(user = {}, explicitFallback) {
  if (explicitFallback !== undefined && explicitFallback !== null && String(explicitFallback).trim()) {
    return String(explicitFallback).trim();
  }
  const source = String(user.displayName || user.email || "").trim();
  const first = Array.from(source)[0];
  return first ? first.toLocaleUpperCase("vi-VN") : "👤";
}

function appendAvatarFallback(container, fallbackText) {
  const fallback = document.createElement("span");
  fallback.className = "cc-user-avatar__fallback";
  fallback.textContent = fallbackText;
  container.replaceChildren(fallback);
}

export function renderVipAvatar(container, user = {}, source = {}, options = {}) {
  if (!container) return false;
  ensureVipStyles();
  VIP_SIZE_CLASSES.forEach((className) => container.classList.remove(className));
  container.classList.add("cc-user-avatar", `cc-user-avatar--${options.size || "header"}`);
  container.replaceChildren();

  const label = user.displayName || user.email || "Học viên";
  const fallbackText = getAvatarFallback(user, options.fallback);
  const photoURL = typeof user.photoURL === "string" ? user.photoURL.trim() : "";

  if (photoURL) {
    const image = document.createElement("img");
    image.className = "cc-user-avatar__image";
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => appendAvatarFallback(container, fallbackText), { once: true });
    image.src = photoURL;
    container.appendChild(image);
  } else {
    appendAvatarFallback(container, fallbackText);
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

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

function makeTransferContent(plan, user = {}) {
  const identity = String(user.email || user.uid || "USER")
    .replace(/\s+/g, "")
    .slice(0, 40);
  return `VIP ${plan.id.toUpperCase()} ${identity}`;
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    window.CCFirebase?.showToast?.(successMessage);
  } catch (_) {
    window.prompt("Sao chép nội dung:", text);
  }
}

function ensurePurchaseModal() {
  ensureVipStyles();
  let modal = document.getElementById(VIP_MODAL_ID);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = VIP_MODAL_ID;
  modal.className = "cc-vip-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="cc-vip-modal__backdrop" data-vip-close></div>
    <section class="cc-vip-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="ccVipModalTitle">
      <div class="cc-vip-modal__aurora" aria-hidden="true"></div>
      <div class="cc-vip-modal__stars" aria-hidden="true">✦ · ✧ · ✦ · ✧ · ✦</div>
      <button class="cc-vip-modal__close" type="button" data-vip-close aria-label="Đóng">×</button>
      <div class="cc-vip-modal__eyebrow">👑 NÂNG CẤP VIP</div>
      <h2 id="ccVipModalTitle">Mở toàn bộ nội dung đặc quyền</h2>
      <p class="cc-vip-modal__reason" data-vip-reason>Bài học hoặc tính năng này dành cho thành viên VIP.</p>
      <div class="cc-vip-plan-grid" data-vip-plans></div>
      <div class="cc-vip-payment" data-vip-payment hidden>
        <img src="${PAYMENT_INFO.qrUrl}" alt="QR chuyển khoản MB Bank" data-vip-qr>
        <div class="cc-vip-payment__details">
          <h3 data-vip-selected-title></h3>
          <p><span>Số tiền</span><strong data-vip-amount></strong></p>
          <p><span>Ngân hàng</span><strong>${PAYMENT_INFO.bank}</strong></p>
          <p><span>Chủ tài khoản</span><strong>${PAYMENT_INFO.owner}</strong></p>
          <p><span>Số tài khoản</span><strong>${PAYMENT_INFO.account}</strong></p>
          <p><span>Nội dung</span><strong data-vip-content></strong></p>
          <div class="cc-vip-payment__actions">
            <button type="button" data-copy-account>Sao chép STK</button>
            <button type="button" data-copy-content>Sao chép nội dung</button>
          </div>
          <small>Sau khi chuyển khoản, Super Admin sẽ kiểm tra và kích hoạt đúng gói trên tài khoản của bạn.</small>
        </div>
      </div>
      <div class="cc-vip-modal__notice" data-vip-auth-notice hidden>Hãy đăng nhập đúng tài khoản cần kích hoạt VIP trước khi chuyển khoản.</div>
      <div class="cc-vip-modal__footer">
        <a href="profile.html" data-vip-login>Đăng nhập / mở hồ sơ</a>
        <button type="button" data-vip-back hidden>Quay lại danh sách bài</button>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const plans = modal.querySelector("[data-vip-plans]");
  plans.replaceChildren(...VIP_PLANS.map((plan) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cc-vip-plan";
    button.dataset.vipPlan = plan.id;
    button.classList.toggle("is-featured", plan.featured === true);
    button.classList.toggle("is-best", plan.best === true);
    button.innerHTML = `<i aria-hidden="true">${plan.icon || "✦"}</i><strong>${plan.label}</strong><span>${formatMoney(plan.amount)}</span>${plan.best ? "<em>Giá tốt nhất</em>" : plan.featured ? "<em>Phổ biến</em>" : ""}`;
    button.addEventListener("click", () => selectPurchasePlan(modal, plan));
    return button;
  }));

  modal.querySelectorAll("[data-vip-close]").forEach((button) => button.addEventListener("click", closeVipPurchaseModal));
  modal.querySelector("[data-copy-account]")?.addEventListener("click", () => copyText(PAYMENT_INFO.account, "Đã sao chép số tài khoản."));
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeVipPurchaseModal();
  });
  return modal;
}

function selectPurchasePlan(modal, plan) {
  modal.querySelectorAll(".cc-vip-plan").forEach((button) => button.classList.toggle("is-selected", button.dataset.vipPlan === plan.id));
  const user = modal.__vipUser || window.CCFirebase?.getCurrentUser?.() || null;
  const transferContent = makeTransferContent(plan, user || {});
  const payment = modal.querySelector("[data-vip-payment]");
  payment.hidden = false;
  payment.classList.remove("is-revealing");
  void payment.offsetWidth;
  payment.classList.add("is-revealing");
  modal.querySelector("[data-vip-selected-title]").textContent = `Gói ${plan.label}`;
  modal.querySelector("[data-vip-amount]").textContent = formatMoney(plan.amount);
  modal.querySelector("[data-vip-content]").textContent = transferContent;
  modal.querySelector("[data-copy-content]").onclick = () => copyText(transferContent, "Đã sao chép nội dung chuyển khoản.");
  payment.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function openVipPurchaseModal(options = {}) {
  const modal = ensurePurchaseModal();
  const user = options.user || window.CCFirebase?.getCurrentUser?.() || null;
  modal.__vipUser = user;
  modal.querySelector("[data-vip-reason]").textContent = options.reason || "Bài học hoặc tính năng này dành cho thành viên VIP.";
  modal.querySelector("[data-vip-auth-notice]").hidden = Boolean(user);
  modal.querySelector("[data-vip-login]").textContent = user ? "Mở hồ sơ tài khoản" : "Đăng nhập / đăng ký";

  const backButton = modal.querySelector("[data-vip-back]");
  const safeBackUrl = typeof options.backUrl === "string" ? options.backUrl : "";
  backButton.hidden = !safeBackUrl;
  backButton.onclick = safeBackUrl ? () => window.location.assign(safeBackUrl) : null;

  modal.querySelectorAll(".cc-vip-plan").forEach((button) => button.classList.remove("is-selected"));
  modal.querySelector("[data-vip-payment]").hidden = true;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("cc-vip-modal-open");
  setTimeout(() => modal.querySelector(".cc-vip-plan")?.focus(), 0);
  return modal;
}

export function closeVipPurchaseModal() {
  const modal = document.getElementById(VIP_MODAL_ID);
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cc-vip-modal-open");
}

ensureVipStyles();

window.CCVip = Object.freeze({
  plans: VIP_PLANS,
  payment: PAYMENT_INFO,
  getState: getVipState,
  getStatusLabel: getVipStatusLabel,
  isActive: isVipActive,
  applyAvatar: applyVipState,
  renderAvatar: renderVipAvatar,
  syncCard: syncVipCard,
  openPurchase: openVipPurchaseModal,
  closePurchase: closeVipPurchaseModal
});
