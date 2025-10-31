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
      #rs-panel-body { overflow: visible !important; }
      #rs-panel-body.collapsed { overflow: hidden !important; }
      #rs-buttons, #rs-buttons-initial, #rs-buttons-declare { overflow: visible; }
      #rs-buttons button, #rs-buttons-initial button, #rs-buttons-declare button, #rs-dec-back, .rs-dec-chip { outline: none; }

      .rs-section { transition: none; }
      .rs-visible { display: block; }
      .rs-hidden { display: none; }

      #rs-buttons-initial button,
      #rs-buttons-declare button {
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
        cursor: pointer;
      }
      #rs-buttons-initial button:hover,
      #rs-buttons-declare button:hover {
        background: linear-gradient(135deg, #005bb5, #003f82);
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 6px 12px rgba(0,0,0,0.25);
      }
      #rs-buttons-initial button:active,
      #rs-buttons-declare button:active {
        transform: translateY(0) scale(0.98);
      }

      #rs-dec-selector {
        margin: 6px 0 4px;
        padding: 12px;
        border-radius: 16px;
        background: linear-gradient(140deg, rgba(0,102,204,0.12), rgba(0,102,204,0.02));
        border: 1px solid rgba(0,102,204,0.18);
        box-shadow: 0 10px 22px rgba(17, 76, 140, 0.12);
      }
      .rs-dec-group { margin-bottom: 12px; }
      .rs-dec-group:last-of-type { margin-bottom: 0; }
      .rs-dec-group-title {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #004999;
        margin-bottom: 6px;
      }
      .rs-dec-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
        gap: 8px;
      }
      .rs-dec-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 0;
        border-radius: 12px;
        border: 1px solid rgba(0,102,204,0.25);
        background: #fff;
        color: #004999;
        font-weight: 600;
        font-size: 12px;
        cursor: pointer;
        transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
        box-shadow: 0 3px 8px rgba(0,0,0,0.12);
      }
      .rs-dec-chip:hover {
        transform: translateY(-2px) scale(1.04);
        box-shadow: 0 8px 16px rgba(0,102,204,0.25);
      }
      .rs-dec-chip.active {
        background: linear-gradient(135deg, #0066cc, #004999);
        color: #fff;
        border-color: transparent;
        box-shadow: 0 10px 20px rgba(0,102,204,0.4);
      }

      #rs-dec-back {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 10px 12px;
        margin-top: 10px;
        background: #e9eef6;
        color: #003f82;
        font-weight: 600;
        font-size: 13px;
        border: none;
        border-radius: 12px;
        transition: background 0.2s ease, transform 0.2s ease;
        cursor: pointer;
      }
      #rs-dec-back:hover {
        background: #d7e3f6;
        transform: translateY(-1px);
      }

      #rs-dec-log {
        margin-top: 10px;
        padding: 10px;
        min-height: 80px;
        max-height: 180px;
        overflow: auto;
        background: #efefef;
        border: 1px solid #e6e6e6;
        border-radius: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
        font-size: 12px;
        line-height: 1.4;
        color: #222;
      }
      #rs-dec-log div + div { margin-top: 4px; }
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

      const declareSection = document.createElement("div");
      declareSection.id = "rs-declare";
      declareSection.className = "rs-section rs-hidden";

      const declareButtonsWrap = document.createElement("div");
      declareButtonsWrap.id = "rs-buttons-declare";
      const declareStartButton = document.createElement("button");
      declareStartButton.id = "rs-dec-start";
      declareStartButton.textContent = "Start";
      declareButtonsWrap.appendChild(declareStartButton);

      const declareSelector = document.createElement("div");
      declareSelector.id = "rs-dec-selector";

      const monthGroup = document.createElement("div");
      monthGroup.className = "rs-dec-group";
      const monthTitle = document.createElement("div");
      monthTitle.className = "rs-dec-group-title";
      monthTitle.textContent = "თვე";
      const monthRow = document.createElement("div");
      monthRow.className = "rs-dec-row";
      monthRow.id = "rs-dec-month-row";
      monthGroup.appendChild(monthTitle);
      monthGroup.appendChild(monthRow);

      const yearGroup = document.createElement("div");
      yearGroup.className = "rs-dec-group";
      const yearTitle = document.createElement("div");
      yearTitle.className = "rs-dec-group-title";
      yearTitle.textContent = "წელი";
      const yearRow = document.createElement("div");
      yearRow.className = "rs-dec-row";
      yearRow.id = "rs-dec-year-row";
      yearGroup.appendChild(yearTitle);
      yearGroup.appendChild(yearRow);

      declareSelector.appendChild(monthGroup);
      declareSelector.appendChild(yearGroup);

      const decLogContainer = document.createElement("div");
      decLogContainer.id = "rs-dec-log";
      decLogContainer.setAttribute("aria-live", "polite");

      const backWrap = document.createElement("div");
      const backButton = document.createElement("button");
      backButton.id = "rs-dec-back";
      backButton.textContent = "⬅ დაბრუნება";
      backWrap.appendChild(backButton);

      declareSection.appendChild(declareButtonsWrap);
      declareSection.appendChild(declareSelector);
      declareSection.appendChild(decLogContainer);
      declareSection.appendChild(backWrap);

      body.appendChild(declareSection);

      const initialInvoicesBtn = document.getElementById("rs-btn-invoices");
      const initialDeclarationBtn = document.getElementById("rs-btn-declaration");
      if (initialInvoicesBtn) initialInvoicesBtn.textContent = "ზედნადებები";
      if (initialDeclarationBtn) initialDeclarationBtn.textContent = "დეკლარაცია";
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

  // ---- State switching helpers ----
  const initialSection = document.getElementById("rs-initial");
  const mainSection = document.getElementById("rs-main");
  const declareSection = document.getElementById("rs-declare");
  function showSection(which) {
    if (!initialSection || !mainSection || !declareSection) return;
    const map = { initial: initialSection, main: mainSection, declare: declareSection };
    [initialSection, mainSection, declareSection].forEach((section) => {
      const active = section === map[which];
      section.classList.toggle("rs-visible", active);
      section.classList.toggle("rs-hidden", !active);
    });
  }

  // ---- Initial and declaration controls ----
  const invoicesBtn = document.getElementById("rs-btn-invoices");
  const declarationBtn = document.getElementById("rs-btn-declaration");
  const decBackBtn = document.getElementById("rs-dec-back");
  const decStartBtn = document.getElementById("rs-dec-start");
  const decMonthRow = document.getElementById("rs-dec-month-row");
  const decYearRow = document.getElementById("rs-dec-year-row");
  const decLogBox = document.getElementById("rs-dec-log");

  const MONTHS = [
    { index: 0, abbr: "იან", full: "იანვარი" },
    { index: 1, abbr: "თებ", full: "თებერვალი" },
    { index: 2, abbr: "მარ", full: "მარტი" },
    { index: 3, abbr: "აპრ", full: "აპრილი" },
    { index: 4, abbr: "მაი", full: "მაისი" },
    { index: 5, abbr: "ივნ", full: "ივნისი" },
    { index: 6, abbr: "ივლ", full: "ივლისი" },
    { index: 7, abbr: "აგვ", full: "აგვისტო" },
    { index: 8, abbr: "სექ", full: "სექტემბერი" },
    { index: 9, abbr: "ოქტ", full: "ოქტომბერი" },
    { index: 10, abbr: "ნოე", full: "ნოემბერი" },
    { index: 11, abbr: "დეკ", full: "დეკემბერი" }
  ];

  let selectedMonth = null;
  let selectedYear = null;
  let monthChips = [];
  let yearChips = [];

  function setActiveChips(chips, key, value) {
    chips.forEach((chip) => {
      const isActive = chip.dataset[key] === value;
      chip.classList.toggle("active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setSelectedMonth(value) {
    selectedMonth = value;
    setActiveChips(monthChips, "month", value);
  }

  function setSelectedYear(value) {
    selectedYear = value;
    setActiveChips(yearChips, "year", value);
  }

  function setupDateSelector() {
    if (!decMonthRow || !decYearRow) return;

    decMonthRow.innerHTML = "";
    decYearRow.innerHTML = "";
    monthChips = [];
    yearChips = [];

    MONTHS.forEach((month) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rs-dec-chip";
      btn.dataset.month = month.abbr;
      btn.textContent = month.abbr;
      btn.title = month.full;
      btn.addEventListener("click", () => setSelectedMonth(month.abbr));
      decMonthRow.appendChild(btn);
      monthChips.push(btn);
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    const minYear = Math.min(2023, currentYear - 1);
    const maxYear = Math.max(currentYear + 1, 2026);
    for (let year = minYear; year <= maxYear; year++) {
      years.push(String(year));
    }

    years.forEach((year) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rs-dec-chip";
      btn.dataset.year = year;
      btn.textContent = year;
      btn.addEventListener("click", () => setSelectedYear(year));
      decYearRow.appendChild(btn);
      yearChips.push(btn);
    });

    const defaultMonth = MONTHS[now.getMonth()]?.abbr ?? MONTHS[0].abbr;
    const defaultYear = years.includes(String(currentYear)) ? String(currentYear) : years[years.length - 1];
    setSelectedMonth(defaultMonth);
    setSelectedYear(defaultYear);
  }
  setupDateSelector();

  function logDec(msg) {
    if (!decLogBox) return;
    const line = document.createElement("div");
    line.textContent = msg;
    decLogBox.appendChild(line);
    decLogBox.scrollTop = decLogBox.scrollHeight;
  }

  invoicesBtn?.addEventListener("click", () => showSection("main"));
  declarationBtn?.addEventListener("click", () => showSection("declare"));
  decBackBtn?.addEventListener("click", () => showSection("initial"));

  // ---- Declaration automation ----
  let declarationInProgress = false;

  async function runDeclarationAutomation(targetMonth, targetYear) {
    if (declarationInProgress) return;
    declarationInProgress = true;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const clickOrFail = async (findFn, actionName) => {
      try {
        const el = findFn();
        if (!el) {
          const err = new Error(actionName);
          err.actionName = actionName;
          throw err;
        }
        if (typeof el.click === "function") {
          el.click();
        } else {
          el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
        await sleep(1000);
      } catch (err) {
        if (!err.actionName) err.actionName = actionName;
        throw err;
      }
    };

    try {
      logDec(`▶ ${targetMonth} ${targetYear} დაწყება`);
      await clickOrFail(() => document.querySelector('#hka1 > a'), 'ყოველთვიური');
      await clickOrFail(() => Array.from(document.querySelectorAll('td')).find((td) => (td.textContent || '').trim() === 'დღგ'), 'დღგ');
      await clickOrFail(() => document.querySelector('div.d_img_def'), 'თარიღის ჩამოსაშლელი');
      await clickOrFail(() => {
        const popup = document.querySelector('div.d_div.ks_popup');
        if (!popup) return null;
        return Array.from(popup.querySelectorAll('td')).find((td) => (td.textContent || '').trim() === targetYear) || null;
      }, 'თვე/წელი');
      await clickOrFail(() => {
        const popup = document.querySelector('div.d_div.ks_popup');
        if (!popup) return null;
        return Array.from(popup.querySelectorAll('td.m')).find((td) => (td.textContent || '').trim() === targetMonth) || null;
      }, 'თვე/წელი');
      await clickOrFail(() => document.querySelector('.d_ok_img'), 'არჩევა');
      await clickOrFail(() => document.querySelector('#control_0_new'), 'ახალი დეკლარაცია');
      logDec('✅ დეკლარაცია შექმნილია');
    } catch (err) {
      const actionName = err?.actionName || err?.message || 'ქმედება';
      logDec(`❌ ${actionName} ვერ შესრულდა`);
    } finally {
      declarationInProgress = false;
    }
  }

  decStartBtn?.addEventListener('click', () => {
    if (declarationInProgress) return;
    if (!selectedMonth || !selectedYear) {
      logDec('❌ თვე/წელი არ არის არჩეული');
      return;
    }
    runDeclarationAutomation(selectedMonth, selectedYear);
  });

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
