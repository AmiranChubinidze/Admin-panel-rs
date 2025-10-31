const API_BASE = "https://server-m02g.onrender.com";
const REFRESH_ALARM = "amnairi-token-refresh";
const REFRESH_INTERVAL_MINUTES = 30;
const REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

const storageGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (values) =>
  new Promise((resolve) => chrome.storage.local.set(values, resolve));
const storageRemove = (keys) =>
  new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  try {
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "="));
    return JSON.parse(json);
  } catch (err) {
    console.warn("Failed to decode JWT:", err);
    return null;
  }
}

async function getAccountState() {
  const data = await storageGet([
    "mainAccount",
    "subAccounts",
    "selectedAccount",
  ]);
  const mainAccount = data.mainAccount ?? null;
  const subAccounts = Array.isArray(data.subAccounts)
    ? data.subAccounts.filter((acc) => acc?.token && acc?.label)
    : [];
  return {
    mainAccount,
    subAccounts,
    selectedAccount: data.selectedAccount ?? mainAccount?.token ?? null,
  };
}

async function saveAccountState(state) {
  const payload = {
    mainAccount: state.mainAccount ?? null,
    subAccounts: Array.isArray(state.subAccounts) ? state.subAccounts : [],
    selectedAccount: state.selectedAccount ?? null,
  };
  await storageSet(payload);
}

async function migratePanelState(oldToken, newToken) {
  if (!oldToken || !newToken || oldToken === newToken) return;
  const data = await storageGet(["panelState"]);
  const map = data?.panelState;
  if (!map || !map[oldToken] || map[newToken]) return;
  map[newToken] = map[oldToken];
  delete map[oldToken];
  await storageSet({ panelState: map });
}

async function invalidateToken(badToken, reason) {
  const state = await getAccountState();
  let changed = false;

  if (state.mainAccount?.token === badToken) {
    await storageRemove(["mainAccount", "subAccounts", "selectedAccount"]);
    changed = true;
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "სესია დასრულდა",
      message: reason || "გთხოვთ, გაიაროთ ავტორიზაცია თავიდან.",
    });
    chrome.tabs.query({ url: "*://*.rs.ge/*" }, (tabs) => {
      tabs.forEach((tab) =>
        chrome.tabs.sendMessage(tab.id, { action: "logoutRequired" })
      );
    });
    return;
  }

  const remaining = state.subAccounts.filter((acc) => acc.token !== badToken);
  if (remaining.length !== state.subAccounts.length) {
    state.subAccounts = remaining;
    if (state.selectedAccount === badToken) {
      state.selectedAccount =
        state.mainAccount?.token || remaining[0]?.token || null;
    }
    await saveAccountState(state);
    changed = true;
  }

  if (changed && reason) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "ქვე-ანგარიში გათიშულია",
      message: reason,
    });
  }
}

function shouldRefreshToken(token) {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  const expiresAt = payload.exp * 1000;
  const remaining = expiresAt - Date.now();
  return remaining <= REFRESH_THRESHOLD_MS;
}

async function requestTokenRefresh(token) {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (response.status === 401) {
    throw new Error("Token expired or revoked");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Refresh failed");
  }
  const payload = await response.json();
  if (!payload?.newToken) {
    throw new Error("Refresh response missing token");
  }
  return payload.newToken;
}

async function refreshExpiringTokens() {
  const state = await getAccountState();
  if (!state.mainAccount?.token) return;

  let stateChanged = false;
  let stateInvalidated = false;

  const accounts = [
    { kind: "main", index: -1, token: state.mainAccount.token },
    ...state.subAccounts.map((acc, index) => ({
      kind: "sub",
      index,
      token: acc.token,
    })),
  ];

  for (const account of accounts) {
    if (!account.token) continue;
    if (!shouldRefreshToken(account.token)) continue;

    try {
      const newToken = await requestTokenRefresh(account.token);
      await migratePanelState(account.token, newToken);
      if (account.kind === "main") {
        state.mainAccount.token = newToken;
        if (state.selectedAccount === account.token) {
          state.selectedAccount = newToken;
        }
      } else if (state.subAccounts[account.index]) {
        state.subAccounts[account.index].token = newToken;
        if (state.selectedAccount === account.token) {
          state.selectedAccount = newToken;
        }
      }
      stateChanged = true;
    } catch (err) {
      await invalidateToken(
        account.token,
        account.kind === "main"
          ? "მთავარი ანგარიში გაუქმდა ან ვადაგასულია."
          : "ქვე-ანგარიშის სესია ვადაგასულია."
      );
      stateInvalidated = true;
      if (account.kind === "main") {
        return;
      }
      break;
    }
  }

  if (stateInvalidated) {
    return;
  }

  if (stateChanged) {
    await saveAccountState(state);
  }
}

async function getActiveAccount() {
  const state = await getAccountState();
  const activeToken =
    state.selectedAccount ||
    state.mainAccount?.token ||
    state.subAccounts[0]?.token ||
    null;

  if (!activeToken) return null;

  if (state.mainAccount?.token === activeToken) {
    return { token: state.mainAccount.token, label: state.mainAccount.label };
  }
  const sub = state.subAccounts.find((acc) => acc.token === activeToken);
  if (sub) return { token: sub.token, label: sub.label };
  if (state.mainAccount) {
    await storageSet({ selectedAccount: state.mainAccount.token });
    return { token: state.mainAccount.token, label: state.mainAccount.label };
  }
  return null;
}

async function fetchWaybillTotal(token, month) {
  const response = await fetch(`${API_BASE}/waybill/total`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, month }),
  });

  if (response.status === 401) {
    await invalidateToken(token, "სესია ვეღარ დადასტურდა.");
    throw new Error("სესია აღარ არის აქტიური.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "გზავნა ვერ შესრულდა");
  }

  const payload = await response.json();
  if (typeof payload.total !== "number") {
    throw new Error("მიმდინარე ჯამი ვერ დაითვალა");
  }
  return payload.total;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: REFRESH_INTERVAL_MINUTES,
  });
  refreshExpiringTokens().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: REFRESH_INTERVAL_MINUTES,
  });
  refreshExpiringTokens().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshExpiringTokens().catch((err) =>
      console.warn("Token refresh alarm failed:", err)
    );
  }
});

const attachedTabs = new Set();
const dialogHandlers = new Map();

async function attachDebuggerToTab(tabId) {
  if (attachedTabs.has(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {}

  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
  } catch (error) {
    console.error("Attach debugger failed:", error);
    return;
  }

  const handler = (source, method, params) => {
    if (source.tabId === tabId && method === "Page.javascriptDialogOpening") {
      chrome.debugger
        .sendCommand(
          { tabId },
          "Page.handleJavaScriptDialog",
          { accept: true }
        )
        .catch(() => {});
    }
  };

  chrome.debugger.onEvent.addListener(handler);
  dialogHandlers.set(tabId, handler);
  attachedTabs.add(tabId);

  const onRemoved = (removedTabId) => {
    if (removedTabId === tabId) {
      detachDebuggerFromTab(tabId);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }
  };
  chrome.tabs.onRemoved.addListener(onRemoved);
}

function detachDebuggerFromTab(tabId) {
  try {
    chrome.debugger.detach({ tabId });
  } catch (_) {}
  const handler = dialogHandlers.get(tabId);
  if (handler) {
    chrome.debugger.onEvent.removeListener(handler);
    dialogHandlers.delete(tabId);
  }
  attachedTabs.delete(tabId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.action) {
      case "attachDebugger": {
        const tabId = sender?.tab?.id ?? message?.tabId;
        if (typeof tabId === "number") {
          await attachDebuggerToTab(tabId);
        }
        break;
      }

      case "getActiveAccount": {
        const account = await getActiveAccount();
        sendResponse(account ?? {});
        return;
      }

      case "fetchWaybillTotal": {
        try {
          const { token, month } = message;
          if (!token) throw new Error("Token is missing");
          const total = await fetchWaybillTotal(token, month);
          sendResponse({ ok: true, total });
        } catch (err) {
          sendResponse({ ok: false, message: err.message || "არასრულად გამოთვლილი" });
        }
        return;
      }

      case "stopAutomation": {
        chrome.tabs.query({ url: "*://*.rs.ge/*" }, (tabs) => {
          tabs.forEach((tab) =>
            chrome.tabs.sendMessage(tab.id, { action: "stopAutomation" })
          );
        });
        break;
      }

      case "refreshTokensNow": {
        await refreshExpiringTokens();
        break;
      }

      default:
        break;
    }
  })();
  return true;
});
