import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import settings
from .security import hash_password


def database_path() -> str:
    if not settings.database_url.startswith("sqlite:///"):
        raise RuntimeError("This MVP supports SQLite URLs only (sqlite:///path/to/file.db).")
    return settings.database_url.removeprefix("sqlite:///")


@contextmanager
def connection():
    path = database_path()
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize_database() -> None:
    with connection() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_sessions (
                session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS athletes (
                athlete_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
                age_group TEXT, school_club TEXT, preferred_event TEXT,
                consent_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS devices (
                device_id TEXT PRIMARY KEY, label TEXT, firmware_version TEXT,
                last_seen_at TEXT, status TEXT NOT NULL DEFAULT 'unknown', last_result_id TEXT
            );
            CREATE TABLE IF NOT EXISTS test_sessions (
                session_id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL, device_id TEXT NOT NULL,
                event TEXT NOT NULL, distance_m REAL NOT NULL CHECK(distance_m > 0),
                started_at TEXT, status TEXT NOT NULL,
                FOREIGN KEY(athlete_id) REFERENCES athletes(athlete_id),
                FOREIGN KEY(device_id) REFERENCES devices(device_id)
            );
            CREATE TABLE IF NOT EXISTS results (
                result_id TEXT PRIMARY KEY, session_id TEXT, athlete_id TEXT NOT NULL,
                device_id TEXT NOT NULL, sport TEXT NOT NULL, event TEXT NOT NULL,
                distance_m REAL NOT NULL CHECK(distance_m > 0), elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms > 0),
                quality TEXT NOT NULL, received_at TEXT NOT NULL, device_time_utc TEXT,
                sequence INTEGER, sync_status TEXT NOT NULL DEFAULT 'stored',
                FOREIGN KEY(athlete_id) REFERENCES athletes(athlete_id),
                FOREIGN KEY(device_id) REFERENCES devices(device_id)
            );
            CREATE TABLE IF NOT EXISTS pending_results (
                result_id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL,
                device_id TEXT NOT NULL, sport TEXT NOT NULL, event TEXT NOT NULL,
                distance_m REAL NOT NULL CHECK(distance_m > 0), elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms > 0),
                quality TEXT NOT NULL, received_at TEXT NOT NULL, device_time_utc TEXT,
                sequence INTEGER
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                audit_id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL,
                entity_id TEXT NOT NULL, old_value TEXT, new_value TEXT, reason TEXT, created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_results_athlete_received ON results(athlete_id, received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_results_filters ON results(event, distance_m, received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_pending_results_received ON pending_results(received_at DESC);
        """)
        existing = db.execute("SELECT 1 FROM users WHERE username = ?", (settings.admin_username,)).fetchone()
        if not existing:
            from datetime import datetime, timezone
            import uuid
            db.execute("INSERT INTO users VALUES (?, ?, ?, 'admin', ?)",
                       (str(uuid.uuid4()), settings.admin_username, hash_password(settings.admin_password),
                        datetime.now(timezone.utc).isoformat()))
