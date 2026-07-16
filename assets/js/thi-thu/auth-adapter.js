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
    goToLogin() {
      location.replace(buildLoginUrl(authConfig));
    }
  };
}
