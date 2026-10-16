from app.database import initialize_database, connection
from app.schemas import DeviceResult
from app.services import store_device_result


def test_result_is_idempotent(monkeypatch, tmp_path):
    monkeypatch.setattr("app.database.settings.database_url", f"sqlite:///{tmp_path / 'test.db'}")
    initialize_database()
    with connection() as db:
        db.execute("INSERT INTO athletes VALUES ('ATH001', 'Jane Doe', NULL, NULL, NULL, 'granted', '2026-01-01T00:00:00Z')")
    event = DeviceResult.model_validate({
        "schema_version": 1, "event_type": "timing.result.completed", "result_id": "dev01-1",
        "device_id": "dev01", "athlete_id": "ATH001",
        "test": {"sport": "athletics", "event": "sprint", "distance_m": 100},
        "timing": {"elapsed_ms": 12840, "start_detected": True, "finish_detected": True, "quality": "prototype_unverified"},
        "sequence": 1,
    })
    assert store_device_result(event) == ("stored", None)
    assert store_device_result(event) == ("duplicate", None)
    with connection() as db:
        assert db.execute("SELECT COUNT(*) FROM results").fetchone()[0] == 1
