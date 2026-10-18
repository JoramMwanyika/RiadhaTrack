import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials, HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .database import connection, initialize_database
from .mqtt import MqttIngestor
from .schemas import AccountLogin, AccountRegistration, AthleteCreate, DeviceResult
from .security import hash_password, new_session_token, token_digest, verify_password
from .services import approve_pending_result, log_audit, reject_pending_result, store_device_result, utc_now
from .topics import device_commands, device_events, device_results, device_status

security = HTTPBasic()
bearer = HTTPBearer(auto_error=False)


def current_user(bearer_credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
                 basic_credentials: Annotated[HTTPBasicCredentials | None, Depends(HTTPBasic(auto_error=False))]):
    with connection() as db:
        if bearer_credentials and bearer_credentials.scheme.lower() == "bearer":
            user = db.execute("""SELECT users.* FROM user_sessions JOIN users ON users.user_id = user_sessions.user_id
                               WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?""",
                              (token_digest(bearer_credentials.credentials), utc_now())).fetchone()
        elif basic_credentials:
            user = db.execute("SELECT * FROM users WHERE username = ?", (basic_credentials.username,)).fetchone()
            if not user or not verify_password(basic_credentials.password, user["password_hash"]): user = None
        else:
            user = None
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials",
                            headers={"WWW-Authenticate": "Bearer"})
    return dict(user)


def issue_session(user: dict) -> dict:
    token = new_session_token()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=settings.session_hours)
    with connection() as db:
        db.execute("DELETE FROM user_sessions WHERE expires_at <= ?", (now.isoformat(),))
        db.execute("INSERT INTO user_sessions VALUES (?, ?, ?, ?, ?)",
                   (str(uuid.uuid4()), user["user_id"], token_digest(token), expires_at.isoformat(), now.isoformat()))
    return {"access_token": token, "token_type": "bearer", "expires_at": expires_at.isoformat(),
            "user": {"username": user["username"], "role": user["role"]}}


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "database": "sqlite", "time": utc_now()}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_account(account: AccountRegistration):
    """Create a local coach account. Account roles remain admin-controlled."""
    user_id = str(uuid.uuid4())
    now = utc_now()
    try:
        with connection() as db:
            db.execute("INSERT INTO users VALUES (?, ?, ?, 'coach', ?)",
                       (user_id, account.username, hash_password(account.password), now))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "That username is already in use")
    return issue_session({"user_id": user_id, "username": account.username, "role": "coach"})


@app.post("/api/auth/login")
def login(account: AccountLogin):
    with connection() as db:
        user = db.execute("SELECT * FROM users WHERE username = ?", (account.username,)).fetchone()
    if not user or not verify_password(account.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return issue_session(dict(user))


@app.get("/api/auth/me")
def account_me(user=Depends(current_user)):
    return {"username": user["username"], "role": user["role"]}


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
    values = athlete.dict() if hasattr(athlete, "dict") else athlete.model_dump()
    values["created_at"] = utc_now()
    try:
        with connection() as db:
            db.execute("""INSERT INTO athletes(athlete_id, display_name, age_group, school_club, preferred_event, consent_status, created_at)
                          VALUES (:athlete_id, :display_name, :age_group, :school_club, :preferred_event, :consent_status, :created_at)""", values)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Athlete ID already exists")
    log_audit(user["user_id"], "create", "athlete", athlete.athlete_id, new_value=values)
    return values


@app.delete("/api/athletes/{athlete_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_athlete(athlete_id: str, user=Depends(current_user)):
    """Delete an athlete who has no stored results. Administrators only."""
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can delete athletes")
    with connection() as db:
        athlete = db.execute("SELECT * FROM athletes WHERE athlete_id = ?", (athlete_id,)).fetchone()
        if not athlete:
            raise HTTPException(status_code=404, detail="Athlete not found")
        result_count = db.execute("SELECT COUNT(*) FROM results WHERE athlete_id = ?", (athlete_id,)).fetchone()[0]
        if result_count:
            raise HTTPException(status_code=409, detail="Cannot delete an athlete with recorded results")
        db.execute("DELETE FROM athletes WHERE athlete_id = ?", (athlete_id,))
    log_audit(user["user_id"], "delete", "athlete", athlete_id, old_value=dict(athlete))


@app.get("/api/device/athlete/{athlete_id}")
def device_get_athlete(athlete_id: str):
    """Fast device lookup endpoint for timing hardware on local Wi-Fi."""
    with connection() as db:
        row = db.execute("SELECT athlete_id, display_name FROM athletes WHERE athlete_id = ?", (athlete_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Athlete not found")
    display_name = row["display_name"]
    first_name = display_name.split()[0] if display_name else athlete_id
    return {
        "athlete_id": row["athlete_id"],
        "display_name": display_name,
        "first_name": first_name,
    }


@app.post("/api/device/results", status_code=status.HTTP_201_CREATED)
def device_post_result(payload: DeviceResult):
    """Direct result ingestion for timing devices on local Wi-Fi."""
    status_str, reason = store_device_result(payload)
    if status_str == "rejected":
        raise HTTPException(status_code=400, detail=reason or "Result rejected")
    return {"result_id": payload.result_id, "status": "stored", "athlete_id": payload.athlete_id}


@app.get("/api/pending-results")
def list_pending_results(user=Depends(current_user)):
    with connection() as db:
        rows = db.execute("SELECT * FROM pending_results ORDER BY received_at DESC").fetchall()
    return [dict(row) for row in rows]


@app.post("/api/pending-results/{result_id}/accept")
def accept_pending_result(result_id: str, user=Depends(current_user)):
    status_str, result = approve_pending_result(result_id)
    if status_str == "missing" or not result:
        raise HTTPException(404, "Pending result not found")
    app.state.mqtt.publish_result_ack(result["device_id"], result["result_id"], "stored")
    log_audit(user["user_id"], "accept", "pending_result", result_id, new_value=result)
    return {"result_id": result_id, "status": "stored"}


@app.post("/api/pending-results/{result_id}/reject")
def reject_pending_result_endpoint(result_id: str, user=Depends(current_user)):
    status_str, result = reject_pending_result(result_id)
    if status_str == "missing" or not result:
        raise HTTPException(404, "Pending result not found")
    app.state.mqtt.publish_result_ack(result["device_id"], result["result_id"], "rejected", "coach_rejected")
    log_audit(user["user_id"], "reject", "pending_result", result_id, old_value=result)
    return {"result_id": result_id, "status": "rejected"}


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
