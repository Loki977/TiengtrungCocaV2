export async function waitForPlacementAuth() {
  if (!window.CCFirebase) {
    await new Promise((resolve) => window.addEventListener('firebase-ready', resolve, { once: true }));
  }
  const immediateUser = window.CCFirebase.getCurrentUser?.() || window.sharedFirebase?.auth?.currentUser;
  if (immediateUser) return immediateUser;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (user) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('cc-placement-auth-observed', onObserved);
      window.removeEventListener('cc-auth-state-changed', onStateChanged);
      resolve(user || null);
    };
    const onObserved = (event) => finish(event.detail?.user || window.CCFirebase.getCurrentUser?.());
    const onStateChanged = (event) => finish(event.detail?.user || window.CCFirebase.getCurrentUser?.());
    window.addEventListener('cc-placement-auth-observed', onObserved);
    window.addEventListener('cc-auth-state-changed', onStateChanged);
    window.CCFirebase.authReady.then((detail) => finish(detail?.user || window.CCFirebase.getCurrentUser?.()));
  });
}

export async function placementApi(path, options = {}) {
  const user = window.CCFirebase?.getCurrentUser?.();
  if (!user) {
    const error = new Error('Vui lòng đăng nhập để tiếp tục.');
    error.code = 'auth_required';
    throw error;
  }
  const token = await user.getIdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`/api/hsk-placement/${path}`, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Không thể kết nối dịch vụ kiểm tra trình độ.');
    error.code = data.error?.code || 'request_failed';
    error.status = response.status;
    throw error;
  }
  return data;
}

export function showPlacementToast(message) {
  const toast = document.getElementById('placementToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('placement-hidden');
  clearTimeout(showPlacementToast.timer);
  showPlacementToast.timer = setTimeout(() => toast.classList.add('placement-hidden'), 3000);
}

export function stopPlacementAudio() {
  if (stopPlacementAudio.current) {
    stopPlacementAudio.current.pause();
    stopPlacementAudio.current.src = '';
    stopPlacementAudio.current = null;
  }
}

export async function playPlacementAudio(attemptId, questionId) {
  stopPlacementAudio();
  let payload = await placementApi('audio', {
    method: 'POST',
    body: JSON.stringify({ attemptId, questionId })
  });
  let audio = new Audio(payload.audioUrl);
  audio.preload = 'auto';
  stopPlacementAudio.current = audio;
  try {
    await audio.play();
  } catch (error) {
    if (error?.name === 'NotAllowedError') throw error;
    payload = await placementApi('audio', {
      method: 'POST',
      body: JSON.stringify({ attemptId, questionId, fallback: true })
    });
    audio = new Audio(payload.audioUrl);
    audio.preload = 'auto';
    stopPlacementAudio.current = audio;
    await audio.play();
  }
  return payload;
}

export const placementLabels = Object.freeze({
  skills: {
    listening: 'Nghe hiểu',
    reading: 'Đọc hiểu',
    vocabulary: 'Từ vựng',
    grammar: 'Ngữ pháp',
    writing: 'Vận dụng câu'
  },
  groups: {
    listening: 'Nghe hiểu',
    reading: 'Đọc hiểu',
    languageUse: 'Vận dụng ngôn ngữ'
  },
  confidence: {
    high: 'Cao',
    medium: 'Trung bình',
    low: 'Thấp'
  }
});
