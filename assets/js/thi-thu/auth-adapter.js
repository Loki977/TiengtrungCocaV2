const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function internalReturnUrl(config) {
  const login = new URL(config.auth?.loginPage || './profile.html', location.href);
  login.searchParams.set(config.auth?.returnParam || 'return', `${location.pathname}${location.search}`);
  return login.href;
}

export async function createAuthAdapter(config) {
  const required = Boolean(config.auth?.required);
  const deadline = Date.now() + Number(config.auth?.waitMs || 6000);
  while (!window.CCFirebase && Date.now() < deadline) await wait(50);

  const shared = window.CCFirebase;
  if (!shared) {
    return {
      status: required ? 'missing' : 'authenticated',
      user: { uid: 'guest', displayName: 'Khách' },
      goToLogin: () => location.assign(internalReturnUrl(config)),
      signOut: async () => {}
    };
  }

  try { await Promise.race([shared.authReady, wait(Number(config.auth?.waitMs || 6000))]); } catch {}
  const user = shared.auth?.currentUser || shared.getCurrentUser?.() || null;
  return {
    status: user || !required ? 'authenticated' : 'unauthenticated',
    user: user || { uid: 'guest', displayName: 'Khách' },
    goToLogin: () => location.assign(internalReturnUrl(config)),
    signOut: async () => { if (shared.logout) await shared.logout(); }
  };
}
