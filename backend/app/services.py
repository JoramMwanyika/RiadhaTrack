import json
import uuid
from datetime import datetime, timezone

from .database import connection
from .schemas import DeviceResult, DeviceStatus


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def store_device_result(payload: DeviceResult) -> tuple[str, str | None]:
    """Persist one device event. Returns (stored|duplicate|rejected, safe reason)."""
    # A device may finish a run with either its optical sensor or the manual
    # keypad-stop fallback. Both are completed results; quality identifies how
    # the finish was captured.
    if not payload.timing.start_detected:
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


def queue_device_result(payload: DeviceResult) -> tuple[str, str | None]:
    """Hold a valid device result until a coach accepts it in the dashboard."""
    if not payload.timing.start_detected:
        return "rejected", "invalid_timing_state"
    with connection() as db:
        if db.execute("SELECT 1 FROM results WHERE result_id = ?", (payload.result_id,)).fetchone():
            return "stored", None
        if db.execute("SELECT 1 FROM pending_results WHERE result_id = ?", (payload.result_id,)).fetchone():
            return "pending", None
        if not db.execute("SELECT 1 FROM athletes WHERE athlete_id = ?", (payload.athlete_id,)).fetchone():
            return "rejected", "unknown_athlete"
        now = utc_now()
        db.execute("""INSERT INTO devices(device_id, last_seen_at, status, last_result_id)
                      VALUES (?, ?, 'online', ?) ON CONFLICT(device_id) DO UPDATE SET
                      last_seen_at=excluded.last_seen_at, status='online', last_result_id=excluded.last_result_id""",
                   (payload.device_id, now, payload.result_id))
        db.execute("""INSERT INTO pending_results(result_id, athlete_id, device_id, sport, event, distance_m,
                      elapsed_ms, quality, received_at, device_time_utc, sequence)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                   (payload.result_id, payload.athlete_id, payload.device_id, payload.test.sport,
                    payload.test.event, payload.test.distance_m, payload.timing.elapsed_ms,
                    payload.timing.quality, now,
                    payload.device_time_utc.isoformat() if payload.device_time_utc else None, payload.sequence))
    return "pending", None


def store_device_status(payload: DeviceStatus) -> None:
    """Record the latest connection telemetry reported by a timing device."""
    with connection() as db:
        db.execute("""INSERT INTO devices(device_id, firmware_version, last_seen_at, status,
                      wifi_connected, mqtt_connected, wifi_rssi)
                      VALUES (?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(device_id) DO UPDATE SET
                      firmware_version=COALESCE(excluded.firmware_version, devices.firmware_version),
                      last_seen_at=excluded.last_seen_at, status=excluded.status,
                      wifi_connected=excluded.wifi_connected, mqtt_connected=excluded.mqtt_connected,
                      wifi_rssi=excluded.wifi_rssi""",
                   (payload.device_id, payload.firmware_version, utc_now(),
                    "online" if payload.mqtt_connected else "offline",
                    int(payload.wifi_connected), int(payload.mqtt_connected), payload.wifi_rssi))


def approve_pending_result(result_id: str) -> tuple[str, dict | None]:
    """Move a reviewed result into the permanent results table."""
    with connection() as db:
        row = db.execute("SELECT * FROM pending_results WHERE result_id = ?", (result_id,)).fetchone()
        if not row:
            return "missing", None
        db.execute("""INSERT INTO results(result_id, athlete_id, device_id, sport, event, distance_m,
                      elapsed_ms, quality, received_at, device_time_utc, sequence)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                   tuple(row[key] for key in ("result_id", "athlete_id", "device_id", "sport", "event", "distance_m",
                                               "elapsed_ms", "quality", "received_at", "device_time_utc", "sequence")))
        db.execute("DELETE FROM pending_results WHERE result_id = ?", (result_id,))
    return "stored", dict(row)


def reject_pending_result(result_id: str) -> tuple[str, dict | None]:
    with connection() as db:
        row = db.execute("SELECT * FROM pending_results WHERE result_id = ?", (result_id,)).fetchone()
        if not row:
            return "missing", None
        db.execute("DELETE FROM pending_results WHERE result_id = ?", (result_id,))
    return "rejected", dict(row)


def log_audit(user_id: str, action: str, entity: str, entity_id: str, old_value=None, new_value=None, reason=None) -> None:
    with connection() as db:
        db.execute("INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                   (str(uuid.uuid4()), user_id, action, entity, entity_id,
                    json.dumps(old_value) if old_value else None, json.dumps(new_value) if new_value else None,
                    reason, utc_now()))
