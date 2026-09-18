PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  max_duration_minutes INTEGER NOT NULL DEFAULT 180,
  advance_days INTEGER NOT NULL DEFAULT 14,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL UNIQUE,
  cancel_token_hash TEXT NOT NULL,
  instrument_id INTEGER NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  lab_manager TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  extension_phone TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_at TEXT,
  cancelled_by TEXT,
  FOREIGN KEY (instrument_id) REFERENCES instruments(id),
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE INDEX IF NOT EXISTS idx_bookings_schedule
ON bookings(instrument_id, start_at, end_at, status);

CREATE INDEX IF NOT EXISTS idx_bookings_code
ON bookings(booking_code);

CREATE TRIGGER IF NOT EXISTS prevent_booking_overlap
BEFORE INSERT ON bookings
WHEN NEW.status = 'active'
AND EXISTS (
  SELECT 1 FROM bookings
  WHERE instrument_id = NEW.instrument_id
    AND status = 'active'
    AND start_at < NEW.end_at
    AND end_at > NEW.start_at
)
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_CONFLICT');
END;

INSERT OR IGNORE INTO instruments (name, slot_minutes, max_duration_minutes, advance_days)
VALUES ('粒徑分析儀（DLS）－Anton Paar 701', 30, 180, 14);
