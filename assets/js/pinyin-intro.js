(() => {
  "use strict";

  const FOUNDATION_ID = "hsk1-pinyin-intro";
  const LOCAL_PROGRESS_KEY = "cc_local_progress";
  const questions = [...document.querySelectorAll(".practice-question")];
  const correctQuestions = new Set();
  const audioManifest = new Map();
  let audioRequest = 0;

  const wrongHints = {
    "tone-audio": "Âm mǎ hạ thấp rồi đi lên, nên đây là thanh 3.",
    blend: "Giữ nguyên thanh 1 trên a: m + ā = mā.",
    meaning: "mǎ với thanh 3 và chữ 马 có nghĩa là ngựa.",
    curve: "Đường từ thấp đi lên là đường của thanh 2.",
    mark: "Có a thì ưu tiên đặt dấu trên a: hǎo.",
    umlaut: "Âm ü giữ môi tròn nhưng lưỡi gần vị trí phát âm i."
  };

  function getAudioService() {
    return window.CCAudio || window.CCSpeech || null;
  }

  function getAudioSource(entry) {
    if (!entry?.path) return "";
    const version = String(entry.sha256 || "").slice(0, 12);
    return version ? `${entry.path}?v=${version}` : entry.path;
  }

  function stopAudio() {
    audioRequest += 1;
    getAudioService()?.stop?.();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    document.querySelectorAll(".is-speaking").forEach((button) => {
      button.classList.remove("is-speaking");
      button.removeAttribute("aria-busy");
    });
  }

  async function playAudio(audioId, button = null) {
    const entry = audioManifest.get(audioId);
    if (!entry || entry.qcStatus !== "automated-pass") {
      button?.setAttribute("data-audio-error", "true");
      window.CCFirebase?.showToast?.("Audio này chưa vượt qua bước kiểm tra chất lượng.", "warning");
      return;
    }
    stopAudio();
    const request = audioRequest;
    button?.classList.add("is-speaking");
    button?.setAttribute("aria-busy", "true");
    try {
      const service = getAudioService();
      if (service?.speak) {
        await service.speak({
          text: entry.input,
          audioSrc: getAudioSource(entry),
          mode: "vocabulary",
          rate: 1,
          volume: 1,
          lang: entry.locale || "zh-CN",
          allowBrowserFallback: false,
          allowDirectSource: true
        });
      }
    } catch (error) {
      console.warn("Static Pinyin audio failed", audioId, error);
      window.CCFirebase?.showToast?.("Không thể phát file âm thanh này.", "warning");
    } finally {
      if (request === audioRequest) {
        button?.classList.remove("is-speaking");
        button?.removeAttribute("aria-busy");
      }
    }
  }

  function renderSoundGrid(containerId, category) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const entries = [...audioManifest.values()].filter((entry) => entry.category === category && entry.qcStatus === "automated-pass");
    container.innerHTML = entries.map((entry) => `
      <button type="button" class="pinyin-unit" data-audio-id="${entry.id}" aria-label="Nghe ${entry.label}, âm tiết mẫu ${entry.pinyin}">
        <span class="pinyin-unit__letter">${entry.label}</span>
        <span class="pinyin-unit__sample"><b>${entry.pinyin}</b><small>${entry.input}</small></span>
        <span class="pinyin-unit__speaker" aria-hidden="true">🔊</span>
      </button>`).join("") || '<p class="audio-manifest-error">Chưa có audio đã kiểm tra cho nhóm này.</p>';
  }

  async function loadAudioManifest() {
    const response = await fetch("assets/audio/pinyin/manifest.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Không tải được manifest audio (${response.status}).`);
    const manifest = await response.json();
    (manifest.items || []).forEach((entry) => audioManifest.set(entry.id, entry));
    renderSoundGrid("initialGrid", "initials");
    renderSoundGrid("finalGrid", "finals");
    const preloadIds = ["tone-ma-1", "tone-ma-2", "tone-ma-3", "tone-ma-4", "tone-ma-neutral", "initial-b", "initial-p", "initial-m", "initial-f"];
    getAudioService()?.preload?.(preloadIds.map((id) => getAudioSource(audioManifest.get(id))).filter(Boolean));
  }

  function bindAudio() {
    document.querySelectorAll("button[data-audio-id]").forEach((button) => {
      if (button.dataset.audioBound === "true") return;
      const entry = audioManifest.get(button.dataset.audioId);
      if (!entry || entry.qcStatus !== "automated-pass") {
        button.disabled = true;
        button.title = "Audio chưa vượt qua kiểm tra chất lượng";
        return;
      }
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.removeAttribute("title");
      button.dataset.audioBound = "true";
      if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", `Nghe phát âm ${entry.pinyin || entry.label}`);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        playAudio(button.dataset.audioId, button);
      });
    });
  }

  function setAudioLoading(isLoading) {
    document.querySelectorAll("button[data-audio-id]").forEach((button) => {
      if (button.dataset.audioBound !== "true") button.disabled = isLoading;
      if (isLoading) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
    });
    ["initialGrid", "finalGrid"].forEach((id) => document.getElementById(id)?.setAttribute("aria-busy", String(isLoading)));
  }

  function setPracticeScore() {
    document.getElementById("practiceScore").textContent = `${correctQuestions.size}/${questions.length} câu đúng`;
    document.getElementById("completeFoundation").disabled = correctQuestions.size !== questions.length;
  }

  function answerQuestion(question, button) {
    if (question.classList.contains("is-correct")) return;
    const isCorrect = button.dataset.choice === question.dataset.answer;
    const feedback = question.querySelector(".practice-feedback");
    question.querySelectorAll("[data-choice]").forEach((choice) => choice.classList.remove("is-wrong"));
    if (!isCorrect) {
      button.classList.add("is-wrong");
      feedback.textContent = wrongHints[question.dataset.question] || "Hãy nghe lại và thử thêm một lần nhé.";
      return;
    }

    button.classList.add("is-right");
    question.classList.add("is-correct");
    question.querySelectorAll("[data-choice]").forEach((choice) => { choice.disabled = true; });
    feedback.textContent = "Chính xác! Nghe lại đáp án một lần nhé.";
    correctQuestions.add(question.dataset.question);
    setPracticeScore();
    playAudio(question.dataset.audioAnswer, button);
  }

  function resetPractice() {
    stopAudio();
    correctQuestions.clear();
    questions.forEach((question) => {
      question.classList.remove("is-correct");
      question.querySelector(".practice-feedback").textContent = "";
      question.querySelectorAll("[data-choice]").forEach((button) => {
        button.disabled = false;
        button.classList.remove("is-right", "is-wrong", "is-speaking");
      });
    });
    setPracticeScore();
  }

  function bindPractice() {
    questions.forEach((question) => {
      question.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => answerQuestion(question, button)));
    });
    document.getElementById("resetPractice")?.addEventListener("click", resetPractice);
  }

  function readLocalProgress() {
    try { return JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "{}"); }
    catch (_error) { return {}; }
  }

  function writeLocalCompletion() {
    try {
      const current = readLocalProgress();
      const completedLessonIds = { ...(current.completedLessonIds || {}), [FOUNDATION_ID]: true };
      localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify({
        ...current,
        completedLessons: Object.keys(completedLessonIds).length,
        completedLessonIds
      }));
    } catch (error) {
      console.warn("[Pinyin intro] Trình duyệt không cho phép lưu tiến độ cục bộ.", error);
    }
  }

  async function waitForFirebase(timeoutMs = 3500) {
    if (window.CCFirebase) return window.CCFirebase;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(window.CCFirebase || null), timeoutMs);
      window.addEventListener("firebase-ready", () => { clearTimeout(timer); resolve(window.CCFirebase || null); }, { once: true });
    });
  }

  async function saveCompletion() {
    writeLocalCompletion();
    const firebase = await waitForFirebase();
    try {
      await firebase?.authReady;
      if (firebase?.getCurrentUser?.() && firebase?.saveUserStats) {
        const current = firebase.getCurrentStats?.() || {};
        const completedLessonIds = { ...(current.completedLessonIds || {}), [FOUNDATION_ID]: true };
        await firebase.saveUserStats({
          completedLessonIds,
          completedLessons: Object.keys(completedLessonIds).length
        });
      }
    } catch (error) {
      console.warn("[Pinyin intro] Tiến độ đã lưu trên máy nhưng chưa đồng bộ Firebase.", error);
    }
  }

  function showCompletedState() {
    const message = document.getElementById("completionMessage");
    const button = document.getElementById("completeFoundation");
    message.hidden = false;
    button.textContent = "Đã hoàn thành";
    button.disabled = true;
    message.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }

  function bindCompletion() {
    document.getElementById("completeFoundation")?.addEventListener("click", async () => {
      await saveCompletion();
      showCompletedState();
    });
  }

  function bindProgress() {
    const steps = [...document.querySelectorAll(".lesson-step")];
    const bar = document.getElementById("lessonProgressBar");
    const label = document.getElementById("lessonProgressLabel");
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const step = Number(visible.target.dataset.step || 1);
      bar.style.width = `${Math.round((step / steps.length) * 100)}%`;
      label.textContent = `Phần ${step}/${steps.length}`;
    }, { rootMargin: "-20% 0px -55%", threshold: [0, .25, .6] });
    steps.forEach((step) => observer.observe(step));
  }

  async function init() {
    bindPractice();
    bindCompletion();
    bindProgress();
    setPracticeScore();
    setAudioLoading(true);
    try {
      await loadAudioManifest();
      bindAudio();
      setAudioLoading(false);
    } catch (error) {
      console.error("[Pinyin intro] Không tải được bộ audio tĩnh.", error);
      document.querySelectorAll("button[data-audio-id]").forEach((button) => {
        button.disabled = true;
        button.removeAttribute("aria-busy");
      });
      ["initialGrid", "finalGrid"].forEach((id) => document.getElementById(id)?.setAttribute("aria-busy", "false"));
      document.querySelectorAll(".audio-manifest-loading").forEach((node) => { node.className = "audio-manifest-error"; node.textContent = "Bộ audio chưa sẵn sàng. Vui lòng tải lại trang."; });
    }
  }

  init();
  window.addEventListener("pagehide", stopAudio);
})();
