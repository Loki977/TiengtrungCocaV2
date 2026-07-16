import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';

const ADMIN_EMAIL = 'nqthanhforwork@gmail.com';
const WAIT_MS = 6000;

function safeInternalReturnUrl() {
  return `${location.pathname}${location.search}${location.hash}`;
}

function redirectToLogin() {
  const loginUrl = new URL('./profile.html', location.href);
  loginUrl.searchParams.set('return', safeInternalReturnUrl());
  location.replace(loginUrl.href);
}

async function waitForSharedFirebase() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_MS) {
    if (window.sharedFirebase?.auth) return window.sharedFirebase;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Firebase Auth chưa sẵn sàng.');
}

async function authorizeEditor() {
  const status = document.querySelector('#editorAuthStatus');

  try {
    const shared = await waitForSharedFirebase();
    const user = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Hết thời gian xác minh đăng nhập.')), WAIT_MS);
      const unsubscribe = onAuthStateChanged(shared.auth, currentUser => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(currentUser || null);
      }, reject);
    });

    if (!user) {
      redirectToLogin();
      return;
    }

    if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) {
      location.replace(new URL('./index.html', location.href).href);
      return;
    }

    document.documentElement.classList.remove('editor-auth-pending');
    document.documentElement.classList.add('admin-authorized');
    status.hidden = true;
    await import('./editor.js');
  } catch (error) {
    console.error('[thi-thu-editor] Không thể xác minh quyền quản trị.', error);
    status.textContent = 'Không thể xác minh quyền quản trị. Vui lòng tải lại trang.';
    status.classList.add('is-error');
  }
}

authorizeEditor();
