(function () {
  "use strict";

  const PANEL_HOST_ID = "amnairi-rs-panel-host";
  const STORAGE_PANEL_STATE = "panelState";
  const POSITION_KEY = "amnairi_panel_position";

    const MONTHS = [
    { value: "01", label: "იანვარი" },
    { value: "02", label: "თებერვალი" },
    { value: "03", label: "მარტი" },
    { value: "04", label: "აპრილი" },
    { value: "05", label: "მაისი" },
    { value: "06", label: "ივნისი" },
    { value: "07", label: "ივლისი" },
    { value: "08", label: "აგვისტო" },
    { value: "09", label: "სექტემბერი" },
    { value: "10", label: "ოქტომბერი" },
    { value: "11", label: "ნოემბერი" },
    { value: "12", label: "დეკემბერი" },
  ];

      const state = {
    account: null,
    monthKey: getCurrentMonthKey(),
    total: null,
    savedPanelState: {},
    panelEnabled: true,
    isRunning: false,
    declarationRunning: false,
    invoiceAutomationActive: false,
    activeTab: "invoices",
    declarationCancelRequested: false,
    currentLogScope: "invoices",
  };

  const refs = {};

  waitForDom().then(initialize).catch(console.error);

  async function initialize() {
    await loadPanelState();
    const panelPref = await storageGet("panelEnabled");
    state.panelEnabled = panelPref?.panelEnabled !== false;
    await updateAccount();
    injectPanel();
    applySavedPanelState();
    attachStorageListeners();
    attachRuntimeListeners();

    // Attach debugger once per tab (existing behaviour)
    chrome.runtime.sendMessage({ action: "attachDebugger" });
  }

  function waitForDom() {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function getMonthByValue(value) {
    return MONTHS.find((month) => month.value === value) ?? MONTHS[0];
  }

  function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-");
    const monthInfo = getMonthByValue(month);
    return `${monthInfo.label} ${year}`;
  }

  function formatCurrency(amount) {
    const formatter = new Intl.NumberFormat("ka-GE", {
      style: "currency",
      currency: "GEL",
      minimumFractionDigits: 2,
    });
    return formatter.format(amount ?? 0);
  }

  async function loadPanelState() {
    const data = await storageGet(STORAGE_PANEL_STATE);
    state.savedPanelState = data?.[STORAGE_PANEL_STATE] ?? {};
  }

  function applySavedPanelState() {
    if (!state.account?.token) return;
    const saved = state.savedPanelState[state.account.token];
    if (saved?.monthKey) {
      state.monthKey = saved.monthKey;
    }
    if (typeof saved?.total === "number") {
      state.total = saved.total;
    }
    if (saved?.activeTab) {
      state.activeTab = saved.activeTab === "declarations" ? "declarations" : "invoices";
    }
    updateCalendarDisplay();
    updateTotalDisplay();
    setActiveTab(state.activeTab, { skipPersist: true, skipPause: true });
  }

    if (typeof saved?.total === "number") {
      state.total = saved.total;
    }
    updateCalendarDisplay();
    updateTotalDisplay();
  }

 ), function persistPanelState() {
    if (!state.account?.token) return;
    const next = { ...state.savedPanelState };
    next[state.account.token] = {
      monthKey: state.monthKey,
      total: state.total,
      activeTab: state.activeTab,
    };
    state.savedPanelState = next;
    storageSet({ [STORAGE_PANEL_STATE]: next });
  }

  async function updateAccount() {
    const account = await sendMessage({ action: "getActiveAccount" });
    if (account?.token) {
      state.account = account;
    } else {
      state.account = null;
    }
  }

    function injectPanel() {
    if (document.getElementById(PANEL_HOST_ID)) return;
    const host = document.createElement("div");
    host.id = PANEL_HOST_ID;
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = getPanelStyles();

    const container = document.createElement("div");
    container.className = "rs-panel rs-panel-root";
    container.innerHTML = getPanelMarkup();

    shadow.appendChild(style);
    shadow.appendChild(container);

    refs.shadow = shadow;
    refs.container = container;
    refs.container.classList.toggle("rs-panel-hidden", !state.panelEnabled);
    refs.handle = container.querySelector(".rs-panel-handle");
    refs.accountLabel = container.querySelector(".rs-panel-account-label");
    refs.loginHint = container.querySelector(".rs-panel-account-hint");
    refs.tabs = Array.from(container.querySelectorAll(".rs-tab"));
    refs.sections = {
      invoices: container.querySelector(".rs-section-invoices"),
      declarations: container.querySelector(".rs-section-declarations"),
    };
    refs.monthSelect = container.querySelector(".rs-panel-month-select");
    refs.yearSelect = container.querySelector(".rs-panel-year-select");
    refs.totalValue = container.querySelector("#rs-total-value");
    refs.invoiceStartBtn = container.querySelector("#rs-invoice-start");
    refs.invoiceStopBtn = container.querySelector("#rs-invoice-stop");
    refs.declarationStartBtn = container.querySelector("#rs-declaration-start");
    refs.invoiceLog = container.querySelector("#rs-invoice-log");
    refs.declarationLog = container.querySelector("#rs-declaration-log");
    refs.checkAll = container.querySelector("#rs-use-checkall");

    populateCalendarSelectors();
    restorePanelPosition();
    bindPanelEvents();
    updateAccountDisplay();
    updateCalendarDisplay();
    updateTotalDisplay();
    updateButtons();
    setActiveTab(state.activeTab, { skipPersist: true, skipPause: true });
  }

  return `
        border-radius: 999px;
        font-size: 11px;
        letter-spacing: 0.04em;
      };

      .rs-panel-account {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .rs-panel-account-label {
        font-weight: 600;
        font-size: 13px;
      }

      .rs-panel-login-hint {
        color: #9ca3af;
        font-size: 12px;
        line-height: 1.2;
      }

      .rs-panel-month-trigger {
        padding: 8px 10px;
        border-radius: 12px;
        background: #f6f7fb;
        border: 1px solid rgba(15, 23, 42, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        cursor: pointer;
        transition: background 0.2s ease, border 0.2s ease;
      }

      .rs-panel-month-trigger:hover {
        background: #eef2ff;
        border-color: rgba(37, 99, 235, 0.3);
      }

      .rs-panel-month-label {
        font-weight: 600;
      }

      .rs-panel-calendar-dropdown {
        position: absolute;
        top: 72px;
        left: 0;
        width: 150px;
        background: #ffffff;
        border-radius: 14px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-6px);
        transition: opacity 0.18s ease, transform 0.18s ease;
        background-clip: padding-box;
      }

      .rs-panel-calendar-dropdown.open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      .rs-panel-calendar-dropdown label {
        font-size: 11px;
        text-transform: uppercase;
        color: #6b7280;
        letter-spacing: 0.06em;
      }

      .rs-panel-calendar-dropdown select {
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid rgba(37, 99, 235, 0.2);
        background: #f3f4f6;
        cursor: pointer;
        transition: border 0.2s ease, background 0.2s ease;
      }

      .rs-panel-calendar-dropdown select:focus {
        border-color: rgba(37, 99, 235, 0.5);
        background: #fff;
      }

      .rs-panel-total {
        padding: 10px;
        border-radius: 12px;
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.18);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .rs-panel-total-label {
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #047857;
      }

      .rs-panel-total-value {
        font-weight: 700;
        font-size: 15px;
        color: #047857;
      }

      .rs-panel-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.3), transparent);
      }

      .rs-panel-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .rs-panel-button {
        padding: 9px 10px;
        border-radius: 12px;
        background: #f9fafb;
        border: 1px solid rgba(15, 23, 42, 0.1);
        text-align: center;
        cursor: pointer;
        font-weight: 600;
        transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      }

      .rs-panel-button:hover {
        background: #eef2ff;
        box-shadow: 0 10px 20px rgba(37, 99, 235, 0.18);
        transform: translateY(-1px);
      }

      .rs-panel-button:active {
        transform: translateY(0);
      }

      .rs-panel-button[disabled] {
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
        transform: none;
      }

      .rs-panel-start {
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        color: #fff;
        border: none;
        box-shadow: 0 12px 24px rgba(37, 99, 235, 0.28);
      }

      .rs-panel-start:hover {
        box-shadow: 0 16px 30px rgba(37, 99, 235, 0.35);
      }

      .rs-panel-stop {
        background: rgba(248, 113, 113, 0.12);
        color: #b91c1c;
        border: 1px solid rgba(248, 113, 113, 0.3);
      }

      .rs-panel-log {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .rs-panel-log-title {
        font-weight: 600;
        font-size: 12px;
        color: #374151;
      }

      .rs-panel-log-lines {
        max-height: 120px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-right: 2px;
      }

      .rs-panel-log-line {
        font-size: 12px;
        line-height: 1.3;
        display: flex;
        gap: 6px;
        align-items: flex-start;
      }

      .rs-panel-log-line::before {
        content: "•";
        font-weight: 700;
      }

      .rs-panel-log-line--info {
        color: #1f2937;
      }

      .rs-panel-log-line--ok {
        color: #047857;
      }

      .rs-panel-log-line--warn {
        color: #d97706;
      }

      .rs-panel-log-line--err {
        color: #b91c1c;
      }

      .rs-panel-root.rs-panel-running .rs-panel-start {
        opacity: 0.5;
        pointer-events: none;
      }
    ;`
  

  function getPanelMarkup() {
    return `
      <div class="rs-panel-handle">
        <div class="rs-panel-brand">
          <div class="rs-panel-title">Amnairi</div>
          <div class="rs-panel-sub">RS Assistant</div>
        </div>
        <div class="rs-panel-account">
          <div class="rs-panel-account-label">??????????? ?? ????????</div>
          <div class="rs-panel-account-hint">??????, ??????? ??????????? ??????????? ?????????.</div>
        </div>
      </div>
      <div class="rs-tabs">
        <button type="button" class="rs-tab active" data-tab="invoices">???????????</button>
        <button type="button" class="rs-tab" data-tab="declarations">????????????</button>
      </div>
      <div class="rs-panel-body">
        <section class="rs-panel-section rs-section-invoices active">
          <div class="rs-block">
            <label class="rs-checkbox">
              <input type="checkbox" id="rs-use-checkall" />
              <span>?????? ????????</span>
            </label>
          </div>
          <div class="rs-actions">
            <button type="button" class="rs-btn rs-btn-primary" id="rs-invoice-start">?? ???????</button>
            <button type="button" class="rs-btn rs-btn-muted" id="rs-invoice-stop">? ????????</button>
          </div>
          <div class="rs-block">
            <div class="rs-block-title">?? ????</div>
            <div class="rs-log" id="rs-invoice-log"></div>
          </div>
        </section>
        <section class="rs-panel-section rs-section-declarations">
          <div class="rs-block rs-calendar">
            <label>
              ???
              <select id="rs-panel-month" class="rs-panel-month-select"></select>
            </label>
            <label>
              ????
              <select id="rs-panel-year" class="rs-panel-year-select"></select>
            </label>
          </div>
          <div class="rs-block rs-total">
            <div class="rs-total-label">?? ????????? ???</div>
            <div class="rs-total-value" id="rs-total-value">? 0.00</div>
          </div>
          <button type="button" class="rs-btn rs-btn-primary" id="rs-declaration-start">?? ??????????? ???????</button>
          <div class="rs-block">
            <div class="rs-block-title">?? ????</div>
            <div class="rs-log" id="rs-declaration-log"></div>
          </div>
        </section>
      </div>
    `;
  }

  function populateCalendarSelectors() {
    if (!refs.monthSelect || !refs.yearSelect) return;
    refs.monthSelect.innerHTML = "";
    MONTHS.forEach((month) => {
      const option = document.createElement("option");
      option.value = month.value;
      option.textContent = month.label;
      refs.monthSelect.appendChild(option);
    });

    const currentYear = new Date().getFullYear();
    refs.yearSelect.innerHTML = "";
    for (let year = currentYear - 2; year <= currentYear + 2; year += 1) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      refs.yearSelect.appendChild(option);
    }
  }


    function bindPanelEvents() {
    if (refs.tabs) {
      refs.tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const target = tab.dataset.tab === "declarations" ? "declarations" : "invoices";
          setActiveTab(target);
        });
      });
    }

    if (refs.monthSelect) {
      refs.monthSelect.addEventListener("change", () => {
        const [year] = state.monthKey.split("-");
        state.monthKey = `${year}-${refs.monthSelect.value}`;
        updateCalendarDisplay();
        persistPanelState();
      });
    }

    if (refs.yearSelect) {
      refs.yearSelect.addEventListener("change", () => {
        const [, month] = state.monthKey.split("-");
        state.monthKey = `${refs.yearSelect.value}-${month}`;
        updateCalendarDisplay();
        persistPanelState();
      });
    }

    if (refs.invoiceStartBtn) {
      refs.invoiceStartBtn.addEventListener("click", handleInvoiceStart);
    }

    if (refs.invoiceStopBtn) {
      refs.invoiceStopBtn.addEventListener("click", handleInvoiceStop);
    }

    if (refs.declarationStartBtn) {
      refs.declarationStartBtn.addEventListener("click", handleDeclarationStart);
    }

    if (refs.checkAll) {
      const saved = localStorage.getItem("rs_use_checkall");
      const useCheckAll = saved === null ? true : saved === "true";
      refs.checkAll.checked = useCheckAll;
      refs.checkAll.addEventListener("change", () => {
        localStorage.setItem("rs_use_checkall", String(refs.checkAll.checked));
      });
    }

    setupDragging();
  }

  function updateAccountDisplay() {
    if (!refs.accountLabel) return;
    if (state.account?.token) {
      refs.accountLabel.textContent = state.account.label || "Amnairi";
      refs.loginHint.textContent = "??????? ????? ??????.";
      refs.loginHint.style.color = "#5d6a7d";
    } else {
      refs.accountLabel.textContent = "??????????? ?? ????????";
      refs.loginHint.textContent = "??????, ??????? ??????????? ??????????? ?????????.";
      refs.loginHint.style.color = "#b91c1c";
    }
  }


  function updateCalendarDisplay() {
    if (!refs.monthSelect || !refs.yearSelect) return;
    const [year, month] = state.monthKey.split("-");
    refs.monthSelect.value = month;
    refs.yearSelect.value = year;
  }


  function updateTotalDisplay() {
    if (!refs.totalValue) return;
    const total = typeof state.total === "number" ? state.total : 0;
    refs.totalValue.textContent = formatCurrency(total);
  }

  function updateButtons() {
    const hasAccount = Boolean(state.account?.token);
    if (refs.invoiceStartBtn) {
      refs.invoiceStartBtn.disabled = !hasAccount || state.isRunning;
    }
    if (refs.invoiceStopBtn) {
      refs.invoiceStopBtn.disabled = !state.isRunning;
    }
    if (refs.declarationStartBtn) {
      refs.declarationStartBtn.disabled = !hasAccount || state.declarationRunning;
    }
    if (refs.container) {
      refs.container.classList.toggle("rs-panel-running", state.isRunning);
    }
  }


    function pauseAutomation(shouldLog = false) {
    let stoppedInvoices = false;
    let stoppedDeclarations = false;

    if (state.isRunning) {
      state.invoiceAutomationActive = false;
      state.isRunning = false;
      stoppedInvoices = true;
    }

    if (state.declarationRunning) {
      state.declarationCancelRequested = true;
      stoppedDeclarations = true;
    }

    if (shouldLog && stoppedInvoices) {
      pushLog("warn", "????????????? ???????.", "invoices");
    }
    if (shouldLog && stoppedDeclarations) {
      pushLog("warn", "??????????? ??????? ???????.", "declarations");
    }

    updateButtons();
  }

  function setActiveTab(tab, options = {}) {
    const target = tab === "declarations" ? "declarations" : "invoices";
    if (target === state.activeTab && !options.force) return;

    if (!options.skipPause) {
      pauseAutomation(true);
    }

    state.activeTab = target;

    if (refs.tabs) {
      refs.tabs.forEach((tabEl) => {
        tabEl.classList.toggle("active", tabEl.dataset.tab === target);
      });
    }

    if (refs.sections) {
      Object.entries(refs.sections).forEach(([key, section]) => {
        if (section) {
          section.classList.toggle("active", key === target);
        }
      });
    }

    if (!options.skipPersist) {
      persistPanelState();
    }
  }
  function pushLog(type, message, scope) {
    const targetScope = scope || state.currentLogScope || "invoices";
    const logElement = targetScope === "declarations" ? refs.declarationLog : refs.invoiceLog;
    if (!logElement) return;
    const line = document.createElement("div");
    line.className = `rs-log-entry ${type}`;
    line.textContent = message;
    logElement.appendChild(line);
    const maxEntries = 80;
    while (logElement.children.length > maxEntries) {
      logElement.removeChild(logElement.firstChild);
    }
    logElement.scrollTop = logElement.scrollHeight;
  }


    async function handleInvoiceStart() {
    if (state.isRunning || !state.account?.token) return;
    state.currentLogScope = "invoices";
    state.isRunning = true;
    state.invoiceAutomationActive = true;
    state.currentLogScope = "invoices";
    updateButtons();
    pushLog("info", "???????????? ????????????? ??????.", "invoices");

    try {
      await runInvoiceAutomation();
      pushLog("ok", "???????????? ????????????? ????????.", "invoices");
    } catch (err) {
      pushLog("err", err?.message || "???????????? ????????????? ??????? ????????.", "invoices");
    } finally {
      state.isRunning = false;
      updateButtons();
    }
  }

  function handleInvoiceStop() {
    if (!state.isRunning && !state.declarationRunning) return;
    pauseAutomation(true);
  }

  async function handleDeclarationStart() {
    if (state.declarationRunning || !state.account?.token) return;
    state.currentLogScope = "declarations";
    state.declarationCancelRequested = false;
    state.declarationRunning = true;
    state.currentLogScope = "declarations";
    updateButtons();
    const monthLabel = formatMonthLabel(state.monthKey);
    pushLog("info", `??????????? ???????? ???????: ${monthLabel}`, "declarations");

    try {
      const response = await sendMessage({
        action: "fetchWaybillTotal",
        token: state.account.token,
        month: state.monthKey,
      });

      if (!response?.ok) {
        throw new Error(response?.message || "???? ??? ????????");
      }

      state.total = response.total;
      updateTotalDisplay();
      persistPanelState();
      pushLog("ok", `????????? ??? ${formatCurrency(response.total)}`, "declarations");

      state.currentLogScope = "declarations";
      await runDeclarationAutomation();
      pushLog("ok", "??????????? ??????? ????????.", "declarations");
    } catch (error) {
      const message = state.declarationCancelRequested
        ? "??????????? ??????? ???????."
        : error?.message || "??????????? ??????? ???????.";
      pushLog("err", message, "declarations");
    } finally {
      state.declarationRunning = false;
      state.declarationCancelRequested = false;
      updateButtons();
    }
  }


  async function runDeclarationAutomation() {
    if (state.declarationRunning) return;
    state.declarationRunning = true;
    state.currentLogScope = "declarations";
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const [year, month] = state.monthKey.split("-");
    const monthName = getMonthByValue(month).label;

    const clickOrThrow = async (factory, description, delay = 400) => {
      if (state.declarationCancelRequested) {
        throw new Error("??????????? ??????? ???????.");
      }
      const element = factory();
      if (!element) {
        throw new Error(`${description} ??? ????????`);
      }
      element.click();
      await sleep(delay);
    };

    const findCellByText = (root, matcher) => {
      const cells = Array.from(root.querySelectorAll("td"));
      return cells.find((cell) => matcher((cell.textContent || cell.innerText || "").trim()));
    };

    try {
      pushLog("info", "დეკლარაციის ვიჟეტის გახსნა...");
      await clickOrThrow(
        () => document.querySelector("#hka1 > a"),
        "დეკლარაციის ჩანართი"
      );

      await clickOrThrow(
        () =>
          findCellByText(document, (text) =>
            /დღგ/i.test(text) || /დამატებული/i.test(text)
          ),
        "დღგ დეკლარაციის რიგი"
      );

      await clickOrThrow(
        () => document.querySelector("div.d_img_def"),
        "თარიღის არჩევა"
      );

      const popup = document.querySelector("div.d_div.ks_popup");
      if (!popup) {
        throw new Error("თარიღის ფანჯარა ვერ მოიძებნა");
      }

      await clickOrThrow(
        () =>
          findCellByText(popup, (text) => text === year),
        `${year} წელი`
      );

      await clickOrThrow(
        () =>
          findCellByText(popup, (text) => text === monthName),
        `${monthName} თვე`
      );

      await clickOrThrow(
        () => document.querySelector(".d_ok_img"),
        "თარიღის დამტკიცება"
      );

      await clickOrThrow(
        () => document.querySelector("#control_0_new"),
        "ახალი დეკლარაციის დაწყება",
        700
      );

      pushLog("ok", `დეკლარაციის პროცესი მზად არის (${monthName} ${year})`);
    } catch (err) {
      pushLog("warn", err.message || "დეკლარაციის ნაბიჯი ვერ შესრულდა");
    } finally {
      state.declarationRunning = false;
    }
  }

  async function runInvoiceAutomation() {
    if (state.invoiceAutomationActive) return;
    state.invoiceAutomationActive = true;
    state.currentLogScope = "invoices";
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    pushLog("info", "ინვოისების ავტომატიზაცია დაწყებულია.");
    let currentIndex = 0;

    while (state.invoiceAutomationActive) {
      const rows = Array.from(
        document.querySelectorAll("tr.rsGridDataRow, tr.rsGridDataRowAlt")
      );

      if (!rows.length || currentIndex >= rows.length) {
        break;
      }

      const row = rows[currentIndex];
      if (!row) break;

      const isFlagged = Array.from(row.querySelectorAll("td")).some((td) => {
        const text = (td.getAttribute("title") || td.textContent || "").trim();
        return /დაბრუნ/i.test(text) || /return/i.test(text);
      });

      const checkbox = row.querySelector('input[type="checkbox"][value]');
      if (!checkbox) {
        if (isFlagged) currentIndex += 1;
        await sleep(120);
        continue;
      }

      checkbox.click();
      await sleep(120);

      const checkAll = document.querySelector('input[type="checkbox"][style=""]');
      if (checkAll && !isFlagged && !checkAll.checked) {
        checkAll.click();
        await sleep(120);
      }

      const createButton =
        document.querySelector("#tool11") ||
        Array.from(document.querySelectorAll('input[type="button"], button')).find(
          (el) => {
            const text = (el.value || el.innerText || "").trim();
            return /შექმნა/i.test(text) || /Create/i.test(text);
          }
        );

      if (!createButton) {
        pushLog("warn", "შექმნის ღილაკი ვერ მოიძებნა.");
        break;
      }

      createButton.click();
      await sleep(900);

      if (checkAll && checkAll.checked) {
        checkAll.click();
      }

      if (isFlagged) {
        currentIndex += 1;
      }

      await sleep(140);
    }

    state.invoiceAutomationActive = false;
    pushLog("info", "ინვოისების ავტომატიზაცია დასრულებულია.");
  }

  function setupDragging() {
    if (!refs.handle || !refs.container) return;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const handlePointerDown = (event) => {
      dragging = true;
      const rect = refs.container.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      refs.handle.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event) => {
      if (!dragging) return;
      const x = event.clientX - offsetX;
      const y = event.clientY - offsetY;
      const maxX = window.innerWidth - refs.container.offsetWidth - 10;
      const maxY = window.innerHeight - refs.container.offsetHeight - 10;
      refs.container.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
      refs.container.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
    };

    const handlePointerUp = (event) => {
      if (!dragging) return;
      dragging = false;
      refs.handle.releasePointerCapture(event.pointerId);
      savePanelPosition();
    };

    refs.handle.addEventListener("pointerdown", handlePointerDown);
    refs.handle.addEventListener("pointermove", handlePointerMove);
    refs.handle.addEventListener("pointerup", handlePointerUp);
    refs.handle.addEventListener("pointercancel", handlePointerUp);
  }


  function restorePanelPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
        refs.container.style.left = `${saved.left}px`;
        refs.container.style.top = `${saved.top}px`;
      } else {
        const defaultLeft = Math.max(20, window.innerWidth - 290);
        refs.container.style.left = `${defaultLeft}px`;
        refs.container.style.top = "90px";
      }
    } catch {
      const defaultLeft = Math.max(20, window.innerWidth - 290);
      refs.container.style.left = `${defaultLeft}px`;
      refs.container.style.top = "90px";
    }
  }


  function savePanelPosition() {
    const rect = refs.container.getBoundingClientRect();
    localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) })
    );
  }

  function attachStorageListeners() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.mainAccount || changes.subAccounts || changes.selectedAccount) {
        updateAccount()
          .then(() => {
            updateAccountDisplay();
            applySavedPanelState();
            updateButtons();
          })
          .catch(() => {});
      }

      if (changes.panelEnabled) {
        state.panelEnabled = changes.panelEnabled.newValue !== false;
        refs.container.classList.toggle("rs-panel-hidden", !state.panelEnabled);
      }

      if (changes[STORAGE_PANEL_STATE]) {
        state.savedPanelState = changes[STORAGE_PANEL_STATE].newValue ?? {};
        applySavedPanelState();
      }
    });
  }

  function attachRuntimeListeners() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.action === "logoutRequired") {
      pauseAutomation(false);
      state.account = null;
      updateAccountDisplay();
      updateButtons();
      pushLog("warn", "????? ???????????. ??????, ??????? ???????? ???????????.", "invoices");
      pushLog("warn", "????? ???????????. ??????, ??????? ???????? ???????????.", "declarations");
      setActiveTab("invoices", { skipPause: true, force: true, skipPersist: false });
    }
      if (message?.action === "stopAutomation") {
        handleInvoiceStop();
      }
    });
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], resolve);
    });
  }

  function storageSet(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, resolve);
    });
  }

  function sendMessage(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Messaging error:", chrome.runtime.lastError.message);
            resolve(undefined);
            return;
          }
          resolve(response);
        });
      } catch (err) {
        console.warn("Messaging failure:", err);
        resolve(undefined);
      }
    });
  }
;
    function getPanelStyles() {
    return `
      .rs-panel,
      .rs-panel * {
        all: unset;
        box-sizing: border-box;
        font-family: "Inter", sans-serif;
        font-size: 13px;
        color: #333;
      }

      .rs-panel {
        position: fixed;
        top: 90px;
        left: 24px;
        width: 270px;
        background: linear-gradient(145deg, #ffffff 0%, #f2f7ff 100%);
        border: 1px solid #dce3f0;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 999999;
      }

      .rs-panel.rs-panel-hidden {
        display: none;
      }

      .rs-panel-handle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        cursor: grab;
        padding: 0 2px;
      }

      .rs-panel-brand {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .rs-panel-title {
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .rs-panel-sub {
        font-size: 11px;
        color: #5d6a7d;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .rs-panel-account {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
        text-align: right;
      }

      .rs-panel-account-label {
        font-weight: 600;
        font-size: 12px;
        color: #1f3f7f;
      }

      .rs-panel-account-hint {
        font-size: 11px;
        color: #7b8594;
        max-width: 150px;
        line-height: 1.3;
      }

      .rs-tabs {
        display: flex;
        height: 34px;
        border-radius: 8px;
        overflow: hidden;
        background: linear-gradient(90deg, #007bff 0%, #4b9dff 100%);
      }

      .rs-tab {
        flex: 1;
        text-align: center;
        color: #e9f2ff;
        font-weight: 500;
        cursor: pointer;
        line-height: 34px;
        position: relative;
        transition: background 0.25s ease, color 0.25s ease;
      }

      .rs-tab:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      .rs-tab.active {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.15);
      }

      .rs-tab::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 25%;
        width: 50%;
        height: 3px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.75);
        opacity: 0;
        transform: scaleX(0.5);
        transition: opacity 0.25s ease, transform 0.25s ease;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.4);
      }

      .rs-tab.active::after {
        opacity: 1;
        transform: scaleX(1);
      }

      .rs-panel-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .rs-panel-section {
        display: none;
        flex-direction: column;
        gap: 8px;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.25s ease, transform 0.25s ease;
      }

      .rs-panel-section.active {
        display: flex;
        opacity: 1;
        transform: translateY(0);
      }

      .rs-block {
        background: rgba(255, 255, 255, 0.85);
        border: 1px solid #e4ecf8;
        border-radius: 8px;
        padding: 8px 10px;
        box-shadow: inset 0 0 6px rgba(255, 255, 255, 0.6);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .rs-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #3b4a62;
        cursor: pointer;
      }

      .rs-checkbox input[type="checkbox"] {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        border: 1px solid #6fa4ff;
        background: #f4f7ff;
        transition: background 0.2s ease, border 0.2s ease;
      }

      .rs-checkbox input[type="checkbox"]:checked {
        background: linear-gradient(145deg, #007bff 0%, #4b9dff 100%);
        border-color: transparent;
      }

      .rs-actions {
        display: flex;
        gap: 8px;
      }

      .rs-btn {
        flex: 1;
        background: linear-gradient(145deg, #007bff 0%, #4b9dff 100%);
        border-radius: 6px;
        color: #ffffff;
        font-weight: 500;
        text-align: center;
        padding: 7px 10px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0, 123, 255, 0.25);
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }

      .rs-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 3px 8px rgba(0, 123, 255, 0.35);
      }

      .rs-btn:active {
        transform: scale(0.97);
        box-shadow: 0 1px 4px rgba(0, 123, 255, 0.2);
      }

      .rs-btn.rs-btn-muted {
        background: rgba(0, 123, 255, 0.12);
        color: #0b6bff;
        box-shadow: none;
      }

      .rs-btn[disabled] {
        cursor: not-allowed;
        opacity: 0.55;
        box-shadow: none;
        transform: none;
      }

      .rs-calendar {
        display: flex;
        gap: 8px;
      }

      .rs-calendar label {
        flex: 1;
        font-size: 11px;
        color: #56637a;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .rs-calendar select {
        background: #f4f6fa;
        border: 1px solid #cfd9ea;
        border-radius: 6px;
        padding: 4px 6px;
        cursor: pointer;
        transition: border 0.2s ease, box-shadow 0.2s ease;
      }

      .rs-calendar select:focus {
        border-color: #4b9dff;
        box-shadow: 0 0 0 3px rgba(75, 157, 255, 0.22);
        background: #ffffff;
      }

      .rs-total {
        background: rgba(248, 250, 255, 0.9);
        border: 1px solid #d8e2f7;
      }

      .rs-total-label {
        font-size: 11px;
        text-transform: uppercase;
        color: #4365a6;
        letter-spacing: 0.04em;
      }

      .rs-total-value {
        font-weight: 700;
        font-size: 16px;
        color: #214377;
      }

      .rs-log {
        background: rgba(248, 250, 255, 0.9);
        border: 1px solid #e1e7f5;
        border-radius: 8px;
        max-height: 120px;
        overflow-y: auto;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
      }

      .rs-log-entry {
        display: flex;
        gap: 6px;
        line-height: 1.3;
      }

      .rs-log-entry::before {
        content: "�";
      }

      .rs-log-entry.ok {
        color: #28a745;
      }

      .rs-log-entry.err {
        color: #d93025;
      }

      .rs-log-entry.warn {
        color: #e37400;
      }

      .rs-log-entry.info {
        color: #0b6bff;
      }
    ;
  }

      .rs-panel {
        position: fixed;
        top: 90px;
        left: 24px;
        width: 270px;
        background: linear-gradient(145deg, #ffffff 0%, #f2f7ff 100%);
        border: 1px solid #dce3f0;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 999999;
      }

      .rs-panel.rs-panel-hidden {
        display: none;
      }

      .rs-panel-handle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        cursor: grab;
        padding: 0 2px;
      }

      .rs-panel-brand {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .rs-panel-title {
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .rs-panel-sub {
        font-size: 11px;
        color: #5d6a7d;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .rs-panel-account {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
        text-align: right;
      }

      .rs-panel-account-label {
        font-weight: 600;
        font-size: 12px;
        color: #1f3f7f;
      }

      .rs-panel-account-hint {
        font-size: 11px;
        color: #7b8594;
        max-width: 150px;
        line-height: 1.3;
      }

      .rs-tabs {
        display: flex;
        height: 34px;
        border-radius: 8px;
        overflow: hidden;
        background: linear-gradient(90deg, #007bff 0%, #4b9dff 100%);
      }

      .rs-tab {
        flex: 1;
        text-align: center;
        color: #e9f2ff;
        font-weight: 500;
        cursor: pointer;
        line-height: 34px;
        position: relative;
        transition: background 0.25s ease, color 0.25s ease;
      }

      .rs-tab:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      .rs-tab.active {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.15);
      }

      .rs-tab::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 25%;
        width: 50%;
        height: 3px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.75);
        opacity: 0;
        transform: scaleX(0.5);
        transition: opacity 0.25s ease, transform 0.25s ease;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.4);
      }

      .rs-tab.active::after {
        opacity: 1;
        transform: scaleX(1);
      }

      .rs-panel-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .rs-panel-section {
        display: none;
        flex-direction: column;
        gap: 8px;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.25s ease, transform 0.25s ease;
      }

      .rs-panel-section.active {
        display: flex;
        opacity: 1;
        transform: translateY(0);
      }

      .rs-block {
        background: rgba(255, 255, 255, 0.85);
        border: 1px solid #e4ecf8;
        border-radius: 8px;
        padding: 8px 10px;
        box-shadow: inset 0 0 6px rgba(255, 255, 255, 0.6);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .rs-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #3b4a62;
        cursor: pointer;
      }

      .rs-checkbox input[type="checkbox"] {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        border: 1px solid #6fa4ff;
        background: #f4f7ff;
        transition: background 0.2s ease, border 0.2s ease;
      }

      .rs-checkbox input[type="checkbox"]:checked {
        background: linear-gradient(145deg, #007bff 0%, #4b9dff 100%);
        border-color: transparent;
      }

      .rs-actions {
        display: flex;
        gap: 8px;
      }

      .rs-btn {
        flex: 1;
        background: linear-gradient(145deg, #007bff 0%, #4b9dff 100%);
        border-radius: 6px;
        color: #ffffff;
        font-weight: 500;
        text-align: center;
        padding: 7px 10px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0, 123, 255, 0.25);
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }

      .rs-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 3px 8px rgba(0, 123, 255, 0.35);
      }

      .rs-btn:active {
        transform: scale(0.97);
        box-shadow: 0 1px 4px rgba(0, 123, 255, 0.2);
      }

      .rs-btn.rs-btn-muted {
        background: rgba(0, 123, 255, 0.12);
        color: #0b6bff;
        box-shadow: none;
      }

      .rs-btn[disabled] {
        cursor: not-allowed;
        opacity: 0.55;
        box-shadow: none;
        transform: none;
      }

      .rs-calendar {
        display: flex;
        gap: 8px;
      }

      .rs-calendar label {
        flex: 1;
        font-size: 11px;
        color: #56637a;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .rs-calendar select {
        background: #f4f6fa;
        border: 1px solid #cfd9ea;
        border-radius: 6px;
        padding: 4px 6px;
        cursor: pointer;
        transition: border 0.2s ease, box-shadow 0.2s ease;
      }

      .rs-calendar select:focus {
        border-color: #4b9dff;
        box-shadow: 0 0 0 3px rgba(75, 157, 255, 0.22);
        background: #ffffff;
      }

      .rs-total {
        background: rgba(248, 250, 255, 0.9);
        border: 1px solid #d8e2f7;
      }

      .rs-total-label {
        font-size: 11px;
        text-transform: uppercase;
        color: #4365a6;
        letter-spacing: 0.04em;
      }

      .rs-total-value {
        font-weight: 700;
        font-size: 16px;
        color: #214377;
      }

      .rs-log {
        background: rgba(248, 250, 255, 0.9);
        border: 1px solid #e1e7f5;
        border-radius: 8px;
        max-height: 120px;
        overflow-y: auto;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
      }

      .rs-log-entry {
        display: flex;
        gap: 6px;
        line-height: 1.3;
      }

      .rs-log-entry::before {
        content: "•";
      }

      .rs-log-entry.ok {
        color: #28a745;
      }

      .rs-log-entry.err {
        color: #d93025;
      }

      .rs-log-entry.warn {
        color: #e37400;
      }

      .rs-log-entry.info {
        color: #0b6bff;
      }
    `;
  }

























