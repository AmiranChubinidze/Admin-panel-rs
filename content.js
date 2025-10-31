// Only run after license is present
chrome.storage.local.get(["licenseKey"], (res) => {
  if (!res.licenseKey) {
    console.log("⛔ No valid license — automation blocked.");
    return;
  }
  console.log("✅ License found — automation running.");
  injectPanel();
});

// Ask background to attach debugger ONCE for this tab
chrome.runtime.sendMessage({ action: "attachDebugger" });

// Guard to prevent overlapping runs
let automationInProgress = false;

// ----------------- UI + Automation -----------------
function injectPanel() {
  if (!document.body) {
    requestAnimationFrame(injectPanel);
    return;
  }

  // ---- PANEL HTML ----
  const panel = document.createElement("div");
  panel.id = "rs-panel";
  panel.innerHTML = `
    <div id="rs-panel-header">
      <span>Amnairi RS Assistant</span>
      <span id="rs-toggle">&#9660;</span>
    </div>
    <div id="rs-panel-body">
      <div id="rs-buttons">
        <button id="rs-start"><span>▶</span> Start</button>
        <button id="rs-stop"><span>⏹</span> Stop</button>
      </div>
      <div id="rs-options">
        <label title="ჩართვის შემთხვევაში ერთი ორგანიზაციის ყველა ზედნადები ერთიანად იგზავნება">
          <input type="checkbox" id="rs-use-checkall" />
          ყველას მონიშნვა, ერთ ორგანიზაციაზე
        </label>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ---- Extra styles for initial view and transitions ----
  (function ensureExtraStyles() {
    if (document.getElementById('rs-extra-styles')) return;
    const style = document.createElement('style');
    style.id = 'rs-extra-styles';
    style.textContent = `
      #rs-buttons-initial button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-bottom: 10px;
        width: 100%;
        padding: 9px 12px;
        background: linear-gradient(135deg, #0066cc, #004999);
        border: none;
        border-radius: 12px;
        color: white;
        font-weight: 600;
        font-size: 13px;
        transition: all 0.25s ease;
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
      }
      #rs-buttons-initial button:hover {
        background: linear-gradient(135deg, #005bb5, #003f82);
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 6px 12px rgba(0,0,0,0.25);
      }
      #rs-buttons-initial button:active {
        transform: translateY(0) scale(0.98);
      }
      .rs-section { transition: opacity 200ms ease, max-height 200ms ease, margin 200ms ease; overflow: hidden; }
      .rs-visible { opacity: 1; max-height: 1000px; margin-top: 0; }
      .rs-hidden { opacity: 0; max-height: 0; margin-top: 0; }
    `;
    document.head.appendChild(style);
  })();

  // ---- Apply initial visibility + react to popup toggle ----
  chrome.storage.local.get(["panelEnabled"], ({ panelEnabled }) => {
    const visible = panelEnabled !== false; // default: visible
    panel.style.display = visible ? "block" : "none";
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.panelEnabled) {
      const visible = changes.panelEnabled.newValue !== false;
      panel.style.display = visible ? "block" : "none";
    }
  });

  // ---- Restore position ----
  (function restorePanelPosition() {
    const savedPos = JSON.parse(localStorage.getItem("rs_panel_position"));
    if (savedPos && savedPos.left && savedPos.top) {
      panel.style.left = savedPos.left;
      panel.style.top = savedPos.top;
    } else {
      panel.style.left = "20px";
      panel.style.top = "20px";
    }
  })();

  // ---- Restore collapse state ----
  const toggleBtn = document.getElementById("rs-toggle");
  const body = document.getElementById("rs-panel-body");

  // ---- Build initial state and wrap existing content ----
  try {
    const buttonsEl = document.getElementById("rs-buttons");
    const optionsEl = document.getElementById("rs-options");
    if (buttonsEl && optionsEl && body) {
      const mainSection = document.createElement("div");
      mainSection.id = "rs-main";
      mainSection.className = "rs-section rs-hidden";
      mainSection.appendChild(buttonsEl);
      mainSection.appendChild(optionsEl);

      const initialSection = document.createElement("div");
      initialSection.id = "rs-initial";
      initialSection.className = "rs-section rs-visible";
      initialSection.innerHTML = `
        <div id="rs-buttons-initial">
          <button id="rs-btn-invoices">ზედნადებები</button>
          <button id="rs-btn-declaration">დეკლარაცია</button>
        </div>
      `;

      body.appendChild(initialSection);
      body.appendChild(mainSection);
    }
  } catch (e) {
    console.warn("RS panel: initial/main section setup failed", e);
  }
  (function restorePanelCollapse() {
    const collapsed = localStorage.getItem("rs_panel_collapsed") === "true";
    if (collapsed) {
      body.style.display = "none";
      toggleBtn.style.transform = "rotate(-90deg)";
    }
  })();
  toggleBtn.addEventListener("click", () => {
    const hidden = body.style.display === "none";
    body.style.display = hidden ? "block" : "none";
    toggleBtn.style.transform = hidden ? "rotate(0deg)" : "rotate(-90deg)";
    localStorage.setItem("rs_panel_collapsed", hidden ? "false" : "true");
  });

  // ---- Restore Check-All option ----
  const useCheckAllEl = document.getElementById("rs-use-checkall");
  const savedCheckAll = localStorage.getItem("rs_use_checkall");
  const useCheckAll = savedCheckAll === null ? true : savedCheckAll === "true";
  useCheckAllEl.checked = useCheckAll;
  useCheckAllEl.addEventListener("change", () => {
    localStorage.setItem("rs_use_checkall", String(useCheckAllEl.checked));
  });

  // ---- Initial state toggle ----
  const initialSection = document.getElementById("rs-initial");
  const mainSection = document.getElementById("rs-main");
  const invoicesBtn = document.getElementById("rs-btn-invoices");
  const declarationBtn = document.getElementById("rs-btn-declaration");

  if (invoicesBtn) {
    invoicesBtn.addEventListener("click", () => {
      if (initialSection && mainSection) {
        initialSection.classList.remove("rs-visible");
        initialSection.classList.add("rs-hidden");
        mainSection.classList.remove("rs-hidden");
        mainSection.classList.add("rs-visible");
      }
    });
  }

  // ---- BUTTONS ----
  const startBtn = document.getElementById("rs-start");
  const stopBtn = document.getElementById("rs-stop");

  // Dragging
  let isDragging = false, offsetX = 0, offsetY = 0;
  const header = document.getElementById("rs-panel-header");
  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      localStorage.setItem(
        "rs_panel_position",
        JSON.stringify({ left: panel.style.left, top: panel.style.top })
      );
    }
    isDragging = false;
    document.body.style.userSelect = "auto";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    newLeft = Math.max(0, Math.min(newLeft, vw - rect.width));
    newTop = Math.max(0, Math.min(newTop, vh - rect.height));

    panel.style.left = newLeft + "px";
    panel.style.top = newTop + "px";
  });

  // ---- AUTOMATION ----
  let invoiceAutomationActive = false;

  function isReturnFlagged(row) {
    return Array.from(row.querySelectorAll("td")).some((td) => {
      const t = (td.getAttribute("title") || td.textContent || "").trim();
      return t === "უკან დაბრუნება";
    });
  }

  async function runAutomation() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Visual: panel glow while running
    panel.classList.add("running");
    stopBtn.classList.add("stop-active");

    let currentIndex = 0;

    while (invoiceAutomationActive) {
      const rows = Array.from(
        document.querySelectorAll("tr.rsGridDataRow, tr.rsGridDataRowAlt")
      );
      if (!rows.length || currentIndex >= rows.length) break;

      const row = rows[currentIndex];
      if (!row) break;

      // Detect flag state for this row
      const isFlagged = isReturnFlagged(row);

      // Find the row checkbox
      const invoiceCheckbox = row.querySelector('input[type="checkbox"][value]');
      if (!invoiceCheckbox) {
        if (isFlagged) currentIndex++; // move on if flagged but no checkbox
        await sleep(120); // yield a bit to avoid hammering
        continue;
      }

      invoiceCheckbox.click();
      await sleep(150);

      // Only use Check All if not flagged
      const globalUseCheckAll =
        (localStorage.getItem("rs_use_checkall") ?? "true") === "true";
      const useCheckAllNow = globalUseCheckAll && !isFlagged;

      if (useCheckAllNow) {
        const checkAll = document.querySelector('input[type="checkbox"][style=""]');
        if (checkAll && !checkAll.checked) {
          checkAll.click();
          await sleep(100);
        }
      }

      // Click Create Invoice button
      const createBtn =
        document.querySelector("#tool11") ||
        Array.from(document.querySelectorAll('input[type="button"], button')).find((el) =>
          /ანგარიშ[\s-]*ფაქტურ(ის)?\s*შექმნა/i.test(el.value || el.innerText || "")
        );

      if (!createBtn) {
        console.error("Create Invoice button not found!");
        break;
      }

      createBtn.click();
      await sleep(900); // wait for dialogs/server

      // Uncheck Check All if used
      if (useCheckAllNow) {
        const checkAll = document.querySelector('input[type="checkbox"][style=""]');
        if (checkAll && checkAll.checked) checkAll.click();
      }

      // If flagged, move down; otherwise stay on same index (row should disappear)
      if (isFlagged) currentIndex++;

      await sleep(150); // small yield to keep UI responsive
    }

    // Reset flags so Start can run again later
    invoiceAutomationActive = false;
    panel.classList.remove("running");
    stopBtn.classList.remove("stop-active");
    console.log("✅ Automation finished");
  }

  // ---- BUTTON EVENTS ----
  startBtn.addEventListener("click", () => {
    if (automationInProgress) return;        // prevent overlapping runs
    invoiceAutomationActive = true;
    automationInProgress = true;
    runAutomation().finally(() => {
      automationInProgress = false;          // always release lock
    });
  });

  stopBtn.addEventListener("click", () => {
    invoiceAutomationActive = false;         // loop will exit gracefully
    panel.classList.remove("running");
    stopBtn.classList.remove("stop-active");
  });

  // license revoked / toggle visibility -> stop or hide
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "stopAutomation") {
      console.log("License revoked, stopping automation");
      invoiceAutomationActive = false;
      panel.classList.remove("running");
      stopBtn.classList.remove("stop-active");
    }
    if (msg.action === "togglePanelVisibility") {
      panel.style.display = msg.visible ? "block" : "none";
    }
  });
}
