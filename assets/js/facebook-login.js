console.log("[FB LOGIN] file loaded");
import {
  FacebookAuthProvider,
  signInWithPopup,
  signInWithRedirect
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const FACEBOOK_BUTTON_SELECTOR = "#facebook-login-btn, [data-facebook-login]";
const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope("email");

let loginInProgress = false;

function getFacebookButtons() {
  return [...document.querySelectorAll(FACEBOOK_BUTTON_SELECTOR)];
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function getMessage(error) {
  const messages = {
    "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập Facebook.",
    "auth/popup-blocked": "Trình duyệt đang chặn cửa sổ đăng nhập Facebook.",
    "auth/cancelled-popup-request": "Yêu cầu đăng nhập Facebook trước đó đã bị hủy.",
    "auth/account-exists-with-different-credential": "Email này đã được đăng ký bằng Google hoặc Email. Hãy đăng nhập bằng phương thức cũ trước.",
    "auth/unauthorized-domain": "Tên miền hiện tại chưa được cho phép đăng nhập Facebook.",
    "auth/network-request-failed": "Kết nối mạng không ổn định. Vui lòng thử lại.",
    "auth/operation-not-supported-in-this-environment": "Trình duyệt hiện tại không hỗ trợ đăng nhập Facebook."
  };
  return messages[error?.code] || "Không thể đăng nhập Facebook. Vui lòng thử lại.";
}

function showStatus(message, type = "error") {
  const status = document.getElementById("facebook-login-status");
  if (status) {
    status.textContent = message;
    status.dataset.type = type;
  }
  window.CCFirebase?.showToast?.(message, type);
}

function setBusy(busy) {
  getFacebookButtons().forEach((button) => {
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
    button.setAttribute("aria-busy", String(busy));
  });
}

function getSharedAuth() {
  if (window.CCFirebase?.auth) return Promise.resolve(window.CCFirebase);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("firebase-ready", onReady);
      reject(new Error("firebase_auth_not_ready"));
    }, 5000);
    const onReady = () => {
      window.clearTimeout(timeout);
      if (window.CCFirebase?.auth) resolve(window.CCFirebase);
      else reject(new Error("firebase_auth_not_ready"));
    };
    window.addEventListener("firebase-ready", onReady, { once: true });
  });
}

function canRedirect(shared) {
  return typeof shared.canUseRedirectAuth !== "function" || shared.canUseRedirectAuth();
}

async function signInWithFacebook() {
  if (loginInProgress) return;
  loginInProgress = true;
  setBusy(true);

  try {
    const shared = await getSharedAuth();
    const { auth } = shared;

    if (isMobileDevice()) {
      if (!canRedirect(shared)) {
        const error = new Error("redirect_storage_unavailable");
        error.code = "auth/operation-not-supported-in-this-environment";
        throw error;
      }
      showStatus("Đang chuyển tới Facebook...", "info");
      return signInWithRedirect(auth, facebookProvider);
    }

    try {
      await signInWithPopup(auth, facebookProvider);
    } catch (error) {
      const canFallbackToRedirect = error?.code === "auth/popup-blocked"
        || error?.code === "auth/operation-not-supported-in-this-environment";
      if (!canFallbackToRedirect || !canRedirect(shared)) throw error;
      showStatus("Đang chuyển tới Facebook...", "info");
      return signInWithRedirect(auth, facebookProvider);
    }
  } catch (error) {
    console.error("[facebook-login] Sign-in failed", error);
    showStatus(getMessage(error), "error");
  } finally {
    loginInProgress = false;
    setBusy(false);
  }
}

getFacebookButtons().forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    signInWithFacebook();
  });
});
