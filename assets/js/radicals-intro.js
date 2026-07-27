(() => {
  "use strict";

  const FOUNDATION_ID = "hsk1-radicals-intro";
  const LOCAL_PROGRESS_KEY = "cc_local_progress";
  const questions = [...document.querySelectorAll(".radical-practice-question")];
  const correctQuestions = new Set();

  const wrongHints = {
    smallest: "Nét là đơn vị nhỏ nhất. Nhiều nét ghép thành bộ kiện.",
    component: "Một chữ có thể có nhiều bộ kiện nhưng thường chỉ được xếp dưới một bộ thủ.",
    meaning: "Trong 妈, 女 gợi vùng nghĩa; 马 chủ yếu gợi phần âm.",
    ten: "Khi nét ngang và nét sổ giao nhau, thường viết ngang trước: 一 → 丨.",
    close: "Viết phần khung ngoài, phần bên trong, rồi mới khép đáy khung.",
    structure: "你 tách thành 亻 ở trái và 尔 ở phải."
  };

  function dispatchLearningEvent(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, {
      detail: { level: "hsk1", lesson: "Bộ thủ", ...detail }
    }));
  }

  function bindStrokeCards() {
    document.querySelectorAll("[data-stroke]").forEach((card) => {
      card.addEventListener("click", () => {
        card.classList.remove("is-playing");
        void card.offsetWidth;
        card.classList.add("is-playing");
        window.setTimeout(() => card.classList.remove("is-playing"), 1100);
      });
    });
  }

  function resetOrderChallenge(challenge) {
    challenge.dataset.orderIndex = "0";
    challenge.classList.remove("is-complete");
    challenge.querySelector(".order-target").innerHTML = "";
    challenge.querySelector("p").textContent = "";
    challenge.querySelectorAll("[data-order-part]").forEach((button) => {
      button.disabled = false;
      button.classList.remove("is-wrong");
    });
  }

  function bindOrderChallenges() {
    const challenges = [...document.querySelectorAll(".order-challenge")];
    challenges.forEach((challenge) => {
      resetOrderChallenge(challenge);
      const expected = challenge.dataset.order.split("|");
      challenge.querySelectorAll("[data-order-part]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(challenge.dataset.orderIndex || 0);
          const feedback = challenge.querySelector("p");
          if (button.dataset.orderPart !== expected[index]) {
            button.classList.add("is-wrong");
            feedback.textContent = "Chưa đúng thứ tự — thử một nét khác nhé.";
            dispatchLearningEvent("cc:learning-answer", { correct: false, source: "radical-order" });
            return;
          }

          button.disabled = true;
          button.classList.remove("is-wrong");
          challenge.querySelector(".order-target").insertAdjacentHTML("beforeend", `<span>${button.dataset.orderPart}</span>`);
          challenge.dataset.orderIndex = String(index + 1);
          feedback.textContent = index + 1 === expected.length ? "Đúng thứ tự!" : "Đúng rồi, tiếp tục nhé.";
          dispatchLearningEvent("cc:learning-answer", { correct: true, source: "radical-order" });
          if (index + 1 === expected.length) challenge.classList.add("is-complete");
        });
      });
    });

    document.getElementById("resetOrders")?.addEventListener("click", () => {
      challenges.forEach(resetOrderChallenge);
    });
  }

  function bindWritingPad() {
    const canvas = document.getElementById("writingCanvas");
    if (!canvas) return;
    const context = canvas.getContext("2d");
    let drawing = false;
    let activePointer = null;
    let lastPoint = null;

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(1, Math.round(rect.width * ratio));
      const nextHeight = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
    }

    function pointFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function strokeColor() {
      return getComputedStyle(document.querySelector(".radicals-intro-lesson")).getPropertyValue("--ri-purple-dark").trim() || "#5638a5";
    }

    function startDrawing(event) {
      if (activePointer !== null) return;
      activePointer = event.pointerId;
      drawing = true;
      lastPoint = pointFromEvent(event);
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }

    function draw(event) {
      if (!drawing || event.pointerId !== activePointer || !lastPoint) return;
      const nextPoint = pointFromEvent(event);
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.lineTo(nextPoint.x, nextPoint.y);
      context.strokeStyle = strokeColor();
      context.lineWidth = Math.max(7, canvas.getBoundingClientRect().width * .024);
      context.stroke();
      lastPoint = nextPoint;
      event.preventDefault();
    }

    function stopDrawing(event) {
      if (event.pointerId !== activePointer) return;
      drawing = false;
      activePointer = null;
      lastPoint = null;
    }

    canvas.addEventListener("pointerdown", startDrawing);
    canvas.addEventListener("pointermove", draw);
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("lostpointercapture", () => {
      drawing = false;
      activePointer = null;
      lastPoint = null;
    });

    document.getElementById("clearCanvas")?.addEventListener("click", () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
    });

    document.querySelectorAll("[data-model-char]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-model-char]").forEach((item) => item.classList.toggle("is-active", item === button));
        document.getElementById("writingModel").textContent = button.dataset.modelChar;
        context.clearRect(0, 0, canvas.width, canvas.height);
      });
    });

    resizeCanvas();
    if ("ResizeObserver" in window) new ResizeObserver(resizeCanvas).observe(canvas);
    else window.addEventListener("resize", resizeCanvas);
  }

  function updatePracticeScore() {
    document.getElementById("practiceScore").textContent = `${correctQuestions.size}/${questions.length} câu đúng`;
    document.getElementById("completeFoundation").disabled = correctQuestions.size !== questions.length;
  }

  function answerQuestion(question, button) {
    if (question.classList.contains("is-correct")) return;
    const isCorrect = button.dataset.choice === question.dataset.answer;
    const feedback = question.querySelector(".radical-practice-feedback");
    question.querySelectorAll("[data-choice]").forEach((choice) => choice.classList.remove("is-wrong"));

    if (!isCorrect) {
      button.classList.add("is-wrong");
      feedback.textContent = wrongHints[question.dataset.question] || "Chưa đúng, hãy xem lại phần giải thích phía trên.";
      dispatchLearningEvent("cc:learning-answer", { correct: false, source: "radical-practice" });
      return;
    }

    button.classList.add("is-right");
    question.classList.add("is-correct");
    question.querySelectorAll("[data-choice]").forEach((choice) => { choice.disabled = true; });
    feedback.textContent = "Chính xác!";
    correctQuestions.add(question.dataset.question);
    updatePracticeScore();
    dispatchLearningEvent("cc:learning-answer", { correct: true, source: "radical-practice" });
  }

  function resetPractice() {
    correctQuestions.clear();
    questions.forEach((question) => {
      question.classList.remove("is-correct");
      question.querySelector(".radical-practice-feedback").textContent = "";
      question.querySelectorAll("[data-choice]").forEach((button) => {
        button.disabled = false;
        button.classList.remove("is-right", "is-wrong");
      });
    });
    updatePracticeScore();
  }

  function bindPractice() {
    questions.forEach((question) => {
      question.querySelectorAll("[data-choice]").forEach((button) => {
        button.addEventListener("click", () => answerQuestion(question, button));
      });
    });
    document.getElementById("resetPractice")?.addEventListener("click", resetPractice);
  }

  function readLocalProgress() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "{}");
    } catch (_error) {
      return {};
    }
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
      console.warn("[Radicals intro] Trình duyệt không cho phép lưu tiến độ cục bộ.", error);
    }
  }

  async function waitForFirebase(timeoutMs = 3500) {
    if (window.CCFirebase) return window.CCFirebase;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(window.CCFirebase || null), timeoutMs);
      window.addEventListener("firebase-ready", () => {
        clearTimeout(timer);
        resolve(window.CCFirebase || null);
      }, { once: true });
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
      console.warn("[Radicals intro] Tiến độ đã lưu trên máy nhưng chưa đồng bộ Firebase.", error);
    }
  }

  function showCompletedState() {
    const message = document.getElementById("completionMessage");
    const button = document.getElementById("completeFoundation");
    message.hidden = false;
    button.textContent = "Đã hoàn thành";
    button.disabled = true;
    message.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
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
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const step = Number(visible.target.dataset.step || 1);
      bar.style.width = `${Math.round((step / steps.length) * 100)}%`;
      label.textContent = `Phần ${step}/${steps.length}`;
      dispatchLearningEvent("cc:learning-progress", { current: step, total: steps.length });
    }, { rootMargin: "-20% 0px -55%", threshold: [0, .25, .6] });
    steps.forEach((step) => observer.observe(step));
  }

  function init() {
    bindStrokeCards();
    bindOrderChallenges();
    bindWritingPad();
    bindPractice();
    bindCompletion();
    bindProgress();
    updatePracticeScore();
  }

  init();
})();
