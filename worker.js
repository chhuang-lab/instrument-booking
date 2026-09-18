const ALLOWED_ORIGINS = new Set([
  "https://chhuang-lab.github.io",
]);

const TAIPEI_TZ = "Asia/Taipei";
const CANCEL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    try {
      if (request.method === "OPTIONS") return handleOptions(request);

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (isMutation(request.method) && !originAllowed(request)) {
        return json(request, { ok: false, error: "ORIGIN_NOT_ALLOWED", requestId }, 403);
      }

      if (request.method === "GET" && path === "/health") {
        return json(request, { ok: true, service: "instrument-booking-api", requestId });
      }

      if (request.method === "GET" && path === "/api/instruments") {
        return listInstruments(request, env, requestId);
      }

      if (request.method === "GET" && path === "/api/bookings") {
        return listPublicBookings(request, env, url, requestId);
      }

      if (request.method === "POST" && path === "/api/bookings") {
        return createBooking(request, env, requestId);
      }

      if (request.method === "POST" && path === "/api/cancel") {
        return cancelOwnBooking(request, env, requestId);
      }

      if (request.method === "POST" && path === "/api/admin/login") {
        return adminLogin(request, env, requestId);
      }

      if (path.startsWith("/api/admin/")) {
        const auth = await requireAdmin(request, env);
        if (!auth.ok) return json(request, { ok: false, error: auth.error, requestId }, auth.status);

        if (request.method === "GET" && path === "/api/admin/bookings") {
          return listAdminBookings(request, env, url, requestId);
        }

        if (request.method === "GET" && path === "/api/admin/export.csv") {
          return exportCsv(request, env);
        }

        const cancelMatch = path.match(/^\/api\/admin\/bookings\/([^/]+)\/cancel$/);
        if (request.method === "POST" && cancelMatch) {
          return adminCancelBooking(request, env, decodeURIComponent(cancelMatch[1]), requestId);
        }
      }

      return json(request, { ok: false, error: "NOT_FOUND", requestId }, 404);
    } catch (error) {
      console.error("Unhandled error", requestId, error);
      return json(request, { ok: false, error: "SERVER_ERROR", requestId }, 500);
    }
  },
};

async function listInstruments(request, env, requestId) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, slot_minutes, max_duration_minutes, advance_days
     FROM instruments WHERE is_active = 1 ORDER BY id`
  ).all();
  return json(request, { ok: true, instruments: results, timeZone: TAIPEI_TZ, requestId });
}

async function listPublicBookings(request, env, url, requestId) {
  const range = parsePublicRange(url);
  if (!range.ok) return json(request, { ok: false, error: range.error, requestId }, 400);

  const { results } = await env.DB.prepare(
    `SELECT b.start_at, b.end_at, b.lab_manager, b.operator_name,
            i.id AS instrument_id, i.name AS instrument_name
     FROM bookings b
     JOIN instruments i ON i.id = b.instrument_id
     WHERE b.status = 'active' AND b.end_at > ? AND b.start_at < ?
     ORDER BY b.start_at ASC`
  ).bind(range.from, range.to).all();

  return json(request, { ok: true, bookings: results, requestId });
}

async function createBooking(request, env, requestId) {
  const body = await readJson(request);
  if (!body.ok) return json(request, { ok: false, error: body.error, requestId }, body.status);

  const submissionId = textValue(body.value.submissionId, 80);
  const cancelCode = normalizeCancelCode(body.value.cancelCode);
  const instrumentId = Number(body.value.instrumentId);
  const labManager = textValue(body.value.labManager, 100);
  const operatorName = textValue(body.value.operatorName, 100);
  const extensionPhone = textValue(body.value.extensionPhone, 30);
  const notes = textValue(body.value.notes ?? "", 1000, true);

  if (!isUuid(submissionId) || !isCancelCode(cancelCode)) {
    return json(request, { ok: false, error: "INVALID_REQUEST", requestId }, 400);
  }
  if (!Number.isInteger(instrumentId) || !labManager || !operatorName || !extensionPhone || notes === null) {
    return json(request, { ok: false, error: "REQUIRED_FIELDS", requestId }, 400);
  }

  const instrument = await env.DB.prepare(
    `SELECT id, name, slot_minutes, max_duration_minutes, advance_days
     FROM instruments WHERE id = ? AND is_active = 1`
  ).bind(instrumentId).first();
  if (!instrument) return json(request, { ok: false, error: "INSTRUMENT_NOT_FOUND", requestId }, 404);

  const time = validateBookingTime(body.value.startAt, body.value.endAt, instrument);
  if (!time.ok) return json(request, { ok: false, error: time.error, requestId }, 400);

  const bookingCode = await makeBookingCode(submissionId, time.startDate);
  const cancelHash = await sha256Hex(cancelCode);

  const existing = await env.DB.prepare(
    `SELECT booking_code, cancel_token_hash, start_at, end_at, status
     FROM bookings WHERE booking_code = ?`
  ).bind(bookingCode).first();
  if (existing) {
    if (constantTimeEqual(existing.cancel_token_hash, cancelHash)) {
      return json(request, {
        ok: true,
        idempotent: true,
        booking: {
          bookingCode: existing.booking_code,
          cancelCode,
          startAt: existing.start_at,
          endAt: existing.end_at,
          status: existing.status,
        },
        requestId,
      });
    }
    return json(request, { ok: false, error: "CODE_COLLISION", requestId }, 409);
  }

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO bookings
          (booking_code, cancel_token_hash, instrument_id, start_at, end_at,
           lab_manager, operator_name, extension_phone, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        bookingCode, cancelHash, instrumentId, time.startAt, time.endAt,
        labManager, operatorName, extensionPhone, notes || null
      ),
      env.DB.prepare(
        `INSERT INTO booking_events (booking_id, event_type, details)
         VALUES ((SELECT id FROM bookings WHERE booking_code = ?), 'created', ?)`
      ).bind(bookingCode, JSON.stringify({ requestId })),
    ]);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("BOOKING_CONFLICT")) {
      return json(request, { ok: false, error: "BOOKING_CONFLICT", requestId }, 409);
    }
    if (message.includes("UNIQUE")) {
      return json(request, { ok: false, error: "DUPLICATE_REQUEST", requestId }, 409);
    }
    throw error;
  }

  return json(request, {
    ok: true,
    booking: {
      bookingCode,
      cancelCode,
      instrumentName: instrument.name,
      startAt: time.startAt,
      endAt: time.endAt,
      status: "active",
    },
    requestId,
  }, 201);
}

async function cancelOwnBooking(request, env, requestId) {
  const body = await readJson(request);
  if (!body.ok) return json(request, { ok: false, error: body.error, requestId }, body.status);

  const bookingCode = textValue(body.value.bookingCode, 40)?.toUpperCase();
  const cancelCode = normalizeCancelCode(body.value.cancelCode);
  if (!bookingCode || !isCancelCode(cancelCode)) {
    return json(request, { ok: false, error: "INVALID_REQUEST", requestId }, 400);
  }

  const booking = await env.DB.prepare(
    `SELECT id, cancel_token_hash, start_at, status FROM bookings WHERE booking_code = ?`
  ).bind(bookingCode).first();
  if (!booking || !constantTimeEqual(booking.cancel_token_hash, await sha256Hex(cancelCode))) {
    return json(request, { ok: false, error: "BOOKING_NOT_FOUND", requestId }, 404);
  }
  if (booking.status === "cancelled") {
    return json(request, { ok: true, alreadyCancelled: true, bookingCode, requestId });
  }
  if (Date.parse(booking.start_at) <= Date.now()) {
    return json(request, { ok: false, error: "CANCELLATION_CLOSED", requestId }, 409);
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE bookings
       SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'user'
       WHERE id = ? AND status = 'active'`
    ).bind(new Date().toISOString(), booking.id),
    env.DB.prepare(
      `INSERT INTO booking_events (booking_id, event_type, details)
       VALUES (?, 'cancelled_user', ?)`
    ).bind(booking.id, JSON.stringify({ requestId })),
  ]);

  return json(request, { ok: true, bookingCode, requestId });
}

async function adminLogin(request, env, requestId) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_TOKEN_SECRET) {
    return json(request, { ok: false, error: "ADMIN_NOT_CONFIGURED", requestId }, 503);
  }
  const body = await readJson(request);
  if (!body.ok) return json(request, { ok: false, error: body.error, requestId }, body.status);
  const password = typeof body.value.password === "string" ? body.value.password : "";
  if (!(await secureStringEqual(password, env.ADMIN_PASSWORD))) {
    return json(request, { ok: false, error: "INVALID_ADMIN_PASSWORD", requestId }, 401);
  }

  const token = await issueAdminToken(env.ADMIN_TOKEN_SECRET);
  return json(request, { ok: true, token, expiresIn: 28800, requestId });
}

async function listAdminBookings(request, env, url, requestId) {
  const status = url.searchParams.get("status") || "all";
  if (!new Set(["all", "active", "cancelled"]).has(status)) {
    return json(request, { ok: false, error: "INVALID_STATUS", requestId }, 400);
  }

  let sql = `SELECT b.booking_code, b.start_at, b.end_at, b.lab_manager,
                    b.operator_name, b.extension_phone, b.notes, b.status,
                    b.created_at, b.cancelled_at, b.cancelled_by,
                    i.name AS instrument_name
             FROM bookings b JOIN instruments i ON i.id = b.instrument_id`;
  const bindings = [];
  if (status !== "all") {
    sql += " WHERE b.status = ?";
    bindings.push(status);
  }
  sql += " ORDER BY b.start_at DESC LIMIT 2000";
  const statement = env.DB.prepare(sql);
  const { results } = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
  return json(request, { ok: true, bookings: results, requestId });
}

async function adminCancelBooking(request, env, bookingCode, requestId) {
  const cleanCode = textValue(bookingCode, 40)?.toUpperCase();
  if (!cleanCode) return json(request, { ok: false, error: "INVALID_REQUEST", requestId }, 400);

  const body = await readJson(request);
  if (!body.ok) return json(request, { ok: false, error: body.error, requestId }, body.status);
  const reason = textValue(body.value.reason ?? "", 300, true);
  if (reason === null) return json(request, { ok: false, error: "INVALID_REQUEST", requestId }, 400);

  const booking = await env.DB.prepare(
    `SELECT id, status FROM bookings WHERE booking_code = ?`
  ).bind(cleanCode).first();
  if (!booking) return json(request, { ok: false, error: "BOOKING_NOT_FOUND", requestId }, 404);
  if (booking.status === "cancelled") {
    return json(request, { ok: true, alreadyCancelled: true, bookingCode: cleanCode, requestId });
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE bookings
       SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'admin'
       WHERE id = ? AND status = 'active'`
    ).bind(new Date().toISOString(), booking.id),
    env.DB.prepare(
      `INSERT INTO booking_events (booking_id, event_type, details)
       VALUES (?, 'cancelled_admin', ?)`
    ).bind(booking.id, JSON.stringify({ requestId, reason: reason || null })),
  ]);

  return json(request, { ok: true, bookingCode: cleanCode, requestId });
}

async function exportCsv(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT b.booking_code, i.name AS instrument_name, b.start_at, b.end_at,
            b.lab_manager, b.operator_name, b.extension_phone, b.notes,
            b.status, b.created_at, b.cancelled_at, b.cancelled_by
     FROM bookings b JOIN instruments i ON i.id = b.instrument_id
     ORDER BY b.start_at DESC LIMIT 50000`
  ).all();

  const headers = [
    "booking_code", "instrument", "start_at", "end_at", "lab_manager",
    "operator", "extension_phone", "notes", "status", "created_at",
    "cancelled_at", "cancelled_by",
  ];
  const rows = [headers, ...results.map((row) => [
    row.booking_code, row.instrument_name, row.start_at, row.end_at,
    row.lab_manager, row.operator_name, row.extension_phone, row.notes || "",
    row.status, row.created_at, row.cancelled_at || "", row.cancelled_by || "",
  ])];
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `instrument-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      ...baseHeaders(request),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function validateBookingTime(rawStart, rawEnd, instrument) {
  const startDate = new Date(rawStart);
  const endDate = new Date(rawEnd);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { ok: false, error: "INVALID_TIME" };

  const durationMinutes = (endMs - startMs) / 60000;
  if (startMs <= Date.now()) return { ok: false, error: "START_IN_PAST" };
  if (startMs > Date.now() + Number(instrument.advance_days) * 86400000) {
    return { ok: false, error: "OUTSIDE_BOOKING_WINDOW" };
  }
  if (durationMinutes <= 0 || durationMinutes > Number(instrument.max_duration_minutes)) {
    return { ok: false, error: "INVALID_DURATION" };
  }
  if (durationMinutes % Number(instrument.slot_minutes) !== 0) {
    return { ok: false, error: "INVALID_SLOT" };
  }
  if (
    startDate.getUTCMinutes() % Number(instrument.slot_minutes) !== 0 ||
    startDate.getUTCSeconds() !== 0 || startDate.getUTCMilliseconds() !== 0 ||
    endDate.getUTCMinutes() % Number(instrument.slot_minutes) !== 0 ||
    endDate.getUTCSeconds() !== 0 || endDate.getUTCMilliseconds() !== 0
  ) {
    return { ok: false, error: "INVALID_SLOT" };
  }

  return {
    ok: true,
    startDate,
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

function parsePublicRange(url) {
  const now = Date.now();
  const fromDate = new Date(url.searchParams.get("from") || now - 86400000);
  const toDate = new Date(url.searchParams.get("to") || now + 15 * 86400000);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
    return { ok: false, error: "INVALID_TIME" };
  }
  if (toDate <= fromDate || toDate - fromDate > 17 * 86400000) {
    return { ok: false, error: "INVALID_RANGE" };
  }
  return { ok: true, from: fromDate.toISOString(), to: toDate.toISOString() };
}

async function makeBookingCode(submissionId, startDate) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(submissionId)));
  let suffix = "";
  for (let index = 0; index < 10; index += 1) suffix += CANCEL_ALPHABET[digest[index] & 31];
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(startDate);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `DLS-${value.year}${value.month}${value.day}-${suffix}`;
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN_SECRET) return { ok: false, error: "ADMIN_NOT_CONFIGURED", status: 503 };
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !(await verifyAdminToken(token, env.ADMIN_TOKEN_SECRET))) {
    return { ok: false, error: "ADMIN_AUTH_REQUIRED", status: 401 };
  }
  return { ok: true };
}

async function issueAdminToken(secret) {
  const payload = base64UrlEncode(JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + 28800 }));
  const signature = await hmacSign(payload, secret);
  return `${payload}.${signature}`;
}

async function verifyAdminToken(token, secret) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = await hmacSign(payload, secret);
  if (!constantTimeEqual(signature, expected)) return false;
  try {
    const data = JSON.parse(base64UrlDecode(payload));
    return data.role === "admin" && Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return bytesToBase64Url(signature);
}

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secureStringEqual(a, b) {
  const [hashA, hashB] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return constantTimeEqual(hashA, hashB);
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 16384) return { ok: false, error: "REQUEST_TOO_LARGE", status: 413 };
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid body");
    return { ok: true, value };
  } catch {
    return { ok: false, error: "INVALID_JSON", status: 400 };
  }
}

function textValue(value, maxLength, allowEmpty = false) {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ");
  if ((!allowEmpty && !clean) || clean.length > maxLength) return null;
  return clean;
}

function normalizeCancelCode(value) {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

function isCancelCode(value) {
  return /^[A-HJ-NP-Z2-9]{8}$/.test(value);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function isMutation(method) {
  return new Set(["POST", "PUT", "PATCH", "DELETE"]).has(method);
}

function originAllowed(request) {
  const origin = request.headers.get("Origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function handleOptions(request) {
  if (!originAllowed(request)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: baseHeaders(request) });
}

function baseHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function base64UrlEncode(value) {
  return bytesToBase64Url(encoder.encode(value));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
