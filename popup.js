// popup.js
const API_BASE = "https://amnairi-rs-server.onrender.com";

const authView = document.getElementById("auth-view");
const mainView = document.getElementById("main-view");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const mainStatus = document.getElementById("main-status");
const rememberCheckbox = document.getElementById("login-remember");
const mainUsername = document.getElementById("main-username");
const openWaybillsBtn = document.getElementById("open-waybills");
const openDeclarationsBtn = document.getElementById("open-declarations");
const logoutBtn = document.getElementById("logout-btn");

const storageGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (values) =>
  new Promise((resolve) => chrome.storage.local.set(values, resolve));
const storageRemove = (keys) =>
  new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STATUS_AUTO_CLEAR_MS = 1500;
const GENERIC_LOGIN_ERROR = "Unable to log in. Please try again.";
const GENERIC_REFRESH_ERROR = "Token refresh failed.";
const LOGIN_SUCCESS_MESSAGE = "Signed in successfully.";

function fadeTo(view) {
  [authView, mainView].forEach((section) => section.classList.remove("active"));
  view.classList.add("active");
}

function showMessage(element, message, isError = true) {
  if (!element) return;
  element.textContent = message || "";
  element.style.color = isError ? "#d93025" : "#15803d";
  element.classList.toggle("visible", Boolean(message));
}

async function requestJson(url, options, statusElement) {
  if (statusElement) {
    showMessage(statusElement, "");
  }
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let message = text?.trim();
      if (message) {
        try {
          const parsed = JSON.parse(message);
          if (parsed && typeof parsed === "object" && "message" in parsed) {
            message = parsed.message;
          }
        } catch {
          // leave message as plain text
        }
      }
      if (!message) {
        message = `HTTP ${response.status}`;
      }
      if (statusElement) {
        showMessage(statusElement, message, true);
      }
      return null;
    }
    try {
      return await response.json();
    } catch {
      if (statusElement) {
        showMessage(statusElement, "Invalid server response", true);
      }
      return null;
    }
  } catch (error) {
    if (statusElement) {
      showMessage(statusElement, error?.message || "Network error", true);
    }
    return null;
  }
}

async function login(username, password) {
  showMessage(loginStatus, "");
  const payload = await requestJson(
    `${API_BASE}/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ su: username, sp: password }),
    },
    null
  );
  if (!payload) {
    return;
  }
  if (!payload?.success) {
    showMessage(loginStatus, payload?.message || GENERIC_LOGIN_ERROR, true);
    return;
  }

  const now = Date.now();
  await storageSet({
    token: payload.token,
    refreshToken: payload.refreshToken ?? null,
    user: payload.user,
    loginTime: now,
  });
  populateMain(payload.user);
  fadeTo(mainView);
  showMessage(mainStatus, LOGIN_SUCCESS_MESSAGE, false);
  setTimeout(() => showMessage(mainStatus, ""), STATUS_AUTO_CLEAR_MS);
}
async function verifyToken(token) {
  const payload = await requestJson(
    `${API_BASE}/verify`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
    null
  );
  if (!payload?.valid) {
    return null;
  }
  return payload.user;
}
async function refreshToken(currentRefreshToken, statusElement = mainStatus) {
  const payload = await requestJson(
    `${API_BASE}/refresh`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: currentRefreshToken || undefined }),
    },
    statusElement
  );

  if (!payload) {
    await storageRemove(["token", "refreshToken", "loginTime", "user"]);
    throw new Error(GENERIC_REFRESH_ERROR);
  }

  if (!payload?.token) {
    showMessage(mainStatus, payload?.message || GENERIC_REFRESH_ERROR, true);
    await storageRemove(["token", "refreshToken", "loginTime", "user"]);
    throw new Error(payload?.message || GENERIC_REFRESH_ERROR);
  }

  const now = Date.now();
  await storageSet({
    token: payload.token,
    refreshToken: payload.refreshToken ?? null,
    loginTime: now,
    user: payload.user ?? null,
  });
  return payload;
}
function populateMain(user) {
  const name = user?.name || user?.su || "უცნობი მომხმარებელი";
  mainUsername.textContent = `მომხმარებელი: ${name}`;
}

async function initialize() {
  showMessage(loginStatus, "");
  showMessage(mainStatus, "");

  const { token, refreshToken, loginTime, user } = await storageGet([
    "token",
    "refreshToken",
    "loginTime",
    "user",
  ]);

  if (!token) {
    fadeTo(authView);
    return;
  }

  const verifiedUser = await verifyToken(token);
  if (!verifiedUser) {
    await storageRemove(["token", "refreshToken", "loginTime", "user"]);
    fadeTo(authView);
    return;
  }

  try {
    if (typeof loginTime === "number" && Date.now() - loginTime > REFRESH_INTERVAL_MS) {
      const refreshed = await refreshToken(refreshToken);
      populateMain(refreshed?.user ?? verifiedUser);
    } else {
      await storageSet({ user: verifiedUser });
      populateMain(verifiedUser);
    }
    fadeTo(mainView);
  } catch (error) {
    console.warn("Token refresh failed:", error);
    fadeTo(authView);
  }
}

async function handleLogout() {
  await storageRemove(["token", "refreshToken", "loginTime", "user"]);
  showMessage(mainStatus, "გამოსვლა შესრულდა.", false);
  setTimeout(() => {
    showMessage(mainStatus, "");
    fadeTo(authView);
  }, 900);
}

function notifyPanel(target) {
  const mapped = target === "declarations" ? "declarations" : "invoices";
  chrome.runtime.sendMessage({ action: "focusPanel", target: mapped }).catch(() => {});
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = event.target.username.value.trim();
  const password = event.target.password.value;

  if (!username || !password) {
    showMessage(loginStatus, "გთხოვთ, შეავსოთ სავალდებულო ველები.", true);
    return;
  }

  await login(username, password);
});

openWaybillsBtn.addEventListener("click", () => {
  notifyPanel("invoices");
  showMessage(mainStatus, "ზედნადებების პანელი გააქტიურდა.", false);
  setTimeout(() => showMessage(mainStatus, ""), 1500);
});

openDeclarationsBtn.addEventListener("click", () => {
  notifyPanel("declarations");
  showMessage(mainStatus, "დეკლარაციების პანელი გააქტიურდა.", false);
  setTimeout(() => showMessage(mainStatus, ""), 1500);
});

logoutBtn.addEventListener("click", handleLogout);

window.addEventListener("DOMContentLoaded", initialize);


