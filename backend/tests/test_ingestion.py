from app.database import initialize_database, connection
from app.schemas import DeviceResult
from app.services import approve_pending_result, queue_device_result, store_device_result


def test_result_is_idempotent(monkeypatch, tmp_path):
    monkeypatch.setattr("app.database.settings.database_url", f"sqlite:///{tmp_path / 'test.db'}")
    initialize_database()
    with connection() as db:
        db.execute("INSERT INTO athletes VALUES ('ATH001', 'Jane Doe', NULL, NULL, NULL, 'granted', '2026-01-01T00:00:00Z')")
    validate_fn = getattr(DeviceResult, "model_validate", getattr(DeviceResult, "parse_obj", None))
    event = validate_fn({
        "schema_version": 1, "event_type": "timing.result.completed", "result_id": "dev01-1",
        "device_id": "dev01", "athlete_id": "ATH001",
        "test": {"sport": "athletics", "event": "sprint", "distance_m": 100},
        "timing": {"elapsed_ms": 12840, "start_detected": True, "finish_detected": True, "quality": "prototype_unverified"},
        "sequence": 1,
    })
    assert store_device_result(event) == ("stored", None)
    assert store_device_result(event) == ("duplicate", None)
    manual_stop = validate_fn({
        "schema_version": 1, "event_type": "timing.result.completed", "result_id": "dev01-2",
        "device_id": "dev01", "athlete_id": "ATH001",
        "test": {"sport": "athletics", "event": "sprint", "distance_m": 100},
        "timing": {"elapsed_ms": 13000, "start_detected": True, "finish_detected": True,
                   "quality": "manual_start_key_stop"},
        "sequence": 2,
    })
    assert store_device_result(manual_stop) == ("stored", None)
    with connection() as db:
        assert db.execute("SELECT COUNT(*) FROM results").fetchone()[0] == 2


def test_result_waits_for_coach_approval(monkeypatch, tmp_path):
    monkeypatch.setattr("app.database.settings.database_url", f"sqlite:///{tmp_path / 'approval.db'}")
    initialize_database()
    with connection() as db:
        db.execute("INSERT INTO athletes VALUES ('ATH002', 'John Doe', NULL, NULL, NULL, 'granted', '2026-01-01T00:00:00Z')")
    validate_fn = getattr(DeviceResult, "model_validate", getattr(DeviceResult, "parse_obj", None))
    event = validate_fn({
        "schema_version": 1, "event_type": "timing.result.completed", "result_id": "dev01-approval",
        "device_id": "dev01", "athlete_id": "ATH002",
        "test": {"sport": "athletics", "event": "sprint", "distance_m": 100},
        "timing": {"elapsed_ms": 12000, "start_detected": True, "finish_detected": True, "quality": "manual_start_ir_finish"},
    })
    assert queue_device_result(event) == ("pending", None)
    with connection() as db:
        assert db.execute("SELECT COUNT(*) FROM results").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM pending_results").fetchone()[0] == 1
    status, accepted = approve_pending_result("dev01-approval")
    assert status == "stored"
    assert accepted["device_id"] == "dev01"
    with connection() as db:
        assert db.execute("SELECT COUNT(*) FROM results").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM pending_results").fetchone()[0] == 0
