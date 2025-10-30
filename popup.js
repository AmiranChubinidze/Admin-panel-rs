const licenseScreen = document.getElementById("license-screen");
const successScreen = document.getElementById("success-screen");
const status = document.getElementById("status");
const activeKeyTag = document.getElementById("activeKey");
const panelToggleContainer = document.getElementById("panel-toggle");
const toggleCheckbox = document.getElementById("togglePanelCheckbox");

// Show success UI
function showSuccess(key) {
  licenseScreen.classList.add("hidden");      // Hide activation form
  successScreen.classList.add("active");      // Show success message
  activeKeyTag.textContent = `🔑 ${key}`;
  panelToggleContainer.classList.remove("hidden"); // Reveal panel toggle
}

// Unified Device ID
async function getDeviceId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["deviceId"], (result) => {
      if (result.deviceId) return resolve(result.deviceId);
      const newId = crypto.randomUUID();
      chrome.storage.local.set({ deviceId: newId }, () => resolve(newId));
    });
  });
}

// Validate license
async function validateKey(userKey) {
  const key = userKey.trim().toUpperCase();
  const deviceId = await getDeviceId();
  try {
    const res = await fetch("https://server-m02g.onrender.com/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, deviceId })
    });
    return await res.json();
  } catch (err) {
    console.error("Validation error:", err);
    return { valid: false, message: "Server unreachable" };
  }
}

// Check stored key on startup
async function checkStoredKey() {
  chrome.storage.local.get(["licenseKey"], async (res) => {
    const storedKey = res.licenseKey;
    if (!storedKey) return;

    status.textContent = "⏳ ვამოწმებ შენახულ კოდს...";
    status.style.color = "orange";

    const response = await validateKey(storedKey);
    if (response.valid) {
      showSuccess(storedKey);
      status.textContent = "";
    } else {
      chrome.storage.local.remove("licenseKey", () => {});
      status.textContent = "❌ კოდი გაუქმებულია ან არასწორია.";
      status.style.color = "red";
      licenseScreen.classList.remove("hidden");
      successScreen.classList.remove("active");
      panelToggleContainer.classList.add("hidden");
    }
  });
}
checkStoredKey();

// Handle manual activation
document.getElementById("submitKey").addEventListener("click", async () => {
  const keyInput = document.getElementById("licenseKey");
  const key = keyInput.value.trim();

  if (!key) {
    status.textContent = "❌ შეიყვანეთ კოდი!";
    status.style.color = "red";
    return;
  }

  status.textContent = "⏳ ვამოწმებ...";
  status.style.color = "orange";

  const response = await validateKey(key);
  if (!response) {
    status.textContent = "❌ No response from server!";
    status.style.color = "red";
    return;
  }

  if (response.valid) {
    status.textContent = "✅ გააქტიურებულია!";
    status.style.color = "lightgreen";
    chrome.storage.local.set({ licenseKey: key.toUpperCase() }, () => {
      setTimeout(() => showSuccess(key.toUpperCase()), 250);
    });
  } else {
    status.textContent = response.message || "❌ კოდი არასწორია.";
    status.style.color = "red";
  }
});

// ==== Panel toggle ====
chrome.storage.local.get(["licenseKey"], (res) => {
  if (res.licenseKey) panelToggleContainer.classList.remove("hidden");
});

chrome.storage.local.get(["panelEnabled"], (res) => {
  toggleCheckbox.checked = res.panelEnabled ?? true;
});

toggleCheckbox.addEventListener("change", () => {
  const enabled = toggleCheckbox.checked;
  chrome.storage.local.set({ panelEnabled: enabled });
  chrome.runtime.sendMessage({ action: enabled ? "enablePanel" : "disablePanel" });
});
