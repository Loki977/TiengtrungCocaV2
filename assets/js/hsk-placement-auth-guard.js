const pageType = document.body?.dataset.placementPage || 'test';
const targetModule = pageType === 'result'
  ? './hsk-placement-result.js'
  : './hsk-placement.js';

let featureStarted = false;
let gate;

function ensureGate() {
  if (gate) return gate;
  gate = document.createElement('section');
  gate.className = 'placement-auth-gate';
  gate.setAttribute('role', 'status');
  gate.setAttribute('aria-live', 'polite');
  gate.innerHTML = `
    <div class="placement-auth-gate__spinner" aria-hidden="true"></div>
    <span class="placement-eyebrow">Xác thực tài khoản</span>
    <h1>Đang kiểm tra phiên đăng nhập</h1>
    <p>Trang Test HSK chỉ mở sau khi Firebase Auth hoàn tất khôi phục phiên.</p>
    <button class="placement-primary-button placement-hidden" type="button" data-placement-login>Đăng nhập để tiếp tục</button>
  `;
  document.body.insertBefore(gate, document.getElementById('placementApp'));
  gate.querySelector('[data-placement-login]').addEventListener('click', () => {
    window.CCSiteShell?.openLogin?.({
      returnUrl: location.href,
      reason: 'Vui lòng đăng nhập để làm Test trình độ HSK.'
    });
  });
  return gate;
}

function showSignedOutGate() {
  const host = ensureGate();
  document.documentElement.classList.remove('placement-auth-pending');
  document.documentElement.classList.add('placement-auth-required');
  document.body.removeAttribute('aria-busy');
  host.querySelector('.placement-auth-gate__spinner').hidden = true;
  host.querySelector('h1').textContent = 'Đăng nhập để làm Test trình độ HSK';
  host.querySelector('p').textContent = 'Kết quả được gắn với đúng tài khoản và tiếp tục đồng bộ sau khi bạn đăng nhập.';
  host.querySelector('[data-placement-login]').classList.remove('placement-hidden');
  window.CCSiteShell?.openLogin?.({
    returnUrl: location.href,
    reason: 'Vui lòng đăng nhập để làm Test trình độ HSK.'
  });
}

async function startFeature() {
  if (featureStarted) return;
  featureStarted = true;
  await import(targetModule);
  gate?.remove();
  gate = null;
  document.documentElement.classList.remove('placement-auth-pending', 'placement-auth-required');
  document.body.removeAttribute('aria-busy');
}

async function resolveAuth() {
  ensureGate();
  document.body.setAttribute('aria-busy', 'true');
  if (!window.CCFirebase) await import('./firebase-auth.js');
  const detail = await (window.CCFirebase?.authReady || window.authReady);
  const user = detail?.user || window.CCFirebase?.getCurrentUser?.();
  if (user) {
    await startFeature();
  } else {
    showSignedOutGate();
  }
}

window.addEventListener('cc-auth-state-changed', (event) => {
  if (event.detail?.user) startFeature();
  else if (window.CCFirebase?.isAuthReady?.()) showSignedOutGate();
});

resolveAuth().catch((error) => {
  console.error('[hsk-placement-auth] Không xác minh được phiên', error);
  const host = ensureGate();
  document.documentElement.classList.remove('placement-auth-pending');
  document.documentElement.classList.add('placement-auth-required');
  document.body.removeAttribute('aria-busy');
  host.querySelector('.placement-auth-gate__spinner').hidden = true;
  host.querySelector('h1').textContent = 'Không kiểm tra được phiên đăng nhập';
  host.querySelector('p').textContent = 'Vui lòng kiểm tra kết nối rồi tải lại trang.';
  host.querySelector('[data-placement-login]').classList.remove('placement-hidden');
});
