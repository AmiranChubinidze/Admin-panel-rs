const API_BASE = "https://server-m02g.onrender.com";

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

function fadeTo(view) {
  [authView, mainView].forEach((section) => {
    section.classList.remove("active");
  });
  view.classList.add("active");
}

function showMessage(el, message, isError = true) {
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#d93025" : "#15803d";
  el.classList.toggle("visible", Boolean(message));
}

async function login(username, password, remember) {
  showMessage(loginStatus, "");
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || "ავტორიზაცია ვერ მოხერხდა.");
    }

    const now = Date.now();
    await storageSet({
      token: payload.token,
      refreshToken: payload.refreshToken,
      user: payload.user,
      loginTime: now,
      remember,
    });
    populateMain(payload.user);
    fadeTo(mainView);
  } catch (error) {
    showMessage(loginStatus, error.message || "ვერ შევძელით ავტორიზაცია.", true);
  }
}

async function verifyToken(token) {
  try {
    const response = await fetch(`${API_BASE}/verify`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.valid ? payload.user : null;
  } catch {
    return null;
  }
}

async function refreshToken(currentRefreshToken) {
  try {
    const response = await fetch(`${API_BASE}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    if (!response.ok) throw new Error("Refresh failed");
    const payload = await response.json();
    if (!payload?.token || !payload?.refreshToken) {
      throw new Error("Invalid refresh payload");
    }
    const now = Date.now();
    await storageSet({
      token: payload.token,
      refreshToken: payload.refreshToken,
      loginTime: now,
    });
    return payload;
  } catch (error) {
    await storageRemove(["token", "refreshToken", "loginTime", "user", "remember"]);
    throw error;
  }
}

function populateMain(user) {
  const name = user?.name || user?.email || "მომხმარებელი";
  mainUsername.textContent = `👤 შესული ხართ როგორც ${name}`;
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
    await storageRemove(["token", "refreshToken", "loginTime", "user", "remember"]);
    fadeTo(authView);
    return;
  }

  try {
    if (typeof loginTime === "number" && Date.now() - loginTime > REFRESH_INTERVAL_MS) {
      const refreshed = await refreshToken(refreshToken);
      if (refreshed?.user) {
        await storageSet({ user: refreshed.user });
        populateMain(refreshed.user);
      } else {
        populateMain(verifiedUser);
      }
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
  await storageRemove(["token", "refreshToken", "loginTime", "user", "remember"]);
  showMessage(mainStatus, "სესია დასრულდა.", false);
  setTimeout(() => {
    showMessage(mainStatus, "");
    fadeTo(authView);
  }, 800);
}

function notifyPanel(target) {
  chrome.runtime.sendMessage({ action: "focusPanel", target }).catch(() => {});
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = event.target.username.value.trim();
  const password = event.target.password.value;
  const remember = rememberCheckbox.checked;
  if (!username || !password) {
    showMessage(loginStatus, "გთხოვთ შეავსოთ ორივე ველი.", true);
    return;
  }
  showMessage(loginStatus, "");
  await login(username, password, remember);
});

openWaybillsBtn.addEventListener("click", () => {
  notifyPanel("waybills");
  showMessage(mainStatus, "ზედნადებების პანელი გახსნილია.", false);
  setTimeout(() => showMessage(mainStatus, ""), 1500);
});

openDeclarationsBtn.addEventListener("click", () => {
  notifyPanel("declarations");
  showMessage(mainStatus, "დეკლარაციების პანელი გახსნილია.", false);
  setTimeout(() => showMessage(mainStatus, ""), 1500);
});

logoutBtn.addEventListener("click", handleLogout);

window.addEventListener("DOMContentLoaded", initialize);
