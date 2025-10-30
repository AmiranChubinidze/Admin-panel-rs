const API = "https://server-m02g.onrender.com/validate";

// ----------------- Device ID (unified) -----------------
async function getDeviceId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["deviceId"], (res) => {
      if (res.deviceId) return resolve(res.deviceId);
      const id = crypto.randomUUID(); // unified format
      chrome.storage.local.set({ deviceId: id }, () => resolve(id));
    });
  });
}

// ----------------- License Validation -----------------
async function validateKey(key) {
  const deviceId = await getDeviceId();
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, deviceId })
    });
    const json = await r.json();

    if (json.valid) {
      await chrome.storage.local.set({ licenseKey: key });
      console.log("✅ License saved:", key);
    } else {
      await chrome.storage.local.remove("licenseKey");
      console.warn("❌ License invalid or revoked:", json.message);
    }
    return json;
  } catch (err) {
    console.error("License validation failed:", err);
    return { valid: false, error: err.message };
  }
}

// ----------------- Periodic License Check (MV3-safe) -----------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("licenseCheck", { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("licenseCheck", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "licenseCheck") return;

  chrome.storage.local.get(["licenseKey"], async ({ licenseKey }) => {
    if (!licenseKey) return;

    const deviceId = await getDeviceId();
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey, deviceId })
      });
      const data = await r.json();

      if (!data.valid) {
        console.warn("License revoked or invalid:", data.message);
        await chrome.storage.local.remove("licenseKey");

        // Notify and stop only RS.ge tabs
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "License revoked",
          message: "Your license has been revoked. Automation stopped."
        });

        chrome.tabs.query({ url: "*://*.rs.ge/*" }, (tabs) => {
          tabs.forEach((tab) =>
            chrome.tabs.sendMessage(tab.id, { action: "stopAutomation" })
          );
        });
      }
    } catch (err) {
      console.error("License check failed:", err);
    }
  });
});

// ----------------- Debugger attach (no stacking) -----------------
const attachedTabs = new Set();
const dialogHandlers = new Map(); // tabId -> handler

async function attachDebuggerToTab(tabId) {
  if (attachedTabs.has(tabId)) return; // already attached

  // Ensure clean slate
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {}

  chromedebugger_attach: {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
    } catch (e) {
      console.error("Attach failed:", e?.message || e);
      break chromedebugger_attach;
    }

    await chrome.debugger.sendCommand({ tabId }, "Page.enable");

    const handler = (source, method, params) => {
      if (source.tabId === tabId && method === "Page.javascriptDialogOpening") {
        console.log("✅ Auto-accepting RS.ge popup:", params.message);
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

    // Cleanup when tab closes
    const onRemoved = (removedTabId) => {
      if (removedTabId === tabId) {
        detachDebuggerFromTab(tabId);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      }
    };
    chrome.tabs.onRemoved.addListener(onRemoved);
  }
}

function detachDebuggerFromTab(tabId) {
  try {
    chrome.debugger.detach({ tabId }, () => {});
  } catch (_) {}
  const handler = dialogHandlers.get(tabId);
  if (handler) {
    chrome.debugger.onEvent.removeListener(handler);
    dialogHandlers.delete(tabId);
  }
  attachedTabs.delete(tabId);
}

// ----------------- Single onMessage handler -----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.action) {
      case "attachDebugger": {
        const tabId = sender?.tab?.id || msg?.tabId;
        if (typeof tabId === "number") {
          await attachDebuggerToTab(tabId);
        }
        break;
      }

      case "stopAutomation": {
        await chrome.storage.local.remove("licenseKey");
        chrome.tabs.query({ url: "*://*.rs.ge/*" }, (tabs) => {
          tabs.forEach((tab) =>
            chrome.tabs.sendMessage(tab.id, { action: "stopAutomation" })
          );
        });
        break;
      }

      case "validate-key": {
        const result = await validateKey(msg.key);
        sendResponse(result);
        return; // keep channel open (we’re returning early)
      }

      default:
        break;
    }
  })();
  return true; // async
});

// === Handle panel toggle messages from popup ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "enablePanel" || msg.action === "disablePanel") {
    const visible = msg.action === "enablePanel";

    // Send toggle command only to RS.ge tabs
    chrome.tabs.query({ url: "*://*.rs.ge/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          action: "togglePanelVisibility",
          visible,
        });
      });
    });
  }
});

