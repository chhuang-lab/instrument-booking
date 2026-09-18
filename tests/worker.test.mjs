import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker.js";

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async all() { return this.db.all(this); }
  async first() { return this.db.first(this); }
}

class FakeDb {
  constructor() {
    this.instrument = {
      id: 1,
      name: "粒徑分析儀（DLS）－Anton Paar 701",
      slot_minutes: 30,
      max_duration_minutes: 180,
      advance_days: 14,
    };
    this.bookings = [];
  }
  prepare(sql) { return new Statement(this, sql); }
  async all(statement) {
    if (statement.sql.includes("FROM instruments WHERE is_active")) return { results: [this.instrument] };
    if (statement.sql.includes("FROM bookings b") && statement.sql.includes("b.status = 'active'")) {
      const [from, to] = statement.args;
      return { results: this.bookings.filter((booking) => booking.status === "active" && booking.end_at > from && booking.start_at < to) };
    }
    if (statement.sql.includes("FROM bookings b JOIN instruments") || statement.sql.includes("FROM bookings b\n     JOIN instruments")) {
      return { results: this.bookings.map((booking) => ({ ...booking, instrument_name: this.instrument.name })) };
    }
    return { results: [] };
  }
  async first(statement) {
    if (statement.sql.includes("FROM instruments WHERE id")) {
      return Number(statement.args[0]) === 1 ? this.instrument : null;
    }
    if (statement.sql.includes("WHERE booking_code = ?")) {
      return this.bookings.find((booking) => booking.booking_code === statement.args[0]) || null;
    }
    return null;
  }
  async batch(statements) {
    for (const statement of statements) {
      if (statement.sql.includes("INSERT INTO bookings")) {
        const [booking_code, cancel_token_hash, instrument_id, start_at, end_at, lab_manager, operator_name, extension_phone, notes] = statement.args;
        const conflict = this.bookings.some((booking) => booking.status === "active" && booking.instrument_id === instrument_id && booking.start_at < end_at && booking.end_at > start_at);
        if (conflict) throw new Error("BOOKING_CONFLICT");
        this.bookings.push({ id: this.bookings.length + 1, booking_code, cancel_token_hash, instrument_id, start_at, end_at, lab_manager, operator_name, extension_phone, notes, status: "active", created_at: new Date().toISOString() });
      }
      if (statement.sql.includes("UPDATE bookings") && statement.sql.includes("cancelled_by = 'user'")) {
        const [, id] = statement.args;
        const booking = this.bookings.find((item) => item.id === id);
        if (booking) booking.status = "cancelled";
      }
      if (statement.sql.includes("UPDATE bookings") && statement.sql.includes("cancelled_by = 'admin'")) {
        const [, id] = statement.args;
        const booking = this.bookings.find((item) => item.id === id);
        if (booking) booking.status = "cancelled";
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const origin = "https://chhuang-lab.github.io";
const env = () => ({
  DB: new FakeDb(),
  ADMIN_PASSWORD: "correct horse battery staple",
  ADMIN_TOKEN_SECRET: "test-secret-with-at-least-32-characters",
});

function nextSlot(offsetSlots = 2) {
  const value = Math.ceil(Date.now() / 1800000) * 1800000 + offsetSlots * 1800000;
  return new Date(value);
}

async function post(path, body, environment) {
  return worker.fetch(new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), environment);
}

test("health endpoint answers", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), env());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("booking is created, retried idempotently, then cancelled", async () => {
  const environment = env();
  const start = nextSlot();
  const end = new Date(start.getTime() + 60 * 60000);
  const payload = {
    submissionId: "7d797fc5-84d5-4cf7-8f9a-d918883d4d6b",
    cancelCode: "ABCDEFG2",
    instrumentId: 1,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    labManager: "王老師",
    operatorName: "陳同學",
    extensionPhone: "1234",
    notes: "test",
  };

  const created = await post("/api/bookings", payload, environment);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.match(createdBody.booking.bookingCode, /^DLS-\d{8}-[A-Z2-9]{10}$/);
  assert.equal(environment.DB.bookings.length, 1);

  const retried = await post("/api/bookings", payload, environment);
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).idempotent, true);
  assert.equal(environment.DB.bookings.length, 1);

  const cancelled = await post("/api/cancel", {
    bookingCode: createdBody.booking.bookingCode,
    cancelCode: payload.cancelCode,
  }, environment);
  assert.equal(cancelled.status, 200);
  assert.equal(environment.DB.bookings[0].status, "cancelled");
});

test("overlapping booking is rejected", async () => {
  const environment = env();
  const start = nextSlot(4);
  const end = new Date(start.getTime() + 90 * 60000);
  const common = {
    cancelCode: "ABCDEFG2",
    instrumentId: 1,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    labManager: "Lab",
    operatorName: "Operator",
    extensionPhone: "5678",
    notes: "",
  };
  assert.equal((await post("/api/bookings", { ...common, submissionId: "11111111-1111-4111-8111-111111111111" }, environment)).status, 201);
  const conflict = await post("/api/bookings", { ...common, submissionId: "22222222-2222-4222-8222-222222222222" }, environment);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, "BOOKING_CONFLICT");
});

test("invalid admin password is rejected and valid password gets a token", async () => {
  const environment = env();
  const bad = await post("/api/admin/login", { password: "wrong" }, environment);
  assert.equal(bad.status, 401);
  const good = await post("/api/admin/login", { password: environment.ADMIN_PASSWORD }, environment);
  assert.equal(good.status, 200);
  assert.match((await good.json()).token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test("unknown browser origins cannot mutate data", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/bookings", {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: "{}",
  }), env());
  assert.equal(response.status, 403);
});
