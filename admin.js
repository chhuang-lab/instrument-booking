(() => {
  "use strict";

  const API = window.BOOKING_CONFIG.apiBase.replace(/\/$/, "");
  const TIME_ZONE = window.BOOKING_CONFIG.timeZone;
  const messages = {
    zh: {
      adminTitle: "預約管理",
      adminTitleEn: "Booking Administration",
      loginTitle: "管理員登入",
      password: "管理密碼",
      login: "登入",
      loggingIn: "登入中…",
      recordsTitle: "預約紀錄",
      all: "全部",
      active: "有效",
      cancelled: "已取消",
      refresh: "重新整理",
      export: "匯出 CSV",
      logout: "登出",
      bookingCode: "預約編號",
      time: "預約時間",
      labManager: "實驗室負責人",
      operator: "操作人",
      extension: "分機",
      notes: "備註",
      status: "狀態",
      action: "操作",
      cancel: "取消",
      noRecords: "沒有符合條件的預約紀錄。",
      loginFailed: "密碼不正確。",
      notConfigured: "管理密碼尚未完成設定。",
      sessionExpired: "登入已逾時，請重新登入。",
      connectionError: "目前無法連線，請稍後再試。",
      cancelConfirm: "確定要由管理員取消預約 {code}？",
      cancelReason: "取消原因（可留空）",
      cancelDone: "預約 {code} 已取消。",
    },
    en: {
      adminTitle: "Booking Administration",
      adminTitleEn: "DLS Reservation Service",
      loginTitle: "Administrator login",
      password: "Administrator password",
      login: "Sign in",
      loggingIn: "Signing in…",
      recordsTitle: "Booking records",
      all: "All",
      active: "Active",
      cancelled: "Cancelled",
      refresh: "Refresh",
      export: "Export CSV",
      logout: "Sign out",
      bookingCode: "Booking number",
      time: "Booking time",
      labManager: "Laboratory supervisor",
      operator: "Operator",
      extension: "Extension",
      notes: "Notes",
      status: "Status",
      action: "Action",
      cancel: "Cancel",
      noRecords: "No matching booking records.",
      loginFailed: "The password is incorrect.",
      notConfigured: "The administrator password has not been configured.",
      sessionExpired: "Your session has expired. Sign in again.",
      connectionError: "The service cannot be reached. Try again later.",
      cancelConfirm: "Cancel booking {code} as administrator?",
      cancelReason: "Cancellation reason (optional)",
      cancelDone: "Booking {code} has been cancelled.",
    },
  };

  let language = localStorage.getItem("booking-language") === "en" ? "en" : "zh";
  let token = sessionStorage.getItem("admin-token") || "";
  const els = {
    languageToggle: document.querySelector("#language-toggle"),
    loginPanel: document.querySelector("#login-panel"),
    loginForm: document.querySelector("#login-form"),
    loginMessage: document.querySelector("#login-message"),
    loginSubmit: document.querySelector("#login-submit"),
    adminPanel: document.querySelector("#admin-panel"),
    adminMessage: document.querySelector("#admin-message"),
    rows: document.querySelector("#booking-rows"),
    statusFilter: document.querySelector("#status-filter"),
    refresh: document.querySelector("#refresh-admin"),
    exportCsv: document.querySelector("#export-csv"),
    logout: document.querySelector("#logout"),
  };

  function t(key, replacements = {}) {
    let value = messages[language][key] || key;
    for (const [name, replacement] of Object.entries(replacements)) value = value.replaceAll(`{${name}}`, replacement);
    return value;
  }

  function applyLanguage() {
    document.documentElement.lang = language === "zh" ? "zh-Hant" : "en";
    document.title = t("adminTitle");
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
    els.languageToggle.textContent = language === "zh" ? "English" : "中文";
  }

  async function login(event) {
    event.preventDefault();
    els.loginMessage.textContent = "";
    els.loginSubmit.disabled = true;
    els.loginSubmit.textContent = t("loggingIn");
    const password = new FormData(els.loginForm).get("password");
    try {
      const data = await request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      }, false);
      token = data.token;
      sessionStorage.setItem("admin-token", token);
      els.loginForm.reset();
      showAdmin();
      await loadBookings();
    } catch (error) {
      els.loginMessage.textContent = error.code === "ADMIN_NOT_CONFIGURED"
        ? t("notConfigured")
        : error.code === "INVALID_ADMIN_PASSWORD" ? t("loginFailed") : t("connectionError");
    } finally {
      els.loginSubmit.disabled = false;
      els.loginSubmit.textContent = t("login");
    }
  }

  async function loadBookings() {
    els.adminMessage.textContent = "";
    try {
      const data = await request(`/api/admin/bookings?status=${encodeURIComponent(els.statusFilter.value)}`);
      renderRows(data.bookings || []);
    } catch (error) {
      handleAdminError(error);
    }
  }

  function renderRows(bookings) {
    els.rows.textContent = "";
    if (!bookings.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.className = "empty-state";
      cell.textContent = t("noRecords");
      row.append(cell);
      els.rows.append(row);
      return;
    }
    for (const booking of bookings) {
      const row = document.createElement("tr");
      addCell(row, booking.booking_code);
      addCell(row, `${formatDateTime(booking.start_at)} – ${formatDateTime(booking.end_at)}`);
      addCell(row, booking.lab_manager);
      addCell(row, booking.operator_name);
      addCell(row, booking.extension_phone);
      addCell(row, booking.notes || "");

      const statusCell = document.createElement("td");
      const tag = document.createElement("span");
      tag.className = `status-tag ${booking.status}`;
      tag.textContent = t(booking.status);
      statusCell.append(tag);
      row.append(statusCell);

      const actionCell = document.createElement("td");
      if (booking.status === "active") {
        const button = document.createElement("button");
        button.className = "small-danger";
        button.type = "button";
        button.textContent = t("cancel");
        button.addEventListener("click", () => cancelBooking(booking.booking_code));
        actionCell.append(button);
      }
      row.append(actionCell);
      els.rows.append(row);
    }
  }

  function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value ?? "";
    row.append(cell);
  }

  async function cancelBooking(code) {
    if (!confirm(t("cancelConfirm", { code }))) return;
    const reason = prompt(t("cancelReason")) ?? "";
    try {
      await request(`/api/admin/bookings/${encodeURIComponent(code)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      els.adminMessage.classList.add("is-success");
      els.adminMessage.textContent = t("cancelDone", { code });
      await loadBookings();
    } catch (error) {
      handleAdminError(error);
    }
  }

  async function exportCsv() {
    try {
      const response = await fetch(`${API}/api/admin/export.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) throw Object.assign(new Error("Unauthorized"), { code: "ADMIN_AUTH_REQUIRED" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `instrument-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      handleAdminError(error);
    }
  }

  async function request(path, options = {}, useAuth = true) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (useAuth && token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    let data;
    try { data = await response.json(); } catch { data = { error: "SERVER_ERROR" }; }
    if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || "SERVER_ERROR"), { code: data.error });
    return data;
  }

  function handleAdminError(error) {
    if (error.code === "ADMIN_AUTH_REQUIRED") {
      token = "";
      sessionStorage.removeItem("admin-token");
      showLogin();
      els.loginMessage.textContent = t("sessionExpired");
    } else {
      els.adminMessage.textContent = t("connectionError");
    }
  }

  function showAdmin() {
    els.loginPanel.classList.add("is-hidden");
    els.adminPanel.classList.remove("is-hidden");
  }

  function showLogin() {
    els.adminPanel.classList.add("is-hidden");
    els.loginPanel.classList.remove("is-hidden");
  }

  function logout() {
    token = "";
    sessionStorage.removeItem("admin-token");
    showLogin();
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  }

  els.languageToggle.addEventListener("click", () => {
    language = language === "zh" ? "en" : "zh";
    localStorage.setItem("booking-language", language);
    applyLanguage();
    if (!els.adminPanel.classList.contains("is-hidden")) loadBookings();
  });
  els.loginForm.addEventListener("submit", login);
  els.statusFilter.addEventListener("change", loadBookings);
  els.refresh.addEventListener("click", loadBookings);
  els.exportCsv.addEventListener("click", exportCsv);
  els.logout.addEventListener("click", logout);

  applyLanguage();
  if (token) {
    showAdmin();
    loadBookings();
  }
})();
