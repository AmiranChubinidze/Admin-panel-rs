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

  function waitForDom() {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  async function initialize() {
    await loadPanelState();
    const { panelEnabled } = await storageGet("panelEnabled");
    state.panelEnabled = panelEnabled !== false;
    await updateAccount();
    injectPanel();
    applySavedPanelState();
    attachStorageListeners();
    attachRuntimeListeners();
    chrome.runtime.sendMessage({ action: "attachDebugger" });
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
    return `${getMonthByValue(month).label} ${year}`;
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
    if (!saved) return;
    if (saved.monthKey) state.monthKey = saved.monthKey;
    if (typeof saved.total === "number") state.total = saved.total;
    if (saved.activeTab === "declarations" || saved.activeTab === "invoices") {
      state.activeTab = saved.activeTab;
    }
    updateCalendarDisplay();
    updateTotalDisplay();
    setActiveTab(state.activeTab, { skipPersist: true, skipPause: true, force: true });
  }

  function persistPanelState() {
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
    const response = await sendMessage({ action: "getActiveAccount" });
    state.account = response?.token ? response : null;
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
    container.className = "rs-panel";
    container.innerHTML = getPanelMarkup();

    shadow.append(style, container);

    refs.shadow = shadow;
    refs.container = container;
    refs.handle = container.querySelector(".rs-handle");
    refs.accountLabel = container.querySelector(".rs-account-label");
    refs.loginHint = container.querySelector(".rs-account-hint");
    refs.tabs = Array.from(container.querySelectorAll(".rs-tab"));
    refs.sections = {
      invoices: container.querySelector(".rs-section-invoices"),
      declarations: container.querySelector(".rs-section-declarations"),
    };
    refs.monthSelect = container.querySelector(".rs-month");
    refs.yearSelect = container.querySelector(".rs-year");
    refs.totalValue = container.querySelector("#rs-total-value");
    refs.invoiceStartBtn = container.querySelector("#rs-invoice-start");
    refs.invoiceStopBtn = container.querySelector("#rs-invoice-stop");
    refs.declarationStartBtn = container.querySelector("#rs-declaration-start");
    refs.declarationStopBtn = container.querySelector("#rs-declaration-stop");
    refs.invoiceLog = container.querySelector("#rs-invoice-log");
    refs.declarationLog = container.querySelector("#rs-declaration-log");
    refs.checkAll = container.querySelector("#rs-use-checkall");

    container.classList.toggle("rs-hidden", !state.panelEnabled);

    populateCalendarSelectors();
    restorePanelPosition();
    bindPanelEvents();
    updateAccountDisplay();
    updateCalendarDisplay();
    updateTotalDisplay();
    updateButtons();
    setActiveTab(state.activeTab, { skipPersist: true, skipPause: true, force: true });
  }

  function getPanelMarkup() {
    return `
      <div class="rs-wrap">
        <header class="rs-handle">
          <div>
            <div class="rs-title">Amnairi RS Assistant</div>
            <div class="rs-sub">ავტომატიზაცია RS.ge-ზე</div>
          </div>
          <div class="rs-account">
            <div class="rs-account-label">ანგარიში არ არის</div>
            <div class="rs-account-hint">შედით პოპაპიდან.</div>
          </div>
        </header>
        <nav class="rs-tabs">
          <button type="button" class="rs-tab active" data-tab="invoices">ზედნადებები</button>
          <button type="button" class="rs-tab" data-tab="declarations">დეკლარაციები</button>
        </nav>
        <section class="rs-body">
          <div class="rs-section rs-section-invoices active">
            <label class="rs-checkbox">
              <input type="checkbox" id="rs-use-checkall" />
              <span>ყველას მონიშვნა (ერთი კონტრაგენტისთვის)</span>
            </label>
            <div class="rs-actions">
              <button type="button" class="rs-btn rs-btn-primary" id="rs-invoice-start">დაწყება</button>
              <button type="button" class="rs-btn rs-btn-muted" id="rs-invoice-stop">შეჩერება</button>
            </div>
            <div class="rs-block">
              <div class="rs-block-title">ჟურნალი</div>
              <div class="rs-log" id="rs-invoice-log"></div>
            </div>
          </div>
          <div class="rs-section rs-section-declarations">
            <div class="rs-row">
              <label>
                თვე
                <select class="rs-month"></select>
              </label>
              <label>
                წელი
                <select class="rs-year"></select>
              </label>
            </div>
            <div class="rs-block">
              <div class="rs-block-title">სულ ზედნადებები</div>
              <div class="rs-total" id="rs-total-value">₾ 0.00</div>
            </div>
            <div class="rs-actions">
              <button type="button" class="rs-btn rs-btn-primary" id="rs-declaration-start">დეკლარაციის გაგზავნა</button>
              <button type="button" class="rs-btn rs-btn-muted" id="rs-declaration-stop">შეჩერება</button>
            </div>
            <div class="rs-block">
              <div class="rs-block-title">ჟურნალი</div>
              <div class="rs-log" id="rs-declaration-log"></div>
            </div>
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

    if (refs.invoiceStartBtn) refs.invoiceStartBtn.addEventListener("click", handleInvoiceStart);
    if (refs.invoiceStopBtn) refs.invoiceStopBtn.addEventListener("click", () => pauseAutomation(true));
    if (refs.declarationStartBtn) refs.declarationStartBtn.addEventListener("click", handleDeclarationStart);
    if (refs.declarationStopBtn) refs.declarationStopBtn.addEventListener("click", handleDeclarationStop);

    if (refs.checkAll) {
      const saved = localStorage.getItem("rs_use_checkall");
      refs.checkAll.checked = saved === null ? true : saved === "true";
      refs.checkAll.addEventListener("change", () => {
        localStorage.setItem("rs_use_checkall", String(refs.checkAll.checked));
      });
    }

    setupDragging();
  }

  function updateAccountDisplay() {
    if (!refs.accountLabel || !refs.loginHint) return;
    if (state.account?.token) {
      refs.accountLabel.textContent = state.account.label || "Amnairi";
      refs.loginHint.textContent = "აირჩიეთ ტაბი და დაიწყეთ ავტომატიზაცია.";
      refs.loginHint.style.color = "#4b5563";
    } else {
      refs.accountLabel.textContent = "ანგარიში არ არის დადასტურებული";
      refs.loginHint.textContent = "გთხოვთ, გაიაროთ ავტორიზაცია პოპაპიდან.";
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
    if (refs.invoiceStartBtn) refs.invoiceStartBtn.disabled = !hasAccount || state.isRunning;
    if (refs.invoiceStopBtn) refs.invoiceStopBtn.disabled = !state.isRunning;
    if (refs.declarationStartBtn) refs.declarationStartBtn.disabled = !hasAccount || state.declarationRunning;
    if (refs.declarationStopBtn) refs.declarationStopBtn.disabled = !state.declarationRunning;
    if (refs.container) {
      refs.container.classList.toggle("rs-running", state.isRunning || state.declarationRunning);
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
      pushLog("warn", "ზედნადებების ავტომატიზაცია შეჩერდა.", "invoices");
    }
    if (shouldLog && stoppedDeclarations) {
      pushLog("warn", "დეკლარაციის პროცესის შეჩერება მოთხოვნილია.", "declarations");
    }

    updateButtons();
  }

  function setActiveTab(tab, options = {}) {
    const target = tab === "declarations" ? "declarations" : "invoices";
    if (!options.force && target === state.activeTab) return;

    if (!options.skipPause) pauseAutomation(true);

    state.activeTab = target;

    if (refs.tabs) {
      refs.tabs.forEach((tabEl) => {
        tabEl.classList.toggle("active", tabEl.dataset.tab === target);
      });
    }

    if (refs.sections) {
      Object.entries(refs.sections).forEach(([key, section]) => {
        if (section) section.classList.toggle("active", key === target);
      });
    }

    if (!options.skipPersist) persistPanelState();
  }

  function pushLog(type, message, scope) {
    const destination = scope || state.currentLogScope || "invoices";
    const logElement = destination === "declarations" ? refs.declarationLog : refs.invoiceLog;
    if (!logElement) return;
    const line = document.createElement("div");
    line.className = `rs-log-entry ${type}`;
    const time = new Date().toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" });
    line.textContent = `[${time}] ${message}`;
    logElement.appendChild(line);
    while (logElement.children.length > 80) {
      logElement.removeChild(logElement.firstChild);
    }
    logElement.scrollTop = logElement.scrollHeight;
  }

  async function handleInvoiceStart() {
    if (state.isRunning || !state.account?.token) return;
    state.currentLogScope = "invoices";
    state.isRunning = true;
    state.invoiceAutomationActive = true;
    updateButtons();
    pushLog("info", "ზედნადებების ავტომატიზაცია დაიწყო.", "invoices");

    try {
      await runInvoiceAutomation();
      pushLog("ok", "ზედნადებების ავტომატიზაცია დასრულდა.", "invoices");
    } catch (error) {
      pushLog("err", error?.message || "ზედნადებების ავტომატიზაცია შეჩერდა შეცდომით.", "invoices");
    } finally {
      state.isRunning = false;
      state.invoiceAutomationActive = false;
      updateButtons();
    }
  }

  function handleDeclarationStop() {
    if (!state.declarationRunning) return;
    state.declarationCancelRequested = true;
    pushLog("warn", "დეკლარაციის პროცესის შეჩერება მოთხოვნილია.", "declarations");
  }

  async function handleDeclarationStart() {
    if (state.declarationRunning || !state.account?.token) return;
    state.currentLogScope = "declarations";
    state.declarationCancelRequested = false;
    state.declarationRunning = true;
    updateButtons();

    const monthLabel = formatMonthLabel(state.monthKey);
    pushLog("info", `დეკლარაციების პროცესი დაიწყო: ${monthLabel}`, "declarations");

    try {
      const response = await sendMessage({
        action: "fetchWaybillTotal",
        token: state.account.token,
        month: state.monthKey,
      });

      if (!response?.ok) {
        throw new Error(response?.message || "ზედნადებების ჯამი ვერ მოიძებნა.");
      }

      state.total = response.total;
      updateTotalDisplay();
      persistPanelState();
      pushLog("ok", `ჯამი განახლდა: ${formatCurrency(response.total)}`, "declarations");

      await runDeclarationAutomation();
      if (!state.declarationCancelRequested) {
        pushLog("ok", "დეკლარაციის გაგზავნა დასრულდა.", "declarations");
      }
    } catch (error) {
      const message = state.declarationCancelRequested
        ? "დეკლარაციის პროცესი შეჩერდა."
        : error?.message || "დეკლარაციის გაგზავნა ვერ შესრულდა.";
      pushLog("err", message, "declarations");
    } finally {
      state.declarationRunning = false;
      state.declarationCancelRequested = false;
      updateButtons();
    }
  }
  async function runDeclarationAutomation() {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const [year, month] = state.monthKey.split("-");
    const monthName = getMonthByValue(month).label;

    const clickOrThrow = async (factory, description, delay = 300) => {
      if (state.declarationCancelRequested) throw new Error("დეკლარაციის პროცესი შეჩერდა.");
      const node = factory();
      if (!node) throw new Error(`${description} ვერ მოიძებნა.`);
      node.click();
      await sleep(delay);
    };

    const findCell = (root, matcher) => {
      const cells = Array.from(root.querySelectorAll("td"));
      return cells.find((cell) => matcher((cell.textContent || cell.innerText || "").trim()));
    };

    await clickOrThrow(() => document.querySelector("#hka1 > a"), "დეკლარაციების მენიუ");
    await clickOrThrow(
      () => findCell(document, (text) => /დეკლარ/i.test(text) || /Declaration/i.test(text)),
      "დეკლარაციების განყოფილება"
    );
    await clickOrThrow(() => document.querySelector("div.d_img_def"), "ფილტრების ღილაკი");

    const popup = document.querySelector("div.d_div.ks_popup");
    if (!popup) throw new Error("ფილტრის ფანჯარა ვერ მოიძებნა.");

    await clickOrThrow(() => findCell(popup, (text) => text === year), `${year} წლის არჩევა`);
    await clickOrThrow(() => findCell(popup, (text) => text === monthName), `${monthName} თვის არჩევა`);
    await clickOrThrow(() => document.querySelector(".d_ok_img"), "დადასტურების ღილაკი");
    await clickOrThrow(() => document.querySelector("#control_0_new"), "დეკლარაციის შექმნის ღილაკი", 600);
  }

  async function runInvoiceAutomation() {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let index = 0;

    while (state.invoiceAutomationActive) {
      const rows = Array.from(document.querySelectorAll("tr.rsGridDataRow, tr.rsGridDataRowAlt"));
      if (!rows.length || index >= rows.length) break;
      const row = rows[index];
      if (!row) break;

      const flagged = Array.from(row.querySelectorAll("td")).some((td) => {
        const text = (td.getAttribute("title") || td.textContent || "").trim();
        return /უკან დაბრუნება/i.test(text) || /return/i.test(text);
      });

      const checkbox = row.querySelector('input[type="checkbox"][value]');
      if (!checkbox) {
        if (flagged) index += 1;
        await sleep(120);
        continue;
      }

      checkbox.click();
      await sleep(150);

      const useCheckAll = (localStorage.getItem("rs_use_checkall") ?? "true") === "true";
      const checkAll = document.querySelector('input[type="checkbox"][style=""]');
      if (useCheckAll && !flagged && checkAll && !checkAll.checked) {
        checkAll.click();
        await sleep(120);
      }

      const createButton =
        document.querySelector("#tool11") ||
        Array.from(document.querySelectorAll('input[type="button"], button')).find((el) => {
          const text = (el.value || el.innerText || "").trim();
          return /ანგარიშ-ფაქტურის შექმნა/i.test(text) || /Create Invoice/i.test(text);
        });

      if (!createButton) {
        throw new Error("ანგარიშ-ფაქტურის ღილაკი ვერ მოიძებნა.");
      }

      createButton.click();
      await sleep(900);

      if (checkAll && checkAll.checked) {
        checkAll.click();
      }

      if (flagged) {
        index += 1;
      }

      await sleep(140);
    }
  }

  function setupDragging() {
    if (!refs.handle || !refs.container) return;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    refs.handle.addEventListener("pointerdown", (event) => {
      dragging = true;
      const rect = refs.container.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      refs.handle.setPointerCapture(event.pointerId);
    });

    refs.handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const x = Math.max(10, Math.min(event.clientX - offsetX, window.innerWidth - refs.container.offsetWidth - 10));
      const y = Math.max(10, Math.min(event.clientY - offsetY, window.innerHeight - refs.container.offsetHeight - 10));
      refs.container.style.left = `${x}px`;
      refs.container.style.top = `${y}px`;
    });

    const release = (event) => {
      if (!dragging) return;
      dragging = false;
      refs.handle.releasePointerCapture(event.pointerId);
      savePanelPosition();
    };

    refs.handle.addEventListener("pointerup", release);
    refs.handle.addEventListener("pointercancel", release);
  }

  function restorePanelPosition() {
    if (!refs.container) return;
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
        refs.container.style.left = `${saved.left}px`;
        refs.container.style.top = `${saved.top}px`;
        return;
      }
    } catch (_) {
      // ignore
    }
    const defaultLeft = Math.max(24, window.innerWidth - 280);
    refs.container.style.left = `${defaultLeft}px`;
    refs.container.style.top = "90px";
  }

  function savePanelPosition() {
    if (!refs.container) return;
    const rect = refs.container.getBoundingClientRect();
    localStorage.setItem(POSITION_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
  }

  function blinkPanel() {
    if (!refs.container) return;
    refs.container.classList.add("rs-focus");
    setTimeout(() => refs.container?.classList.remove("rs-focus"), 800);
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
        if (refs.container) refs.container.classList.toggle("rs-hidden", !state.panelEnabled);
      }

      if (changes[STORAGE_PANEL_STATE]) {
        state.savedPanelState = changes[STORAGE_PANEL_STATE].newValue ?? {};
        applySavedPanelState();
      }
    });
  }

  function attachRuntimeListeners() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return;

      if (message.action === "logoutRequired") {
        pauseAutomation(false);
        state.account = null;
        updateAccountDisplay();
        updateButtons();
        pushLog("warn", "სესია დასრულდა. გთხოვთ, გაიაროთ ავტორიზაცია თავიდან.", "invoices");
        pushLog("warn", "სესია დასრულდა. გთხოვთ, გაიაროთ ავტორიზაცია თავიდან.", "declarations");
        setActiveTab("invoices", { skipPause: true, force: true });
      }

      if (message.action === "stopAutomation") {
        pauseAutomation(true);
      }

      if (message.action === "focusPanel") {
        state.panelEnabled = true;
        if (refs.container) refs.container.classList.remove("rs-hidden");
        const target = message.target === "declarations" ? "declarations" : "invoices";
        setActiveTab(target, { skipPause: true, force: true });
        blinkPanel();
      }
    });
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (data) => resolve(data));
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
      } catch (error) {
        console.warn("Messaging failure:", error);
        resolve(undefined);
      }
    });
  }

  function getPanelStyles() {
    return `
      :host,
      .rs-panel,
      .rs-panel * {
        font-family: "Inter", "Noto Sans Georgian", system-ui, sans-serif;
        box-sizing: border-box;
      }

      .rs-panel {
        position: fixed;
        top: 90px;
        left: 24px;
        width: 260px;
        background: #ffffff;
        border: 1px solid rgba(15, 98, 212, 0.2);
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(15, 64, 134, 0.15);
        padding: 12px;
        color: #1f2a44;
        z-index: 2147483647;
      }

      .rs-panel.rs-hidden {
        display: none !important;
      }

      .rs-wrap {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .rs-handle {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        cursor: grab;
        user-select: none;
      }

      .rs-title {
        font-size: 14px;
        font-weight: 600;
      }

      .rs-sub {
        font-size: 11px;
        color: #64748b;
      }

      .rs-account {
        text-align: right;
      }

      .rs-account-label {
        font-size: 12px;
        font-weight: 600;
        color: #1d4ed8;
      }

      .rs-account-hint {
        font-size: 11px;
        color: #64748b;
      }

      .rs-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border-radius: 8px;
        overflow: hidden;
        background: rgba(15, 98, 212, 0.12);
      }

      .rs-tab {
        padding: 6px 0;
        border: none;
        background: transparent;
        color: #2563eb;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
      }

      .rs-tab.active {
        background: rgba(37, 99, 235, 0.16);
        color: #0f172a;
      }

      .rs-body {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .rs-section {
        display: none;
        flex-direction: column;
        gap: 10px;
      }

      .rs-section.active {
        display: flex;
      }

      .rs-checkbox {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 12px;
      }

      .rs-checkbox input {
        width: 16px;
        height: 16px;
      }

      .rs-row {
        display: flex;
        gap: 10px;
      }

      .rs-row label {
        flex: 1;
        font-size: 11px;
        color: #475569;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .rs-row select {
        padding: 5px 6px;
        border: 1px solid rgba(15, 98, 212, 0.35);
        border-radius: 6px;
        font-size: 12px;
        background: #f8fafc;
      }

      .rs-block {
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 8px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .rs-block-title {
        font-size: 11px;
        color: #475569;
      }

      .rs-total {
        font-size: 16px;
        font-weight: 600;
        color: #1d4ed8;
      }

      .rs-actions {
        display: flex;
        gap: 8px;
      }

      .rs-btn {
        flex: 1;
        padding: 8px;
        border-radius: 6px;
        border: none;
        font-weight: 600;
        cursor: pointer;
      }

      .rs-btn-primary {
        background: #2563eb;
        color: white;
      }

      .rs-btn-muted {
        background: rgba(37, 99, 235, 0.12);
        color: #2563eb;
      }

      .rs-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .rs-log {
        max-height: 120px;
        overflow-y: auto;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .rs-log-entry {
        padding: 4px 6px;
        border-left: 3px solid transparent;
      }

      .rs-log-entry.ok {
        border-color: #22c55e;
        color: #15803d;
      }

      .rs-log-entry.err {
        border-color: #ef4444;
        color: #b91c1c;
      }

      .rs-log-entry.warn {
        border-color: #f97316;
        color: #b45309;
      }

      .rs-log-entry.info {
        border-color: #2563eb;
        color: #2563eb;
      }

      .rs-running .rs-btn-primary {
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
      }

      .rs-focus {
        animation: rsPulse 0.8s ease;
      }

      @keyframes rsPulse {
        0% {
          box-shadow: 0 0 0 rgba(37, 99, 235, 0.4);
        }
        50% {
          box-shadow: 0 0 18px rgba(37, 99, 235, 0.5);
        }
        100% {
          box-shadow: 0 0 0 rgba(37, 99, 235, 0.4);
        }
      }
    `;
  }
})();
