(function () {
  'use strict';

  if (window.CCSiteShell) return;

  const scriptUrl = document.currentScript?.src || new URL('assets/js/site-shell.js', document.baseURI).href;
  const stylesheetUrl = new URL('../css/app-shell.css?v=4', scriptUrl).href;
  const AUTH_RETURN_KEY = 'cc_auth_return_url';
  const SETTINGS_KEY = 'cc_device_settings_v1';
  const PROFILE_BACKGROUNDS = Array.from({ length: 15 }, (_, index) => `p${index + 1}`);

  const icons = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"></path>',
    close: '<path d="m6 6 12 12M18 6 6 18"></path>',
    home: '<path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10M9 20v-6h6v6"></path>',
    course: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"></path><path d="M4 5.5v16M8 7h7"></path>',
    writing: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"></path><path d="m14 7 3 3M4 20h6"></path>',
    cards: '<rect x="5" y="4" width="14" height="16" rx="2"></rect><path d="M9 8h6M9 12h4M3 8v10a2 2 0 0 0 2 2"></path>',
    library: '<path d="M4 20h16M6 20V9h12v11M4 9h16M8 9V5h8v4M9 13h2M13 13h2M9 16h2M13 16h2"></path>',
    challenge: '<path d="M8 3h8v4a4 4 0 0 1-8 0zM8 5H5v1a4 4 0 0 0 4 4M16 5h3v1a4 4 0 0 1-4 4M12 11v5M8 20h8M9 16h6v4"></path>',
    exam: '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"></path><path d="m15 16 1.5 1.5L20 14"></path>',
    placement: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2M8 3.8l1 2M16 3.8l-1 2"></path>',
    profile: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"></path>',
    moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z"></path>',
    admin: '<path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z"></path><path d="m9 12 2 2 4-4"></path>',
    auth: '<path d="M10 17l5-5-5-5M15 12H3M14 3h6v18h-6"></path>'
  };

  const navItems = [
    { key: 'home', label: 'Trang chủ', href: 'index.html', icon: 'home' },
    { key: 'course', label: 'Khóa học', href: 'hsk.html', icon: 'course' },
    { key: 'writing', label: 'Luyện viết', href: 'hsk-writing.html', icon: 'writing' },
    { key: 'cards', label: 'Flashcard', href: 'flashcard.html', icon: 'cards' },
    { key: 'library', label: 'Tàng Thư Các', href: 'vocabulary.html', icon: 'library' },
    { key: 'challenge', label: 'Thử thách', href: 'challenge.html', icon: 'challenge' },
    { key: 'exam', label: 'Thi thử', href: 'ThiThu.html', icon: 'exam' },
    { key: 'placement', label: 'Test trình độ HSK', href: 'hsk-placement.html', icon: 'placement', auth: true },
    { key: 'profile', label: 'Trang cá nhân', href: 'profile.html', icon: 'profile' }
  ];

  let shell;
  let scrim;
  let mobileToggle;
  let settingsPanel;
  let lastFocusedElement = null;
  let authResolved = false;
  let currentUser = null;
  let currentStats = {};

  function svg(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.home}</svg>`;
  }

  function ensureStylesheet() {
    const expectedPath = new URL(stylesheetUrl).pathname;
    if ([...document.styleSheets].some((sheet) => {
      try { return sheet.href && new URL(sheet.href).pathname === expectedPath; } catch (_) { return false; }
    })) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheetUrl;
    link.dataset.ccAppShell = 'true';
    document.head.appendChild(link);
  }

  function currentPageKey() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (file === 'index.html' || !file) return 'home';
    if (file === 'hsk.html' || file === 'hsk1-pinyin-intro.html') return 'course';
    if (file === 'hsk-writing.html' || file === 'hsk1-writing-lessons.html' || file === 'lesson.html') return 'writing';
    if (file === 'flashcard.html') return 'cards';
    if (file === 'vocabulary.html' || file === 'grammar.html') return 'library';
    if (file === 'challenge.html') return 'challenge';
    if (file === 'thithu.html') return 'exam';
    if (file.startsWith('hsk-placement')) return 'placement';
    if (file === 'profile.html') return 'profile';
    return '';
  }

  function navMarkup() {
    const active = currentPageKey();
    return navItems.map((item) => `
      <a class="cc-shell__link" href="${item.href}" data-cc-nav="${item.key}"${item.auth ? ' data-cc-auth-required="true"' : ''}${active === item.key ? ' aria-current="page"' : ''}>
        ${svg(item.icon)}
        <span class="cc-shell__label">${item.label}</span>
      </a>
    `).join('');
  }

  function settingsMarkup() {
    return `
      <section class="cc-shell-settings" id="ccShellSettings" aria-labelledby="ccShellSettingsTitle" aria-hidden="true">
        <div class="cc-shell-settings__head">
          <h2 id="ccShellSettingsTitle">Cài đặt tài khoản</h2>
          <button class="cc-shell__icon-button" type="button" data-cc-settings-close aria-label="Đóng cài đặt">${svg('close')}</button>
        </div>
        <div class="cc-shell-settings__body">
          <section class="cc-shell-settings__section">
            <h3>Tài khoản</h3>
            <label class="cc-shell-field">
              Tên hiển thị
              <input id="settingName" type="text" autocomplete="name" placeholder="Tên của bạn" />
            </label>
            <button class="cc-shell-settings__action" type="button" data-cc-save-name>Lưu tên hiển thị</button>
            <button class="cc-shell-settings__action cc-shell-settings__action--secondary" type="button" data-cc-reset-password>Gửi email đổi mật khẩu</button>
          </section>

          <section class="cc-shell-settings__section">
            <h3>Mục tiêu học tập</h3>
            <label class="cc-shell-field">
              Mục tiêu EXP mỗi ngày
              <input id="ccShellDailyGoal" type="range" min="50" max="500" step="50" value="200" />
              <span data-cc-goal-output>200 EXP</span>
            </label>
            <label class="cc-shell-field">
              Thời gian nhắc
              <input id="ccShellReminderTime" type="time" value="20:00" />
            </label>
            <label class="cc-shell-field">
              Cấp HSK mục tiêu
              <select id="ccShellTargetHsk">
                ${[1, 2, 3, 4, 5, 6].map((level) => `<option value="HSK ${level}">HSK ${level}</option>`).join('')}
              </select>
            </label>
            <button class="cc-shell-settings__action" type="button" data-cc-save-goals>Lưu mục tiêu</button>
          </section>

          <section class="cc-shell-settings__section">
            <h3>Thông báo</h3>
            ${[
              ['dailyReminder', 'Nhắc học hàng ngày'],
              ['streakReminder', 'Cảnh báo streak'],
              ['contentUpdates', 'Nội dung mới'],
              ['weeklyEmail', 'Email tổng kết tuần']
            ].map(([key, label], index) => `
              <label class="cc-shell-setting-row">
                <span>${label}</span>
                <span class="cc-shell-switch">
                  <input type="checkbox" data-cc-notification="${key}"${index === 2 ? '' : ' checked'} />
                  <span aria-hidden="true"></span>
                </span>
              </label>
            `).join('')}
          </section>

          <section class="cc-shell-settings__section">
            <h3>Giao diện</h3>
            <label class="cc-shell-setting-row">
              <span>Chế độ tối<small>Giảm chói khi học ban đêm</small></span>
              <span class="cc-shell-switch">
                <input id="ccShellDarkMode" type="checkbox" />
                <span aria-hidden="true"></span>
              </span>
            </label>
            <label class="cc-shell-setting-row">
              <span>Hiệu ứng<small>Tôn trọng thiết lập giảm chuyển động</small></span>
              <span class="cc-shell-switch">
                <input id="ccShellMotion" type="checkbox" />
                <span aria-hidden="true"></span>
              </span>
            </label>
            <label class="cc-shell-field">
              Cỡ chữ
              <select id="ccShellFontSize">
                <option value="small">Nhỏ</option>
                <option value="medium">Vừa</option>
                <option value="large">Lớn</option>
              </select>
            </label>
            <label class="cc-shell-setting-row">
              <span>Ảnh nền Profile<small data-cc-profile-bg-help>Quyền lợi VIP</small></span>
              <span class="cc-shell-switch">
                <input id="ccShellProfileBg" type="checkbox" />
                <span aria-hidden="true"></span>
              </span>
            </label>
            <label class="cc-shell-field">
              Chọn ảnh nền Profile
              <select id="ccShellProfileBgId">
                ${PROFILE_BACKGROUNDS.map((id) => `<option value="${id}">${id.toUpperCase()}</option>`).join('')}
              </select>
            </label>
          </section>

          <section class="cc-shell-settings__section">
            <h3>Vùng nguy hiểm</h3>
            <button class="cc-shell-settings__action cc-shell-settings__action--danger" type="button" data-cc-delete-account>Xóa tài khoản</button>
          </section>
        </div>
      </section>
    `;
  }

  function createShell() {
    shell = document.createElement('aside');
    shell.className = 'cc-shell';
    shell.id = 'ccAccountShell';
    shell.setAttribute('aria-label', 'Điều hướng tài khoản');
    shell.innerHTML = `
      <div class="cc-shell__inner">
        <div class="cc-shell__top">
          <button class="cc-shell__menu" type="button" aria-label="Mở rộng menu" aria-expanded="false" aria-controls="ccAccountShell">${svg('menu')}</button>
          <a class="cc-shell__brand" href="index.html">
            <span class="cc-shell__brand-mark" aria-hidden="true">中</span>
            <span class="cc-shell__brand-text">Cam &amp; Coca</span>
          </a>
        </div>

        <div class="cc-shell__account" aria-live="polite" aria-busy="true">
          <span class="cc-shell__avatar" data-cc-shell-avatar>CC</span>
          <span class="cc-shell__user-copy">
            <strong data-cc-shell-name>Đang kiểm tra phiên…</strong>
            <small data-cc-shell-email>Vui lòng chờ</small>
            <span class="cc-shell__user-metrics">
              <span>EXP <b data-cc-shell-xp>0</b></span>
              <span>Xu <b data-cc-shell-coins>0</b></span>
              <span class="cc-shell__vip" data-cc-shell-vip hidden>VIP</span>
            </span>
          </span>
        </div>

        <nav class="cc-shell__nav" aria-label="Điều hướng chính">
          ${navMarkup()}
          <div class="cc-shell__divider" role="separator"></div>
          <button class="cc-shell__link" type="button" data-cc-settings-open>
            ${svg('settings')}
            <span class="cc-shell__label">Cài đặt tài khoản</span>
          </button>
          <button class="cc-shell__link" type="button" data-cc-dark-quick>
            ${svg('moon')}
            <span class="cc-shell__label">Dark mode</span>
          </button>
          <a class="cc-shell__link" href="admin-super.html" data-cc-admin-link hidden>
            ${svg('admin')}
            <span class="cc-shell__label">Quản trị</span>
          </a>
        </nav>

        <div class="cc-shell__footer">
          <button class="cc-shell__link cc-shell__auth" type="button" data-cc-shell-auth disabled>
            ${svg('auth')}
            <span class="cc-shell__footer-copy">Đang kiểm tra…</span>
          </button>
        </div>
        ${settingsMarkup()}
      </div>
    `;

    scrim = document.createElement('div');
    scrim.className = 'cc-shell__scrim';
    scrim.setAttribute('aria-hidden', 'true');

    mobileToggle = document.createElement('button');
    mobileToggle.className = 'cc-shell-mobile-toggle';
    mobileToggle.type = 'button';
    mobileToggle.setAttribute('aria-label', 'Mở menu tài khoản');
    mobileToggle.setAttribute('aria-expanded', 'false');
    mobileToggle.setAttribute('aria-controls', 'ccAccountShell');
    mobileToggle.innerHTML = svg('menu');

    document.body.prepend(scrim);
    document.body.prepend(shell);
    document.body.prepend(mobileToggle);
    document.body.classList.add('cc-shell-ready');
    settingsPanel = shell.querySelector('#ccShellSettings');
  }

  function markLegacyHeader() {
    const candidates = [
      document.getElementById('header'),
      document.querySelector('body[data-placement-page] .placement-header'),
      document.querySelector('body:not(.admin-page) main.page > header.topbar'),
      document.querySelector('.page-shell > header.topbar'),
      document.querySelector('.challenge-top')
    ].filter(Boolean);
    candidates.forEach((node) => node.setAttribute('data-cc-legacy-shell-header', 'true'));
  }

  function removeDuplicateProfileSettings() {
    if (currentPageKey() !== 'profile') return;
    document.querySelector('[data-ptab="settings"]')?.remove();
    document.getElementById('panel-settings')?.remove();
  }

  function isMobile() {
    return window.matchMedia('(max-width: 899px)').matches;
  }

  function setExpanded(expanded, options = {}) {
    const next = Boolean(expanded);
    shell.classList.toggle('is-expanded', next);
    document.body.classList.toggle('cc-shell-expanded', next && !isMobile());
    document.body.classList.toggle('cc-shell-mobile-open', next && isMobile());
    scrim.classList.toggle('is-visible', next && isMobile());
    shell.querySelector('.cc-shell__menu')?.setAttribute('aria-expanded', String(next));
    mobileToggle.setAttribute('aria-expanded', String(next));
    mobileToggle.setAttribute('aria-label', next ? 'Đóng menu tài khoản' : 'Mở menu tài khoản');
    mobileToggle.innerHTML = svg(next ? 'close' : 'menu');
    shell.toggleAttribute('inert', isMobile() && !next);
    shell.setAttribute('aria-hidden', String(isMobile() && !next));

    if (next) {
      lastFocusedElement = options.focusOrigin || document.activeElement;
      if (options.focusFirst) shell.querySelector('.cc-shell__link')?.focus();
    } else {
      closeSettings(false);
      if (options.restoreFocus !== false) lastFocusedElement?.focus?.();
    }
  }

  function openSettings() {
    setExpanded(true, { focusOrigin: document.activeElement });
    settingsPanel.classList.add('is-open');
    settingsPanel.setAttribute('aria-hidden', 'false');
    syncSettings();
    requestAnimationFrame(() => settingsPanel.querySelector('input, select, button')?.focus());
  }

  function closeSettings(restoreFocus = true) {
    if (!settingsPanel?.classList.contains('is-open')) return;
    settingsPanel.classList.remove('is-open');
    settingsPanel.setAttribute('aria-hidden', 'true');
    if (restoreFocus) shell.querySelector('[data-cc-settings-open]')?.focus();
  }

  function readDeviceSettings() {
    const defaults = {
      reminderTime: '20:00',
      targetHsk: 'HSK 1',
      dailyReminder: true,
      streakReminder: true,
      contentUpdates: false,
      weeklyEmail: true
    };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch (_) {
      return defaults;
    }
  }

  function writeDeviceSettings(partial) {
    const next = { ...readDeviceSettings(), ...partial };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function showToast(message, type = 'info') {
    if (window.CCFirebase?.showToast) {
      window.CCFirebase.showToast(message, type);
      return;
    }
    const toast = document.createElement('div');
    toast.className = 'cc-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;z-index:9000;right:18px;bottom:18px;max-width:min(360px,calc(100vw - 36px));padding:12px 16px;border-radius:12px;background:#26314b;color:#fff;font:600 14px/1.4 Poppins,sans-serif;box-shadow:0 14px 36px rgba(0,0,0,.28)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function isVipActive() {
    return Boolean(
      currentUser
      && (window.CCFirebase?.vip?.isVerifiedActive?.()
        || window.CCFirebase?.vip?.isActive?.(currentStats))
    );
  }

  function syncSettings() {
    if (!settingsPanel) return;
    const device = readDeviceSettings();
    const appearance = window.CCAppearance?.get?.() || {
      dark: window.CCDarkMode?.get?.() || false,
      fontSize: localStorage.getItem('cc_fontSize') || 'medium'
    };
    const motion = window.CCMotion?.get?.() ?? true;
    const profileBgActive = localStorage.getItem('cc_profileBackground') === 'true';
    const profileBgId = localStorage.getItem('cc_profileBackgroundId') || 'p1';
    const verifiedVip = isVipActive();

    const nameInput = settingsPanel.querySelector('#settingName');
    if (nameInput) nameInput.value = currentUser?.displayName || '';
    const goal = settingsPanel.querySelector('#ccShellDailyGoal');
    if (goal) goal.value = String(Number(currentStats?.dailyGoal || 200));
    settingsPanel.querySelector('[data-cc-goal-output]').textContent = `${goal?.value || 200} EXP`;
    settingsPanel.querySelector('#ccShellReminderTime').value = device.reminderTime;
    settingsPanel.querySelector('#ccShellTargetHsk').value = device.targetHsk;
    settingsPanel.querySelectorAll('[data-cc-notification]').forEach((input) => {
      input.checked = Boolean(device[input.dataset.ccNotification]);
    });
    settingsPanel.querySelector('#ccShellDarkMode').checked = Boolean(appearance.dark);
    settingsPanel.querySelector('#ccShellMotion').checked = Boolean(motion);
    settingsPanel.querySelector('#ccShellFontSize').value = appearance.fontSize || 'medium';
    settingsPanel.querySelector('#ccShellProfileBg').checked = verifiedVip && profileBgActive;
    settingsPanel.querySelector('#ccShellProfileBg').disabled = !verifiedVip;
    settingsPanel.querySelector('#ccShellProfileBgId').value = PROFILE_BACKGROUNDS.includes(profileBgId) ? profileBgId : 'p1';
    settingsPanel.querySelector('#ccShellProfileBgId').disabled = !verifiedVip;
    settingsPanel.querySelector('[data-cc-profile-bg-help]').textContent = verifiedVip
      ? 'Áp dụng trên trang Profile'
      : 'Quyền lợi VIP';
    settingsPanel.querySelector('[data-cc-save-name]').disabled = !currentUser;
    settingsPanel.querySelector('[data-cc-reset-password]').disabled = !currentUser?.email;
    settingsPanel.querySelector('[data-cc-delete-account]').disabled = !currentUser;
  }

  function bindSettings() {
    shell.querySelector('[data-cc-settings-open]').addEventListener('click', openSettings);
    shell.querySelector('[data-cc-settings-close]').addEventListener('click', () => closeSettings());
    shell.querySelector('[data-cc-dark-quick]').addEventListener('click', () => {
      window.CCDarkMode?.set?.(!window.CCDarkMode.get());
      syncSettings();
    });

    settingsPanel.querySelector('#ccShellDailyGoal').addEventListener('input', (event) => {
      settingsPanel.querySelector('[data-cc-goal-output]').textContent = `${event.target.value} EXP`;
    });

    settingsPanel.querySelector('[data-cc-save-name]').addEventListener('click', async () => {
      if (!currentUser) return openLogin({ reason: 'Đăng nhập để cập nhật tên hiển thị.' });
      try {
        await window.saveName?.();
        syncAccount();
      } catch (error) {
        showToast(error?.message || 'Không lưu được tên hiển thị.', 'error');
      }
    });

    settingsPanel.querySelector('[data-cc-reset-password]').addEventListener('click', async () => {
      if (!currentUser?.email) return openLogin({ reason: 'Đăng nhập để đổi mật khẩu.' });
      try {
        await window.CCFirebase?.resetPassword?.(currentUser.email);
        showToast('Đã gửi email đặt lại mật khẩu.');
      } catch (error) {
        showToast(error?.message || 'Không gửi được email đặt lại mật khẩu.', 'error');
      }
    });

    settingsPanel.querySelector('[data-cc-save-goals]').addEventListener('click', async () => {
      const dailyGoal = Number(settingsPanel.querySelector('#ccShellDailyGoal').value || 200);
      const nextDevice = writeDeviceSettings({
        reminderTime: settingsPanel.querySelector('#ccShellReminderTime').value || '20:00',
        targetHsk: settingsPanel.querySelector('#ccShellTargetHsk').value || 'HSK 1'
      });
      if (currentUser && window.CCFirebase?.saveUserStats) {
        try { await window.CCFirebase.saveUserStats({ dailyGoal }); } catch (error) {
          showToast(error?.message || 'Mục tiêu chỉ được lưu trên thiết bị.', 'error');
          return;
        }
      } else {
        writeDeviceSettings({ dailyGoal });
      }
      showToast(`Đã lưu mục tiêu ${dailyGoal} EXP, nhắc lúc ${nextDevice.reminderTime}.`);
    });

    settingsPanel.querySelectorAll('[data-cc-notification]').forEach((input) => {
      input.addEventListener('change', () => {
        writeDeviceSettings({ [input.dataset.ccNotification]: input.checked });
      });
    });

    settingsPanel.querySelector('#ccShellDarkMode').addEventListener('change', (event) => {
      window.CCDarkMode?.set?.(event.target.checked);
    });
    settingsPanel.querySelector('#ccShellMotion').addEventListener('change', (event) => {
      window.CCMotion?.set?.(event.target.checked);
    });
    settingsPanel.querySelector('#ccShellFontSize').addEventListener('change', (event) => {
      window.CCAppearance?.setFontSize?.(event.target.value);
    });

    settingsPanel.querySelector('#ccShellProfileBg').addEventListener('change', (event) => {
      if (!isVipActive()) {
        event.target.checked = false;
        window.CCFirebase?.vip?.openPurchase?.('Ảnh nền Profile là quyền lợi VIP.');
        return;
      }
      localStorage.setItem('cc_profileBackground', String(event.target.checked));
      document.body.classList.toggle('profile-bg-enabled', event.target.checked && currentPageKey() === 'profile');
      window.dispatchEvent(new CustomEvent('cc:profile-background', { detail: { enabled: event.target.checked } }));
    });

    settingsPanel.querySelector('#ccShellProfileBgId').addEventListener('change', (event) => {
      if (!isVipActive()) return;
      localStorage.setItem('cc_profileBackgroundId', event.target.value);
      window.dispatchEvent(new CustomEvent('cc:profile-background', { detail: { id: event.target.value } }));
      if (currentPageKey() === 'profile') location.reload();
    });

    settingsPanel.querySelector('[data-cc-delete-account]').addEventListener('click', () => {
      window.CCFirebase?.deleteCurrentAccount?.();
    });
  }

  function authModal() {
    return document.getElementById('loginModal') || document.querySelector('[data-cc-auth-modal]');
  }

  function ensureAuthModal() {
    const existing = authModal();
    if (existing) return existing;

    const modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.className = 'cc-auth-modal';
    modal.dataset.ccAuthModal = 'true';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'ccAuthTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <section class="cc-auth-dialog">
        <div class="cc-auth-dialog__head">
          <div>
            <h2 id="ccAuthTitle" data-auth-title>Đăng nhập</h2>
            <p data-auth-subtitle>Tiếp tục hành trình học tiếng Trung.</p>
          </div>
          <button class="cc-shell__icon-button" id="modalClose" type="button" aria-label="Đóng đăng nhập">${svg('close')}</button>
        </div>
        <div data-cc-auth-required-note class="cc-auth-required-note" hidden></div>
        <div data-remembered-accounts></div>
        <button class="cc-auth-google" id="googleLogin" type="button">Tiếp tục với Google</button>
        <div class="cc-auth-divider">hoặc email</div>
        <form id="loginForm" novalidate>
          <label>Email
            <input id="emailInput" type="email" autocomplete="email" required />
          </label>
          <label>Mật khẩu
            <input id="passwordInput" type="password" autocomplete="current-password" required />
          </label>
          <button class="cc-auth-primary" type="submit">Đăng nhập</button>
        </form>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function setAuthModeLogin(modal) {
    modal.querySelectorAll('[data-auth-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.authPanel === 'login');
    });
    const title = modal.querySelector('[data-auth-title]');
    if (title) title.textContent = 'Chào mừng trở lại!';
    const subtitle = modal.querySelector('[data-auth-subtitle]');
    if (subtitle) subtitle.textContent = 'Đăng nhập để tiếp tục hành trình học.';
  }

  function openLogin(options = {}) {
    const modal = ensureAuthModal();
    if (options.returnUrl) {
      try { sessionStorage.setItem(AUTH_RETURN_KEY, new URL(options.returnUrl, location.href).href); } catch (_) {}
    }
    const note = modal.querySelector('[data-cc-auth-required-note]');
    if (note) {
      note.hidden = !options.reason;
      note.textContent = options.reason || '';
    }
    setAuthModeLogin(modal);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cc-auth-modal-open');
    requestAnimationFrame(() => {
      modal.querySelector('[data-remembered-account], #emailInput, #loginEmail, input[type="email"]')?.focus();
    });
  }

  function closeLogin() {
    const modal = authModal();
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cc-auth-modal-open');
    try { sessionStorage.removeItem(AUTH_RETURN_KEY); } catch (_) {}
  }

  function bindAuthModal() {
    const modal = ensureAuthModal();
    if (modal.dataset.ccShellBound === 'true') return;
    modal.dataset.ccShellBound = 'true';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', String(!modal.classList.contains('open')));
    modal.querySelector('#modalClose, [data-modal-close]')?.addEventListener('click', closeLogin);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeLogin();
    });
  }

  function waitForFirebase(timeoutMs = 10000) {
    if (window.CCFirebase) return Promise.resolve(window.CCFirebase);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener('firebase-ready', ready);
        resolve(window.CCFirebase || null);
      }, timeoutMs);
      function ready() {
        clearTimeout(timer);
        resolve(window.CCFirebase || null);
      }
      window.addEventListener('firebase-ready', ready, { once: true });
    });
  }

  async function requireAuth(targetUrl, options = {}) {
    const target = new URL(targetUrl || 'hsk-placement.html', location.href).href;
    const firebase = await waitForFirebase();
    if (!firebase) {
      showToast('Firebase Auth chưa sẵn sàng. Vui lòng thử lại.', 'error');
      return false;
    }
    await (firebase.authReady || window.authReady);
    if (firebase.getCurrentUser?.()) {
      if (options.navigate !== false) location.assign(target);
      return true;
    }
    openLogin({
      returnUrl: target,
      reason: options.reason || 'Vui lòng đăng nhập để làm Test trình độ HSK.'
    });
    return false;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('vi-VN');
  }

  function renderAvatar(host, user) {
    host.replaceChildren();
    if (user?.photoURL) {
      const image = document.createElement('img');
      image.src = user.photoURL;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        host.textContent = (user.displayName || user.email || 'CC').slice(0, 2).toUpperCase();
      }, { once: true });
      host.appendChild(image);
      return;
    }
    host.textContent = (user?.displayName || user?.email || 'CC').slice(0, 2).toUpperCase();
  }

  function syncAccount(detail = {}) {
    currentUser = detail.user ?? window.CCFirebase?.getCurrentUser?.() ?? currentUser;
    currentStats = detail.stats ?? window.CCFirebase?.getCurrentStats?.() ?? currentStats ?? {};
    const status = detail.authStatus || window.CCFirebase?.getAuthStatus?.();
    authResolved = Boolean(window.CCFirebase?.isAuthReady?.() || ['authenticated', 'unauthenticated'].includes(status));

    const account = shell.querySelector('.cc-shell__account');
    const authButton = shell.querySelector('[data-cc-shell-auth]');
    const authCopy = authButton.querySelector('.cc-shell__footer-copy');
    const userName = shell.querySelector('[data-cc-shell-name]');
    const email = shell.querySelector('[data-cc-shell-email]');
    const avatar = shell.querySelector('[data-cc-shell-avatar]');
    const vip = shell.querySelector('[data-cc-shell-vip]');
    const adminLink = shell.querySelector('[data-cc-admin-link]');

    account.setAttribute('aria-busy', String(!authResolved));
    authButton.disabled = !authResolved;
    renderAvatar(avatar, currentUser);

    if (!authResolved) {
      userName.textContent = 'Đang kiểm tra phiên…';
      email.textContent = 'Vui lòng chờ';
      authCopy.textContent = 'Đang kiểm tra…';
      authButton.dataset.state = 'loading';
    } else if (currentUser) {
      userName.textContent = currentUser.displayName || 'Học viên Cam & Coca';
      email.textContent = currentUser.email || 'Tài khoản đã xác thực';
      authCopy.textContent = 'Đăng xuất';
      authButton.dataset.state = 'authenticated';
    } else {
      userName.textContent = 'Khách';
      email.textContent = 'Đăng nhập để đồng bộ tiến độ';
      authCopy.textContent = 'Đăng nhập';
      authButton.dataset.state = 'guest';
    }

    shell.querySelector('[data-cc-shell-xp]').textContent = formatNumber(currentUser ? currentStats.xp : 0);
    shell.querySelector('[data-cc-shell-coins]').textContent = formatNumber(currentUser ? currentStats.coins : 0);
    vip.hidden = !isVipActive();
    adminLink.hidden = currentUser?.email !== 'nqthanhforwork@gmail.com';
    syncSettings();
  }

  function bindShell() {
    shell.querySelector('.cc-shell__menu').addEventListener('click', () => setExpanded(!shell.classList.contains('is-expanded'), { focusOrigin: document.activeElement }));
    mobileToggle.addEventListener('click', () => setExpanded(!shell.classList.contains('is-expanded'), { focusOrigin: mobileToggle, focusFirst: true }));
    scrim.addEventListener('click', () => setExpanded(false));

    shell.addEventListener('click', (event) => {
      if (!shell.classList.contains('is-expanded') && !event.target.closest('a, button')) {
        setExpanded(true, { focusOrigin: document.activeElement });
        return;
      }
      const navLink = event.target.closest('.cc-shell__link[href]');
      if (navLink && isMobile()) setExpanded(false, { restoreFocus: false });
    });

    shell.querySelector('[data-cc-shell-auth]').addEventListener('click', async () => {
      if (!authResolved) return;
      if (!currentUser) {
        openLogin();
        return;
      }
      try {
        await window.CCFirebase?.logout?.();
        showToast('Đã đăng xuất.');
        if (currentPageKey() === 'placement') location.replace('index.html');
      } catch (error) {
        showToast(error?.message || 'Không đăng xuất được.', 'error');
      }
    });

    document.addEventListener('click', (event) => {
      const gated = event.target.closest('a[href*="hsk-placement.html"], [data-placement-direct], [data-cc-auth-required="true"]');
      if (!gated || gated.target === '_blank' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requireAuth(gated.href || gated.dataset.href || 'hsk-placement.html');
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const modal = authModal();
        if (modal && (
          modal.classList.contains('open')
          || modal.getAttribute('aria-hidden') === 'false'
          || document.body.classList.contains('cc-auth-modal-open')
        )) {
          closeLogin();
          return;
        }
        if (settingsPanel?.classList.contains('is-open')) {
          closeSettings();
          return;
        }
        if (shell.classList.contains('is-expanded')) setExpanded(false);
        return;
      }
      if (event.key !== 'Tab' || !isMobile() || !shell.classList.contains('is-expanded')) return;
      const focusable = [...shell.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])')]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!shell.classList.contains('is-expanded')) return;
      if (event.target.closest('#ccAccountShell, .cc-shell-mobile-toggle, [data-cc-auth-modal], #loginModal')) return;
      setExpanded(false, { restoreFocus: false });
    });

    window.addEventListener('resize', () => {
      if (!isMobile()) {
        document.body.classList.remove('cc-shell-mobile-open');
        scrim.classList.remove('is-visible');
        shell.removeAttribute('inert');
        shell.setAttribute('aria-hidden', 'false');
      } else {
        document.body.classList.remove('cc-shell-expanded');
        shell.toggleAttribute('inert', !shell.classList.contains('is-expanded'));
        shell.setAttribute('aria-hidden', String(!shell.classList.contains('is-expanded')));
      }
    }, { passive: true });

    window.addEventListener('cc:auth-ready', (event) => syncAccount(event.detail || {}));
    window.addEventListener('cc:user-stats', (event) => syncAccount(event.detail || {}));
    window.addEventListener('cc-auth-state-changed', (event) => syncAccount(event.detail || {}));
    window.addEventListener('firebase-ready', () => syncAccount());
    window.addEventListener('cc:darkmode', syncSettings);
    window.addEventListener('cc:appearancechange', syncSettings);
  }

  function initialize() {
    ensureStylesheet();
    markLegacyHeader();
    removeDuplicateProfileSettings();
    createShell();
    bindShell();
    bindSettings();
    bindAuthModal();
    syncAccount();
    shell.toggleAttribute('inert', isMobile());
    shell.setAttribute('aria-hidden', String(isMobile()));
  }

  window.CCSiteShell = Object.freeze({
    open: () => setExpanded(true, { focusOrigin: document.activeElement, focusFirst: true }),
    close: () => setExpanded(false),
    openSettings,
    openLogin,
    closeLogin,
    requireAuth,
    sync: syncAccount
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
