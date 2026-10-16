import json
import uuid
from datetime import datetime, timezone

from .database import connection
from .schemas import DeviceResult


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def store_device_result(payload: DeviceResult) -> tuple[str, str | None]:
    """Persist one device event. Returns (stored|duplicate|rejected, safe reason)."""
    if not (payload.timing.start_detected and payload.timing.finish_detected):
        return "rejected", "invalid_timing_state"
    with connection() as db:
        if db.execute("SELECT 1 FROM results WHERE result_id = ?", (payload.result_id,)).fetchone():
            return "duplicate", None
        if not db.execute("SELECT 1 FROM athletes WHERE athlete_id = ?", (payload.athlete_id,)).fetchone():
            return "rejected", "unknown_athlete"
        now = utc_now()
        db.execute("""INSERT INTO devices(device_id, last_seen_at, status, last_result_id)
                      VALUES (?, ?, 'online', ?) ON CONFLICT(device_id) DO UPDATE SET
                      last_seen_at=excluded.last_seen_at, status='online', last_result_id=excluded.last_result_id""",
                   (payload.device_id, now, payload.result_id))
        db.execute("""INSERT INTO results(result_id, athlete_id, device_id, sport, event, distance_m,
                      elapsed_ms, quality, received_at, device_time_utc, sequence)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                   (payload.result_id, payload.athlete_id, payload.device_id, payload.test.sport,
                    payload.test.event, payload.test.distance_m, payload.timing.elapsed_ms,
                    payload.timing.quality, now,
                    payload.device_time_utc.isoformat() if payload.device_time_utc else None, payload.sequence))
    return "stored", None


def log_audit(user_id: str, action: str, entity: str, entity_id: str, old_value=None, new_value=None, reason=None) -> None:
    with connection() as db:
        db.execute("INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                   (str(uuid.uuid4()), user_id, action, entity, entity_id,
                    json.dumps(old_value) if old_value else None, json.dumps(new_value) if new_value else None,
                    reason, utc_now()))
