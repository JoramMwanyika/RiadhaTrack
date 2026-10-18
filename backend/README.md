# RiadhaTrack backend

The backend is a FastAPI service that stores athletes and timing results in SQLite, manages local accounts, and bridges MQTT results from timing devices into the database.

```text
Timing unit --> Mosquitto --> FastAPI --> SQLite
                              ^
                              | HTTP API
                         Dashboard
```

MQTT transports messages; SQLite is the system of record. The service publishes `stored` only after a result has been committed.

## Prerequisites

- Python 3.11+
- A configured [Mosquitto broker](infra/mosquitto/README.md)

Run the examples from this directory:

```powershell
cd RiadhaTrack\backend
```

## Install and configure

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` before first startup. At minimum, choose a strong administrator password and provide the backend MQTT account:

```dotenv
RIADHA_DATABASE_URL=sqlite:///./data/riadha.db
RIADHA_ADMIN_USERNAME=admin
RIADHA_ADMIN_PASSWORD=use-a-unique-password
RIADHA_MQTT_HOST=localhost
RIADHA_MQTT_PORT=1884
RIADHA_MQTT_USERNAME=riadha-backend
RIADHA_MQTT_PASSWORD=your-backend-mqtt-password
RIADHA_MQTT_TOPIC_PREFIX=riadha/v1
RIADHA_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
RIADHA_SESSION_HOURS=12
```

`1884` is the port in the supplied Mosquitto configuration. If the broker uses another listener, make the port match in this file and in each device's `secrets.h`.

The initial admin is created only when the database is first initialized. To change an existing admin password:

```powershell
$env:RIADHA_NEW_ADMIN_PASSWORD = "a-long-unique-local-password"
python scripts/reset_admin_password.py
Remove-Item Env:RIADHA_NEW_ADMIN_PASSWORD
```

## Start and verify

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The service creates `data/riadha.db` and its schema on first start. Verify it with:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

Interactive API documentation is available at `http://localhost:8000/docs`. Start the [frontend](../frontend/README.md) separately.

## MQTT delivery contract

Topic helpers in [`app/topics.py`](app/topics.py) are the source of truth.

| Topic | Direction | Purpose |
| --- | --- | --- |
| `riadha/v1/devices/{device_id}/results` | Device to backend | Completed result; device publishes QoS 1 |
| `riadha/v1/devices/{device_id}/acks/{result_id}` | Backend to device | `stored` or `rejected` acknowledgement; QoS 1 |
| `riadha/v1/devices/{device_id}/status` | Device to backend | Device status |
| `riadha/v1/devices/{device_id}/events` | Device to backend | Operational events |
| `riadha/v1/devices/{device_id}/commands` | Backend to device | Reserved command channel |

The backend subscribes to `riadha/v1/devices/+/results`. Result IDs are idempotent: repeating a stored ID does not create another database record. Devices should retain a completed result until they receive its matching `stored` acknowledgement.

The timing firmware also uses these unauthenticated, LAN-only device endpoints:

- `GET /api/device/athlete/{athlete_id}` validates an entered athlete ID.
- `POST /api/device/results` accepts a direct device result using the same payload validation as MQTT.

Keep the API on a trusted network or place it behind suitable network controls.

## Dashboard API and accounts

`POST /api/auth/login` issues a bearer token. The dashboard uses it for athlete, result, device, and pending-result requests. `POST /api/auth/register` creates a `coach` account; account roles are otherwise admin-managed. Only admins can delete an athlete, and athletes with results cannot be deleted.

The dashboard refreshes results and devices every five seconds. It does not access the broker or SQLite directly.

## Backup and restore

Stop the backend before copying the database:

```powershell
New-Item -ItemType Directory -Force -Path backups
Copy-Item data\riadha.db backups\riadha-$(Get-Date -Format yyyyMMdd-HHmmss).db
```

To restore, stop the service, first preserve the current database, then replace `data/riadha.db` with the selected backup. Test restoration before field use.

## Tests

```powershell
pytest tests -q
```

The ingestion test verifies that repeated delivery of one result ID produces exactly one stored record.
