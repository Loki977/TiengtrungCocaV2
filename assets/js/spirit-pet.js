(function () {
  "use strict";

  const PET_VIDEO_BASE = "assets/images/Pet";
  const PET2_VIDEO_BASE = "assets/images/Pet2";
  const PET2_AVAILABLE = false; // Bật lại khi assets/images/Pet2/p1.mp4, p2.mp4, p3.mp4 đã tồn tại.
  const SELECTED_PET_STORAGE = "cc_selected_pet";
  const MAX_LEVEL = 10;
  const PET_LEVELS = [
    { level: 1, minXp: 0, nextXp: 100, name: "Mầm hỏa linh", desc: "Hỏa linh mới thức tỉnh. Hoàn thành bài học để tớ ăn EXP và lớn dần nhé!" },
    { level: 2, minXp: 100, nextXp: 250, name: "Hỏa linh nhỏ", desc: "Ánh lửa đã ổn định hơn, quanh tớ bắt đầu có đốm sáng bay nhẹ." },
    { level: 3, minXp: 250, nextXp: 450, name: "Hỏa linh tinh nghịch", desc: "Tớ lắc lư mượt hơn và tạo nhiều hạt sáng hơn khi bạn học đều." },
    { level: 4, minXp: 450, nextXp: 700, name: "Hỏa linh trưởng thành", desc: "Vòng sáng ma pháp đã hiện rõ, chuẩn bị tiến hóa hình thái cấp 5." },
    { level: 5, minXp: 700, nextXp: 1000, name: "Hỏa linh ma pháp", desc: "Đã mở khóa hình thái cấp 5: hào quang mạnh hơn, sao và hạt lửa bay quanh người." },
    { level: 6, minXp: 1000, nextXp: 1400, name: "Hỏa linh huyền quang", desc: "Ma pháp dày hơn, chuyển động bay quanh sáng và nhanh hơn." },
    { level: 7, minXp: 1400, nextXp: 1900, name: "Hỏa linh linh quang", desc: "Tớ tích tụ năng lượng từ EXP, càng học đều hiệu ứng càng rực rỡ." },
    { level: 8, minXp: 1900, nextXp: 2500, name: "Hỏa linh thiên quang", desc: "Vòng phép dưới chân sáng rõ, các ngôi sao bắt đầu xoay quanh tớ." },
    { level: 9, minXp: 2500, nextXp: 3200, name: "Hỏa linh cửu sắc", desc: "Gần đạt tối đa rồi! Hiệu ứng lửa, sao và hào quang đã rất mạnh." },
    { level: 10, minXp: 3200, nextXp: null, name: "Thần hỏa linh", desc: "Cấp tối đa 10. Tớ đã đạt hình thái mạnh nhất, chạm vào để bùng nổ ma pháp!" }
  ];

  const PET_COLORS = {
    1: ["#ff9a1f", "#ffe27a", "#ffd6ef"], 2: ["#ff8517", "#ffdf62", "#ffd166"],
    3: ["#ff6b00", "#ffcd38", "#ffc8e8"], 4: ["#ff4d00", "#ffb703", "#ffb1df"],
    5: ["#ff477e", "#ffd166", "#ff7adf"], 6: ["#b35cff", "#ff9f1c", "#c77dff"],
    7: ["#6f8cff", "#b35cff", "#72ddf7"], 8: ["#00d8ff", "#7b61ff", "#8cfbff"],
    9: ["#80ffdb", "#00bbf9", "#ff8cff"], 10: ["#ff3df5", "#ffe66d", "#ffffff"]
  };
  const PET2_COLORS = {
    1: ["#49b883", "#bdf4cf", "#55d9b3"], 2: ["#43b77d", "#a8f0c2", "#57d6a9"],
    3: ["#36ad70", "#9aeab7", "#59cfa4"], 4: ["#2ca467", "#8ce3aa", "#55c896"],
    5: ["#29a96d", "#a6efc5", "#44d5ac"], 6: ["#239e66", "#9fe8bb", "#36cfa6"],
    7: ["#1c9361", "#a7efc1", "#2bc9ae"], 8: ["#19895d", "#b8f5cd", "#3ecfbd"],
    9: ["#157e57", "#c6f8d7", "#55d7c7"], 10: ["#0d704e", "#e4ffed", "#6ee7d8"]
  };
  const PET2_LEVELS = [
    { maxLevel: 4, name: "Mầm Linh Mộc", desc: "Mộc linh mới thức tỉnh, mang theo những hạt sáng xanh dịu nhẹ." },
    { maxLevel: 9, name: "Linh Thụ Hộ Vệ", desc: "Linh khí mộc đang lớn dần, lá và ánh sáng bắt đầu bay quanh tớ." },
    { maxLevel: 10, name: "Cổ Thần Mộc", desc: "Cấp tối đa 10. Linh khí tự nhiên và trận đồ Mộc luôn bảo hộ hành trình học của bạn." }
  ];
  const PET_DISPLAY_CONFIG = {
    pet1: { scale: 1, translateX: 0, translateY: 0 },
    pet2: { scale: 1.08, translateX: 0, translateY: 4 }
  };
  let selectedPet = readSelectedPet();
  let currentSpiritStats = { xp: 0 };
  let selectionRevision = 0;

  function clampLevel(value) {
    return Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(value) || 1)));
  }

  function readSelectedPet() {
    try {
      return localStorage.getItem(SELECTED_PET_STORAGE) === "pet2" ? "pet2" : "pet1";
    } catch {
      return "pet1";
    }
  }

  function getPetDetails(type, level) {
    if (type !== "pet2") return PET_LEVELS[clampLevel(level) - 1];
    return PET2_LEVELS.find((item) => clampLevel(level) <= item.maxLevel) || PET2_LEVELS[PET2_LEVELS.length - 1];
  }

  function colorsForPet(type, level) {
    return (type === "pet2" ? PET2_COLORS : PET_COLORS)[clampLevel(level)] || PET_COLORS[1];
  }

  function getPetLevel(xp) {
    const safeXp = Math.max(0, Number(xp) || 0);
    for (let i = PET_LEVELS.length - 1; i >= 0; i -= 1) {
      if (safeXp >= PET_LEVELS[i].minXp) return PET_LEVELS[i];
    }
    return PET_LEVELS[0];
  }

  function resolvePet(stats = {}) {
    const explicit = stats.petLevel ?? stats.spiritLevel ?? stats.levelPet ?? null;
    if (explicit !== null && explicit !== undefined && explicit !== "") {
      return PET_LEVELS[clampLevel(explicit) - 1];
    }
    return getPetLevel(stats.xp);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("vi-VN");
  }

  function videoForLevel(level, type = selectedPet) {
    const safe = clampLevel(level);
    if (type === "pet2") {
      if (safe >= 10) return { src: `${PET2_VIDEO_BASE}/p3.mp4`, type: "video/mp4" };
      if (safe >= 5) return { src: `${PET2_VIDEO_BASE}/p2.mp4`, type: "video/mp4" };
      return { src: `${PET2_VIDEO_BASE}/p1.mp4`, type: "video/mp4" };
    }
    if (safe >= 10) return { src: `${PET_VIDEO_BASE}/lv10.webp`, type: "image/webp" };
    if (safe >= 5) return { src: `${PET_VIDEO_BASE}/lv5.webp`, type: "image/webp" };
    return { src: `${PET_VIDEO_BASE}/lv1.webp`, type: "image/webp" };
  }

  function setPetVideo(level, type = selectedPet) {
    const mediaEl = document.getElementById("spiritPetVideo");
    if (!mediaEl) return;
    const media = videoForLevel(level, type);
    if (mediaEl.dataset.src === media.src) return;

    mediaEl.classList.add("is-switching");
    mediaEl.dataset.src = media.src;
    mediaEl.alt = `${getPetDetails(type, level).name} đang chuyển động`;
    mediaEl.src = media.src;
  }

  function bindPetMedia() {
    const mediaEl = document.getElementById("spiritPetVideo");
    if (!mediaEl) return;
    const reveal = () => requestAnimationFrame(() => mediaEl.classList.remove("is-switching"));
    mediaEl.addEventListener("load", reveal);
    mediaEl.addEventListener("loadeddata", reveal);
    mediaEl.addEventListener("error", () => {
      mediaEl.classList.remove("is-switching");
      if (selectedPet === "pet2") selectPet("pet1", { persist: true });
    });
    if (mediaEl.complete) reveal();
  }

  function updatePetToggle() {
    const button = document.getElementById("spiritPetSwitch");
    if (!button) return;
    button.hidden = !PET2_AVAILABLE;
    button.disabled = !PET2_AVAILABLE;
    button.setAttribute("aria-label", selectedPet === "pet1" ? "Đổi sang Mộc Linh" : "Đổi sang Hỏa Linh");
    button.title = PET2_AVAILABLE ? "Đổi linh thú" : "Chưa có dữ liệu linh thú thứ hai";
  }

  function persistSelectedPet() {
    try { localStorage.setItem(SELECTED_PET_STORAGE, selectedPet); } catch {}
    const firebase = window.CCFirebase;
    if (firebase?.getCurrentUser?.() && firebase.saveUserData) {
      firebase.saveUserData("profile", { selectedPet }).catch((error) => {
        console.warn("[spirit-pet] Không lưu được lựa chọn linh thú lên Firebase.", error);
      });
    }
  }

  function selectPet(type, { persist = true } = {}) {
    const next = type === "pet2" ? "pet2" : "pet1";
    if (selectedPet === next && document.getElementById("spiritPetCard")?.dataset.pet === next) return;
    selectedPet = next;
    selectionRevision += 1;
    particles = [];
    burstPower = 0;
    if (persist) persistSelectedPet();
    renderSpiritPet(currentSpiritStats);
  }

  async function hydrateSelectedPet() {
    const firebase = window.CCFirebase;
    if (!firebase?.getCurrentUser?.() || !firebase.getUserData) return;
    const revision = selectionRevision;
    try {
      const profile = await firebase.getUserData("profile", {});
      if (revision === selectionRevision && profile?.selectedPet === "pet2") selectPet("pet2", { persist: false });
    } catch (error) {
      console.warn("[spirit-pet] Không đọc được lựa chọn linh thú từ Firebase, dùng lựa chọn cục bộ.", error);
    }
  }

  function triggerBurst(card) {
    if (!card) return;
    card.classList.remove("pet-pop");
    void card.offsetWidth;
    card.classList.add("pet-pop");
    window.dispatchEvent(new CustomEvent("cc:pet-burst", { detail: { level: clampLevel(card.dataset.level) } }));
    window.setTimeout(() => card.classList.remove("pet-pop"), 1250);
  }

  function renderSpiritPet(stats = {}) {
    const card = document.getElementById("spiritPetCard");
    const levelEl = document.getElementById("spiritPetLevel");
    const nameEl = document.getElementById("spiritPetName");
    const xpText = document.getElementById("spiritPetXpText");
    const nextText = document.getElementById("spiritPetNextText");
    const fill = document.getElementById("spiritPetFill");
    const desc = document.getElementById("spiritPetDesc");
    if (!card) return;

    currentSpiritStats = { ...stats };
    const xp = Math.max(0, Number(stats.xp) || 0);
    const pet = resolvePet(stats);
    const details = getPetDetails(selectedPet, pet.level);
    const previousLevel = Number(card.dataset.level || 0);
    const currentInLevel = Math.max(0, xp - pet.minXp);
    const levelTotal = pet.nextXp ? pet.nextXp - pet.minXp : Math.max(1, currentInLevel);
    const percent = pet.nextXp ? Math.min(100, Math.round((currentInLevel / levelTotal) * 100)) : 100;

    card.className = `${card.className.replace(/\bspirit-pet--lv\d+\b|\bspirit-pet-card--pet[12]\b/g, "").trim()} spirit-pet--lv${pet.level} spirit-pet-card--${selectedPet}`.trim();
    card.dataset.level = String(pet.level);
    card.dataset.pet = selectedPet;
    const compactPetView = window.matchMedia?.("(max-width: 520px)").matches;
    const display = { ...PET_DISPLAY_CONFIG[selectedPet] };
    if (selectedPet === "pet2" && compactPetView) {
      display.scale = pet.level >= 10 ? 1.04 : 1.02;
      display.translateY = 2;
    }
    card.style.setProperty("--pet-display-scale", String(display.scale));
    card.style.setProperty("--pet-display-x", `${display.translateX}px`);
    card.style.setProperty("--pet-display-y", `${display.translateY}px`);
    setPetVideo(pet.level, selectedPet);

    if (levelEl) levelEl.textContent = `Lv.${pet.level}`;
    if (nameEl) nameEl.textContent = details.name;
    const icon = document.getElementById("spiritPetIcon");
    if (icon) icon.textContent = selectedPet === "pet2" ? "🌿" : "🔥";
    if (xpText) xpText.textContent = pet.nextXp ? `${formatNumber(currentInLevel)} / ${formatNumber(levelTotal)} EXP` : `${formatNumber(xp)} EXP`;
    if (nextText) nextText.textContent = pet.nextXp ? `Còn ${formatNumber(Math.max(0, pet.nextXp - xp))} EXP` : "Tối đa Lv.10";
    if (fill) fill.style.width = `${percent}%`;
    if (desc) desc.textContent = details.desc;
    card.setAttribute("aria-label", `Linh thú đồng hành ${details.name}`);
    updatePetToggle();

    if ((previousLevel && previousLevel !== pet.level) || Number(stats.lastXp || 0) > 0) triggerBurst(card);
  }

  let rafId = 0;
  let particles = [];
  let burstPower = 0;

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, dpr };
  }

  function makeParticle(width, height, level, burst = false, petType = selectedPet) {
    const colors = colorsForPet(petType, level);
    const angle = Math.random() * Math.PI * 2;
    const orbit = 0.45 + Math.random() * 0.38;
    const speed = burst ? 2.8 + Math.random() * 4.2 : 0.45 + Math.random() * (0.45 + level * 0.06);
    return {
      angle, orbit,
      x: width / 2 + Math.cos(angle) * width * 0.22 * orbit,
      y: height * 0.55 + Math.sin(angle) * height * 0.18 * orbit,
      vx: burst ? Math.cos(angle) * speed : (Math.random() - 0.5) * 0.45,
      vy: burst ? Math.sin(angle) * speed - 1.4 : -speed,
      r: (burst ? 2.6 : 1.5) + Math.random() * (2 + level * 0.35),
      life: burst ? 38 + Math.random() * 22 : 80 + Math.random() * 70,
      maxLife: burst ? 60 : 135,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: petType === "pet2" ? (level >= 10 && Math.random() > 0.72 ? "star" : "leaf") : (level >= 8 && Math.random() > 0.45 ? "star" : (level >= 5 && Math.random() > 0.6 ? "diamond" : "dot")),
      spin: Math.random() * Math.PI * 2,
      petType
    };
  }

  function drawStar(ctx, radius) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? radius * 0.42 : radius;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawLeaf(ctx, radius, color) {
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.58, radius * 1.15, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(239,255,245,.72)";
    ctx.lineWidth = Math.max(.55, radius * .11);
    ctx.beginPath();
    ctx.moveTo(-radius * .42, radius * .5);
    ctx.lineTo(radius * .42, -radius * .5);
    ctx.stroke();
  }

  function drawMagicRing(ctx, cx, cy, rx, ry, color, alpha, t, level) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 + level * 0.11;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14 + level;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, Math.sin(t * 0.9) * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    if (level >= 5) {
      for (let i = 0; i < 6; i += 1) {
        const a = t * 0.75 + i * Math.PI / 3;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        ctx.beginPath();
        ctx.arc(x, y, 2 + level * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawEffects(canvas, ctx, card, now) {
    const { width, height } = resizeCanvas(canvas);
    const level = clampLevel(card.dataset.level);
    const petType = card.dataset.pet === "pet2" ? "pet2" : "pet1";
    const isPet2 = petType === "pet2";
    const colors = colorsForPet(petType, level);
    const t = now / 1000;
    const cx = width / 2;
    const cy = height * 0.50 + Math.sin(t * 2.0) * height * 0.012;
    ctx.clearRect(0, 0, width, height);

    const auraRadius = width * (0.22 + level * 0.015 + burstPower * 0.08);
    const aura = ctx.createRadialGradient(cx, cy, 2, cx, cy, auraRadius);
    aura.addColorStop(0, colors[1] + "AA");
    aura.addColorStop(0.38, colors[0] + "55");
    aura.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    drawMagicRing(ctx, cx, height * 0.78, width * (0.18 + level * 0.012 + burstPower * 0.05), height * 0.055, colors[2], 0.22 + level * 0.035 + burstPower * 0.35, t, level);
    if (level >= 5) drawMagicRing(ctx, cx, height * (isPet2 ? 0.60 : 0.54), width * (0.25 + level * 0.008), height * 0.18, colors[0], 0.12 + level * 0.016, -t, level);
    if (level >= 10) {
      drawMagicRing(ctx, cx, height * 0.50, width * 0.36, height * 0.25, colors[2], 0.45 + burstPower * 0.4, t * 1.4, level);
      if (isPet2) {
        ctx.save();
        ctx.globalAlpha = 0.26 + burstPower * 0.24;
        ctx.strokeStyle = colors[1];
        ctx.shadowColor = colors[2];
        ctx.shadowBlur = 18;
        for (let i = 0; i < 8; i += 1) {
          const angle = t * .55 + i * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * width * .12, height * .72 + Math.sin(angle) * height * .04);
          ctx.lineTo(cx + Math.cos(angle) * width * .34, height * .72 + Math.sin(angle) * height * .18);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    const compact = window.innerWidth <= 520 || Number(navigator.deviceMemory || 8) <= 4;
    const pet2Target = level <= 4 ? 4 + level * 2 : (level < 10 ? 11 + level * 3 : 42);
    const baseTarget = isPet2 ? pet2Target : 12 + level * 5;
    const targetCount = Math.min(96, Math.round((baseTarget + Math.floor(burstPower * 26)) * (compact ? .62 : 1)));
    while (particles.length < targetCount) particles.push(makeParticle(width, height, level, false, petType));

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      if (!p.burst && (p.petType === "pet2" || level >= 5)) {
        p.angle += 0.012 + level * 0.0018;
        p.x += Math.cos(p.angle) * 0.38 + p.vx;
        p.y += Math.sin(p.angle) * 0.18 + p.vy * 0.55;
      } else {
        p.x += p.vx;
        p.y += p.vy;
      }
      p.life -= 1;
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 9 + level * 1.4 + burstPower * 14;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin + t * (1.1 + level * 0.04));
      if (p.shape === "star") drawStar(ctx, p.r * 1.25);
      else if (p.shape === "leaf") drawLeaf(ctx, p.r * 1.4, p.color);
      else if (p.shape === "diamond") ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
      else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      if (p.life <= 0 || p.y < -30 || p.x < -40 || p.x > width + 40) particles.splice(i, 1);
    }

    burstPower *= 0.91;
  }

  function startSpiritPetLoop() {
    const card = document.getElementById("spiritPetCard");
    const video = document.getElementById("spiritPetVideo");
    const canvas = document.getElementById("spiritPetCanvas");
    const ctx = canvas?.getContext?.("2d");
    if (!card || !video) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();

    function tick(now) {
      const t = (now - start) / 1000;
      const level = clampLevel(card.dataset.level);
      const breathe = 1 + Math.sin(t * Math.PI * (1.05 + level * 0.025)) * (0.018 + level * 0.0025);
      const floatY = Math.sin(t * Math.PI * (0.82 + level * 0.015)) * -(4 + level * 0.48);
      const wobble = Math.sin(t * Math.PI * (0.78 + level * 0.025)) * (0.6 + level * 0.12);
      const glow = 1 + Math.sin(t * Math.PI * (1.35 + level * 0.035)) * (0.08 + level * 0.012) + level * 0.018;
      card.style.setProperty("--pet-breathe", breathe.toFixed(4));
      card.style.setProperty("--pet-scale", breathe.toFixed(4));
      card.style.setProperty("--pet-float", `${floatY.toFixed(2)}px`);
      card.style.setProperty("--pet-wobble", `${wobble.toFixed(2)}deg`);
      card.style.setProperty("--pet-glow", Math.max(0.9, glow).toFixed(4));
      if (!reduced && canvas && ctx) drawEffects(canvas, ctx, card, now);
      rafId = requestAnimationFrame(tick);
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  window.addEventListener("cc:pet-burst", (event) => {
    const canvas = document.getElementById("spiritPetCanvas");
    if (!canvas) return;
    const level = clampLevel(event.detail?.level);
    const { width, height } = resizeCanvas(canvas);
    burstPower = 1;
    for (let i = 0; i < 28 + level * 5; i += 1) {
      const p = makeParticle(width, height, level, true, selectedPet);
      p.burst = true;
      particles.push(p);
    }
  });

  window.CCSpiritPet = { levels: PET_LEVELS, maxLevel: MAX_LEVEL, getPetLevel, render: renderSpiritPet, startLoop: startSpiritPetLoop, triggerBurst, selectPet, getSelectedPet: () => selectedPet, displayConfig: PET_DISPLAY_CONFIG };
  window.renderSpiritPet = renderSpiritPet;
  window.addEventListener("cc:user-stats", (event) => renderSpiritPet(event.detail?.stats || {}));
  window.addEventListener("cc:auth-ready", hydrateSelectedPet);

  document.addEventListener("DOMContentLoaded", () => {
    bindPetMedia();
    const requested = Number(new URLSearchParams(location.search).get("petLv"));
    if (requested) renderSpiritPet({ petLevel: requested, xp: PET_LEVELS[clampLevel(requested) - 1].minXp });
    else renderSpiritPet({ xp: 0 });
    startSpiritPetLoop();
    document.getElementById("spiritPetStage")?.addEventListener("click", () => triggerBurst(document.getElementById("spiritPetCard")));
    document.getElementById("spiritPetSwitch")?.addEventListener("click", () => selectPet(selectedPet === "pet1" ? "pet2" : "pet1"));
    hydrateSelectedPet();
  });
})();
