import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .config import settings
from .database import connection, initialize_database
from .mqtt import MqttIngestor
from .schemas import AthleteCreate
from .security import verify_password
from .services import log_audit, utc_now
from .topics import device_commands, device_events, device_results, device_status

security = HTTPBasic()


def current_user(credentials: Annotated[HTTPBasicCredentials, Depends(security)]):
    with connection() as db:
        user = db.execute("SELECT * FROM users WHERE username = ?", (credentials.username,)).fetchone()
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials",
                            headers={"WWW-Authenticate": "Basic"})
    return dict(user)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    ingestor = MqttIngestor()
    app.state.mqtt = ingestor
    if settings.mqtt_host:
        ingestor.start()
    yield
    ingestor.stop()


app = FastAPI(title="RiadhaTrac Local API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "database": "sqlite", "time": utc_now()}


@app.get("/api/dashboard-config")
def dashboard_config(user=Depends(current_user)):
    """Frontend-safe integration details. Never return MQTT credentials here."""
    return {
        "api_base": "/api",
        "refresh_strategy": "poll",
        "results_poll_path": "/api/results",
        "devices_poll_path": "/api/devices",
        "poll_interval_seconds": 5,
        "mqtt": {
            "transport": "backend-bridge",
            "note": "The backend subscribes to MQTT and persists results; browsers use the API.",
            "topic_templates": {
                "status": device_status("{device_id}"),
                "results": device_results("{device_id}"),
                "events": device_events("{device_id}"),
                "commands": device_commands("{device_id}"),
            },
        },
    }


@app.get("/api/athletes")
def list_athletes(query: str = "", user=Depends(current_user)):
    pattern = f"%{query.strip()}%"
    with connection() as db:
        rows = db.execute("SELECT * FROM athletes WHERE athlete_id LIKE ? OR display_name LIKE ? ORDER BY athlete_id", (pattern, pattern)).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/athletes", status_code=status.HTTP_201_CREATED)
def create_athlete(athlete: AthleteCreate, user=Depends(current_user)):
    values = athlete.model_dump()
    values["created_at"] = utc_now()
    try:
        with connection() as db:
            db.execute("""INSERT INTO athletes(athlete_id, display_name, age_group, school_club, preferred_event, consent_status, created_at)
                          VALUES (:athlete_id, :display_name, :age_group, :school_club, :preferred_event, :consent_status, :created_at)""", values)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Athlete ID already exists")
    log_audit(user["user_id"], "create", "athlete", athlete.athlete_id, new_value=values)
    return values


@app.get("/api/athletes/{athlete_id}")
def get_athlete(athlete_id: str, user=Depends(current_user)):
    with connection() as db:
        row = db.execute("SELECT * FROM athletes WHERE athlete_id = ?", (athlete_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Athlete not found")
    return dict(row)


@app.get("/api/athletes/{athlete_id}/results")
def athlete_results(athlete_id: str, user=Depends(current_user)):
    with connection() as db:
        rows = db.execute("SELECT * FROM results WHERE athlete_id = ? ORDER BY received_at DESC", (athlete_id,)).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/results")
def list_results(event: str | None = None, distance_m: float | None = Query(default=None, gt=0),
                 from_: datetime | None = Query(default=None, alias="from"), to: datetime | None = None,
                 athlete_id: str | None = None, device_id: str | None = None, user=Depends(current_user)):
    clauses, params = [], []
    for column, value in (("event", event), ("distance_m", distance_m), ("athlete_id", athlete_id), ("device_id", device_id)):
        if value is not None:
            clauses.append(f"{column} = ?")
            params.append(value)
    if from_:
        clauses.append("received_at >= ?"); params.append(from_.isoformat())
    if to:
        clauses.append("received_at <= ?"); params.append(to.isoformat())
    sql = "SELECT * FROM results" + (" WHERE " + " AND ".join(clauses) if clauses else "") + " ORDER BY received_at DESC"
    with connection() as db:
        rows = db.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/devices")
def list_devices(user=Depends(current_user)):
    with connection() as db:
        rows = db.execute("SELECT * FROM devices ORDER BY last_seen_at DESC").fetchall()
    return [dict(row) for row in rows]
