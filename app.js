(() => {
  "use strict";

  const API = window.BOOKING_CONFIG.apiBase.replace(/\/$/, "");
  const TIME_ZONE = window.BOOKING_CONFIG.timeZone;
  const CANCEL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const messages = {
    zh: {
      skip: "跳至主要內容",
      siteTitle: "儀器線上預約系統",
      siteTitleEn: "Instrument Online Booking System",
      alwaysOpen: "全年 24 小時開放預約",
      rulesSummary: "每 30 分鐘一格｜單次最多 3 小時｜可預約未來 14 天",
      checking: "系統檢查中",
      online: "系統正常",
      offline: "系統暫時無法連線",
      navBooking: "新增預約",
      navSchedule: "預約時段",
      navCancel: "取消預約",
      bookingTitle: "新增預約",
      requiredHint: "標示 * 的欄位必填",
      date: "日期 *",
      startTime: "開始時間 *",
      duration: "使用時間 *",
      labManager: "實驗室負責人 *",
      operator: "操作人 *",
      extension: "分機電話 *",
      notes: "備註",
      submitBooking: "確認預約",
      submitting: "預約送出中…",
      scheduleTitle: "未來 14 天預約時段",
      refresh: "重新整理",
      publicFields: "公開顯示時間、實驗室負責人及操作人；分機與備註不公開。",
      loading: "讀取中…",
      available: "目前無預約",
      cancelTitle: "取消預約",
      cancelRule: "開始時間前可自行取消；開始時間到達後請聯絡管理員。",
      bookingCode: "預約編號 *",
      cancelCode: "取消碼 *",
      bookingCodePlain: "預約編號",
      cancelCodePlain: "取消碼",
      submitCancel: "確認取消",
      cancelling: "取消處理中…",
      footerText: "DLS 儀器預約管理",
      adminLink: "管理員登入",
      successTitle: "預約成功",
      saveCodes: "請立即保存以下資料，取消預約時需要同時輸入。",
      copyCodes: "複製資料",
      copied: "已複製",
      done: "完成",
      timeSummary: "預約時段：{start} 至 {end}",
      conflictWarning: "此時段與現有預約重疊，請重新選擇。",
      cancelledSuccess: "預約 {code} 已取消。",
      alreadyCancelled: "此預約已經取消。",
      required: "請完整填寫所有必填欄位。",
      connectionError: "目前無法連線至預約系統，請稍後再試。",
      BOOKING_CONFLICT: "此時段剛被其他人預約，請重新選擇。",
      START_IN_PAST: "開始時間必須晚於現在。",
      OUTSIDE_BOOKING_WINDOW: "只能預約未來 14 天內的時段。",
      INVALID_DURATION: "單次預約最長 3 小時。",
      INVALID_SLOT: "預約必須以 30 分鐘為單位。",
      REQUIRED_FIELDS: "請完整填寫所有必填欄位。",
      BOOKING_NOT_FOUND: "預約編號或取消碼不正確。",
      CANCELLATION_CLOSED: "預約已開始，無法自行取消，請聯絡管理員。",
      SERVER_ERROR: "系統暫時發生錯誤，請稍後再試。",
      genericError: "操作未完成，請稍後再試。",
      copyTemplate: "預約編號：{booking}\n取消碼：{cancel}\n預約時段：{time}",
    },
    en: {
      skip: "Skip to main content",
      siteTitle: "Instrument Online Booking System",
      siteTitleEn: "DLS Reservation Service",
      alwaysOpen: "Reservations available 24/7",
      rulesSummary: "30-minute slots | Maximum 3 hours | Book up to 14 days ahead",
      checking: "Checking service",
      online: "System online",
      offline: "System temporarily unavailable",
      navBooking: "New booking",
      navSchedule: "Schedule",
      navCancel: "Cancel booking",
      bookingTitle: "New booking",
      requiredHint: "Fields marked * are required",
      date: "Date *",
      startTime: "Start time *",
      duration: "Duration *",
      labManager: "Laboratory supervisor *",
      operator: "Operator *",
      extension: "Extension number *",
      notes: "Notes",
      submitBooking: "Confirm booking",
      submitting: "Submitting…",
      scheduleTitle: "Bookings for the next 14 days",
      refresh: "Refresh",
      publicFields: "Times, laboratory supervisors and operators are public. Extensions and notes remain private.",
      loading: "Loading…",
      available: "No bookings",
      cancelTitle: "Cancel booking",
      cancelRule: "Self-service cancellation is available until the booking starts. Contact the administrator afterward.",
      bookingCode: "Booking number *",
      cancelCode: "Cancellation code *",
      bookingCodePlain: "Booking number",
      cancelCodePlain: "Cancellation code",
      submitCancel: "Cancel booking",
      cancelling: "Cancelling…",
      footerText: "DLS instrument booking",
      adminLink: "Administrator login",
      successTitle: "Booking confirmed",
      saveCodes: "Save both codes now. You will need them to cancel this booking.",
      copyCodes: "Copy details",
      copied: "Copied",
      done: "Done",
      timeSummary: "Booking time: {start} to {end}",
      conflictWarning: "This period overlaps an existing booking. Choose another time.",
      cancelledSuccess: "Booking {code} has been cancelled.",
      alreadyCancelled: "This booking has already been cancelled.",
      required: "Complete all required fields.",
      connectionError: "The booking service cannot be reached. Try again later.",
      BOOKING_CONFLICT: "Someone has just booked this period. Choose another time.",
      START_IN_PAST: "The start time must be in the future.",
      OUTSIDE_BOOKING_WINDOW: "Bookings are limited to the next 14 days.",
      INVALID_DURATION: "A booking may not exceed 3 hours.",
      INVALID_SLOT: "Bookings must use 30-minute increments.",
      REQUIRED_FIELDS: "Complete all required fields.",
      BOOKING_NOT_FOUND: "The booking number or cancellation code is incorrect.",
      CANCELLATION_CLOSED: "This booking has started and can no longer be self-cancelled. Contact the administrator.",
      SERVER_ERROR: "The service encountered an error. Try again later.",
      genericError: "The operation was not completed. Try again later.",
      copyTemplate: "Booking number: {booking}\nCancellation code: {cancel}\nBooking time: {time}",
    },
  };

  let language = localStorage.getItem("booking-language") === "en" ? "en" : "zh";
  let instrument = null;
  let publicBookings = [];
  let latestReceipt = null;

  const els = {
    languageToggle: document.querySelector("#language-toggle"),
    serviceStatus: document.querySelector("#service-status"),
    bookingForm: document.querySelector("#booking-form"),
    bookingDate: document.querySelector("#booking-date"),
    startTime: document.querySelector("#start-time"),
    duration: document.querySelector("#duration"),
    timeSummary: document.querySelector("#time-summary"),
    conflictWarning: document.querySelector("#conflict-warning"),
    bookingMessage: document.querySelector("#booking-message"),
    bookingSubmit: document.querySelector("#booking-submit"),
    scheduleLoading: document.querySelector("#schedule-loading"),
    scheduleGrid: document.querySelector("#schedule-grid"),
    refreshSchedule: document.querySelector("#refresh-schedule"),
    cancelForm: document.querySelector("#cancel-form"),
    cancelMessage: document.querySelector("#cancel-message"),
    cancelSubmit: document.querySelector("#cancel-submit"),
    receiptDialog: document.querySelector("#receipt-dialog"),
    receiptBookingCode: document.querySelector("#receipt-booking-code"),
    receiptCancelCode: document.querySelector("#receipt-cancel-code"),
    receiptTime: document.querySelector("#receipt-time"),
    copyReceipt: document.querySelector("#copy-receipt"),
    closeReceipt: document.querySelector("#close-receipt"),
  };

  function t(key, replacements = {}) {
    let value = messages[language][key] || messages.zh[key] || key;
    for (const [name, replacement] of Object.entries(replacements)) {
      value = value.replaceAll(`{${name}}`, replacement);
    }
    return value;
  }

  function applyLanguage() {
    document.documentElement.lang = language === "zh" ? "zh-Hant" : "en";
    document.title = language === "zh" ? "儀器線上預約系統" : "Instrument Online Booking System";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    els.languageToggle.textContent = language === "zh" ? "English" : "中文";
    updateTimeSummary();
    renderSchedule();
  }

  function buildTimeOptions() {
    els.startTime.textContent = "";
    for (let minutes = 0; minutes < 1440; minutes += 30) {
      const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
      const mins = String(minutes % 60).padStart(2, "0");
      const option = document.createElement("option");
      option.value = `${hours}:${mins}`;
      option.textContent = option.value;
      els.startTime.append(option);
    }
  }

  function initializeDates() {
    const now = new Date();
    const today = taipeiDate(now);
    els.bookingDate.min = today;
    els.bookingDate.max = taipeiDate(new Date(now.getTime() + 14 * 86400000));
    els.bookingDate.value = today;
    chooseNextAvailableTime();
  }

  function chooseNextAvailableTime() {
    const now = Date.now();
    let candidate = Math.ceil((now + 60000) / 1800000) * 1800000;
    for (let attempt = 0; attempt < 48 * 14; attempt += 1) {
      const date = new Date(candidate);
      const ymd = taipeiDate(date);
      const hm = taipeiTime(date);
      const end = candidate + Number(els.duration.value) * 60000;
      if (!hasConflict(candidate, end)) {
        els.bookingDate.value = ymd;
        els.startTime.value = hm;
        break;
      }
      candidate += 1800000;
    }
    updateTimeAvailability();
  }

  function updateTimeAvailability() {
    const now = Date.now();
    const latest = now + 14 * 86400000;
    [...els.startTime.options].forEach((option) => {
      const value = parseTaipei(els.bookingDate.value, option.value).getTime();
      option.disabled = value <= now || value > latest;
    });
    if (els.startTime.selectedOptions[0]?.disabled) {
      const firstEnabled = [...els.startTime.options].find((option) => !option.disabled);
      if (firstEnabled) els.startTime.value = firstEnabled.value;
    }
    updateTimeSummary();
  }

  function selectedRange() {
    if (!els.bookingDate.value || !els.startTime.value) return null;
    const start = parseTaipei(els.bookingDate.value, els.startTime.value);
    const end = new Date(start.getTime() + Number(els.duration.value) * 60000);
    return { start, end };
  }

  function updateTimeSummary() {
    const range = selectedRange();
    if (!range) return;
    const start = formatDateTime(range.start);
    const end = formatDateTime(range.end);
    els.timeSummary.textContent = t("timeSummary", { start, end });
    const conflict = hasConflict(range.start.getTime(), range.end.getTime());
    els.conflictWarning.textContent = t("conflictWarning");
    els.conflictWarning.classList.toggle("is-hidden", !conflict);
  }

  function hasConflict(startMs, endMs) {
    return publicBookings.some((booking) => {
      const existingStart = Date.parse(booking.start_at);
      const existingEnd = Date.parse(booking.end_at);
      return existingStart < endMs && existingEnd > startMs;
    });
  }

  async function loadInitialData() {
    try {
      const data = await api("/api/instruments");
      instrument = data.instruments[0] || null;
      if (!instrument) throw new Error("No active instrument");
      setStatus("online");
      await loadSchedule();
    } catch (error) {
      console.error(error);
      setStatus("offline");
      els.bookingMessage.textContent = t("connectionError");
    }
  }

  async function loadSchedule() {
    els.scheduleLoading.classList.remove("is-hidden");
    els.scheduleGrid.textContent = "";
    const startDate = taipeiDate(new Date());
    const endDate = addTaipeiDays(startDate, 14);
    try {
      const from = parseTaipei(startDate, "00:00").toISOString();
      const to = parseTaipei(endDate, "00:00").toISOString();
      const data = await api(`/api/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      publicBookings = data.bookings || [];
      renderSchedule();
      updateTimeSummary();
    } catch (error) {
      console.error(error);
      els.scheduleLoading.textContent = t("connectionError");
    }
  }

  function renderSchedule() {
    if (!els.scheduleGrid) return;
    els.scheduleGrid.textContent = "";
    const startDate = taipeiDate(new Date());
    for (let day = 0; day < 14; day += 1) {
      const date = addTaipeiDays(startDate, day);
      const bookings = publicBookings.filter((booking) => taipeiDate(new Date(booking.start_at)) === date);
      const card = document.createElement("article");
      card.className = `day-card${day === 0 ? " is-today" : ""}`;

      const heading = document.createElement("header");
      heading.className = "day-heading";
      const strong = document.createElement("strong");
      strong.textContent = formatDay(date);
      const count = document.createElement("span");
      count.textContent = bookings.length ? String(bookings.length) : "";
      heading.append(strong, count);
      card.append(heading);

      if (!bookings.length) {
        const empty = document.createElement("div");
        empty.className = "day-empty";
        empty.textContent = t("available");
        card.append(empty);
      } else {
        const list = document.createElement("ul");
        list.className = "booking-list";
        for (const booking of bookings) {
          const item = document.createElement("li");
          item.className = "booking-item";
          const time = document.createElement("span");
          time.className = "booking-time";
          time.textContent = formatRange(booking.start_at, booking.end_at);
          const who = document.createElement("span");
          who.className = "booking-who";
          who.textContent = `${booking.lab_manager} · ${booking.operator_name}`;
          item.append(time, who);
          list.append(item);
        }
        card.append(list);
      }
      els.scheduleGrid.append(card);
    }
    els.scheduleLoading.classList.add("is-hidden");
  }

  async function submitBooking(event) {
    event.preventDefault();
    clearMessage(els.bookingMessage);
    if (!els.bookingForm.reportValidity()) return;
    if (els.bookingForm.elements.website.value) return;
    if (!instrument) {
      els.bookingMessage.textContent = t("connectionError");
      return;
    }

    const range = selectedRange();
    if (!range || hasConflict(range.start.getTime(), range.end.getTime())) {
      els.bookingMessage.textContent = t("BOOKING_CONFLICT");
      return;
    }

    const formData = new FormData(els.bookingForm);
    const basePayload = {
      instrumentId: instrument.id,
      startAt: range.start.toISOString(),
      endAt: range.end.toISOString(),
      labManager: formData.get("labManager").trim(),
      operatorName: formData.get("operatorName").trim(),
      extensionPhone: formData.get("extensionPhone").trim(),
      notes: formData.get("notes").trim(),
    };
    const signature = JSON.stringify(basePayload);
    let pending = readPending();
    if (!pending || pending.signature !== signature) {
      pending = {
        signature,
        submissionId: crypto.randomUUID(),
        cancelCode: generateCancelCode(),
      };
      sessionStorage.setItem("pending-booking", JSON.stringify(pending));
    }

    setButtonBusy(els.bookingSubmit, true, "submitting", "submitBooking");
    try {
      const data = await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ ...basePayload, submissionId: pending.submissionId, cancelCode: pending.cancelCode }),
      });
      sessionStorage.removeItem("pending-booking");
      latestReceipt = {
        bookingCode: data.booking.bookingCode,
        cancelCode: pending.cancelCode,
        time: `${formatDateTime(range.start)} – ${formatDateTime(range.end)}`,
      };
      showReceipt(latestReceipt);
      els.bookingForm.elements.labManager.value = "";
      els.bookingForm.elements.operatorName.value = "";
      els.bookingForm.elements.extensionPhone.value = "";
      els.bookingForm.elements.notes.value = "";
      await loadSchedule();
    } catch (error) {
      els.bookingMessage.textContent = errorMessage(error);
    } finally {
      setButtonBusy(els.bookingSubmit, false, "submitting", "submitBooking");
    }
  }

  async function submitCancellation(event) {
    event.preventDefault();
    clearMessage(els.cancelMessage);
    if (!els.cancelForm.reportValidity()) return;
    const formData = new FormData(els.cancelForm);
    setButtonBusy(els.cancelSubmit, true, "cancelling", "submitCancel");
    try {
      const data = await api("/api/cancel", {
        method: "POST",
        body: JSON.stringify({
          bookingCode: formData.get("bookingCode").trim().toUpperCase(),
          cancelCode: formData.get("cancelCode").trim().toUpperCase(),
        }),
      });
      els.cancelMessage.classList.add("is-success");
      els.cancelMessage.textContent = data.alreadyCancelled
        ? t("alreadyCancelled")
        : t("cancelledSuccess", { code: data.bookingCode });
      els.cancelForm.reset();
      await loadSchedule();
    } catch (error) {
      els.cancelMessage.textContent = errorMessage(error);
    } finally {
      setButtonBusy(els.cancelSubmit, false, "cancelling", "submitCancel");
    }
  }

  function showReceipt(receipt) {
    els.receiptBookingCode.textContent = receipt.bookingCode;
    els.receiptCancelCode.textContent = receipt.cancelCode;
    els.receiptTime.textContent = receipt.time;
    els.receiptDialog.showModal();
  }

  async function copyReceipt() {
    if (!latestReceipt) return;
    const content = t("copyTemplate", {
      booking: latestReceipt.bookingCode,
      cancel: latestReceipt.cancelCode,
      time: latestReceipt.time,
    });
    await navigator.clipboard.writeText(content);
    els.copyReceipt.textContent = t("copied");
    setTimeout(() => { els.copyReceipt.textContent = t("copyCodes"); }, 1600);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    let data;
    try { data = await response.json(); } catch { data = { error: "SERVER_ERROR" }; }
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || "SERVER_ERROR");
      error.code = data.error || "SERVER_ERROR";
      error.requestId = data.requestId;
      throw error;
    }
    return data;
  }

  function errorMessage(error) {
    if (error instanceof TypeError) return t("connectionError");
    return t(error.code || "genericError");
  }

  function setStatus(status) {
    els.serviceStatus.className = `status-pill is-${status}`;
    els.serviceStatus.textContent = t(status);
  }

  function setButtonBusy(button, busy, busyKey, readyKey) {
    button.disabled = busy;
    button.textContent = t(busy ? busyKey : readyKey);
  }

  function clearMessage(element) {
    element.textContent = "";
    element.classList.remove("is-success");
  }

  function readPending() {
    try { return JSON.parse(sessionStorage.getItem("pending-booking")); } catch { return null; }
  }

  function generateCancelCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return [...bytes].map((byte) => CANCEL_ALPHABET[byte & 31]).join("");
  }

  function parseTaipei(date, time) {
    return new Date(`${date}T${time}:00+08:00`);
  }

  function taipeiDate(date) {
    return partsFor(date).date;
  }

  function taipeiTime(date) {
    return partsFor(date).time;
  }

  function partsFor(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` };
  }

  function addTaipeiDays(date, days) {
    const value = parseTaipei(date, "12:00");
    return taipeiDate(new Date(value.getTime() + days * 86400000));
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "en-GB", {
      timeZone: TIME_ZONE,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  function formatDay(dateString) {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "en-GB", {
      timeZone: TIME_ZONE,
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).format(parseTaipei(dateString, "12:00"));
  }

  function formatRange(startValue, endValue) {
    const start = new Date(startValue);
    const end = new Date(endValue);
    const nextDay = taipeiDate(start) !== taipeiDate(end);
    return `${taipeiTime(start)}–${taipeiTime(end)}${nextDay ? (language === "zh" ? "（跨日）" : " (+1 day)") : ""}`;
  }

  els.languageToggle.addEventListener("click", () => {
    language = language === "zh" ? "en" : "zh";
    localStorage.setItem("booking-language", language);
    applyLanguage();
    setStatus(els.serviceStatus.classList.contains("is-online") ? "online" : els.serviceStatus.classList.contains("is-offline") ? "offline" : "checking");
  });
  els.bookingDate.addEventListener("change", updateTimeAvailability);
  els.startTime.addEventListener("change", updateTimeSummary);
  els.duration.addEventListener("change", updateTimeSummary);
  els.bookingForm.addEventListener("submit", submitBooking);
  els.cancelForm.addEventListener("submit", submitCancellation);
  els.refreshSchedule.addEventListener("click", loadSchedule);
  els.copyReceipt.addEventListener("click", copyReceipt);
  els.closeReceipt.addEventListener("click", () => els.receiptDialog.close());

  buildTimeOptions();
  initializeDates();
  applyLanguage();
  loadInitialData();
})();
