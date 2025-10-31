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

async function login(username, password) {
  showMessage(loginStatus, "");
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ su: username, sp: password }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || "ავტორიზაცია ვერ შესრულდა.");
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
    showMessage(mainStatus, "ავტორიზაცია წარმატებით დასრულდა.", false);
    setTimeout(() => showMessage(mainStatus, ""), 1500);
  } catch (error) {
    showMessage(loginStatus, error.message || "ავტორიზაცია ვერ შესრულდა.", true);
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
      body: JSON.stringify({ token: currentRefreshToken || undefined }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || "Token refresh failed");
    }
    const payload = await response.json();
    if (!payload?.token) {
      throw new Error("Refresh payload is invalid");
    }
    const now = Date.now();
    await storageSet({
      token: payload.token,
      refreshToken: payload.refreshToken ?? null,
      loginTime: now,
      user: payload.user ?? null,
    });
    return payload;
  } catch (error) {
    await storageRemove(["token", "refreshToken", "loginTime", "user"]);
    throw error;
  }
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
