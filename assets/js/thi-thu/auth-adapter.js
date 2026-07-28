const FIREBASE_AUTH_URL = 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function buildLoginUrl(authConfig) {
  const loginPage = authConfig.loginPage || './profile.html';
  const loginUrl = new URL(loginPage, location.href);
  if (loginUrl.origin !== location.origin) {
    throw new Error('Trang đăng nhập phải là đường dẫn nội bộ cùng origin.');
  }

  const returnUrl = `${location.pathname}${location.search}${location.hash}`;
  loginUrl.searchParams.set(authConfig.returnParam || 'return', returnUrl);
  return loginUrl.href;
}

async function waitForSharedFirebase(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.sharedFirebase?.auth) return window.sharedFirebase;
    await delay(120);
  }
  return null;
}

export async function createAuthAdapter(config) {
  const authConfig = config.auth || {};
  const shared = await waitForSharedFirebase(authConfig.waitMs || 5000);

  if (!shared?.auth) {
    return {
      status: authConfig.required ? 'missing' : 'guest',
      user: null,
      async signOut() {},
      async syncResult() {},
      async listResults() { return []; },
      async deleteResult() { return { skipped: true }; },
      async getExamAccessSettings() { return {}; },
      isVipActive() { return false; },
      openVipPurchase() {},
      async submitWritingAttempt() {
        throw new Error('Vui lòng đăng nhập để gửi bài tự luận.');
      },
      async listWritingSubmissions() {
        return { submissions: [] };
      },
      goToLogin() {
        location.replace(buildLoginUrl(authConfig));
      }
    };
  }

  const { onAuthStateChanged, signOut } = await import(FIREBASE_AUTH_URL);
  const user = await new Promise(resolve => {
    const timeout = setTimeout(() => resolve(shared.auth.currentUser || null), authConfig.waitMs || 5000);
    const unsubscribe = onAuthStateChanged(shared.auth, currentUser => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(currentUser || null);
    });
  });

  return {
    status: user ? 'authenticated' : (authConfig.required ? 'unauthenticated' : 'guest'),
    user,
    async signOut() {
      await signOut(shared.auth);
    },
    async syncResult(result) {
      if (!user || !shared.db) return { skipped: true };
      const { doc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
      const reference = doc(shared.db, 'users', user.uid, 'mockExamAttempts', result.attemptId);
      await setDoc(reference, {
        ...result,
        details: [],
        submittedAt: serverTimestamp()
      }, { merge: false });
      return { synced: true };
    },
    async listResults() {
      if (!shared.db) return [];
      const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
      const snapshot = await getDocs(collection(shared.db, 'users', user.uid, 'mockExamAttempts'));
      return snapshot.docs.map(item => {
        const value = item.data();
        const submittedAt = value.submittedAt?.toMillis?.()
          || Number(value.submittedAt?.seconds || 0) * 1000
          || Number(value.submittedAt || 0);
        return { ...value, attemptId: value.attemptId || item.id, submittedAt };
      }).sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
    },
    async deleteResult(attemptId) {
      const token = await user.getIdToken();
      const response = await fetch('./api/writing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'deleteAttempt', data: { attemptId } }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || 'Không thể xóa kết quả đã lưu.');
        error.code = payload.code || `http_${response.status}`;
        throw error;
      }
      return payload;
    },
    async getExamAccessSettings() {
      if (!shared.db) return {};
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
      const snapshot = await getDoc(doc(shared.db, 'adminSettings', 'mockExams'));
      return snapshot.exists() ? snapshot.data() : {};
    },
    isVipActive() {
      return Boolean(shared.vip?.isActive?.(shared.getCurrentStats?.() || {}));
    },
    openVipPurchase() {
      return shared.vip?.openPurchase?.(user);
    },
    async submitWritingAttempt({ attemptId, testId, answers, mode = 'official', elapsedSeconds = 0 }) {
      const token = await user.getIdToken();
      const response = await fetch('./api/writing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'submitAttempt',
          data: { attemptId, testId, answers, mode, elapsedSeconds },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || 'Không thể gửi bài tự luận.');
        error.code = payload.code || `http_${response.status}`;
        throw error;
      }
      return payload;
    },
    async listWritingSubmissions({ attemptId = '' } = {}) {
      const token = await user.getIdToken();
      const response = await fetch('./api/writing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'listMine',
          data: { attemptId },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || 'Không thể tải trạng thái bài tự luận.');
        error.code = payload.code || `http_${response.status}`;
        throw error;
      }
      return payload;
    },
    goToLogin() {
      location.replace(buildLoginUrl(authConfig));
    }
  };
}
