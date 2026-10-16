# RiadhaTrac backend

RiadhaTrac is an offline-first local service for athlete records and timing results.

```text
Timing device --MQTT--> Mosquitto --MQTT--> FastAPI backend --> SQLite
                                                    |
                                                    +--> Dashboard browser (HTTP API)
```

MQTT transports device messages; it is not the system of record. The backend validates a result, commits it to SQLite, and only then sends the device an acknowledgement. The browser uses the HTTP API and never receives MQTT or database credentials.

## Prerequisites

- Python 3.11 or later
- Mosquitto broker and its command-line tools
- A local Wi-Fi router/access point shared by the server, timing device, and dashboard. Internet is not required after installation.

Run the commands from this directory:

```powershell
cd RiadhaTrack\backend
```

## 1. Install the backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell prevents activation, use a terminal that permits local scripts, or invoke `.venv\Scripts\python.exe` instead of `python`.

## 2. Create the environment configuration

Copy the template, then edit the copied file:

```powershell
Copy-Item .env.example .env
```

`.env` contains secrets and is ignored by Git. Configure these values:

| Variable | Purpose |
| --- | --- |
| `RIADHA_DATABASE_URL` | SQLite path. Use `sqlite:///./data/riadha.db` for the default local database. |
| `RIADHA_ADMIN_USERNAME` | First dashboard administrator username. |
| `RIADHA_ADMIN_PASSWORD` | Password used only when the first administrator is created. Use a unique 12+ character password. |
| `RIADHA_MQTT_HOST` | Mosquitto host or LAN IP; use `localhost` when it runs on the same computer. |
| `RIADHA_MQTT_PORT` | MQTT TCP port; normally `1883` for a protected local LAN. |
| `RIADHA_MQTT_USERNAME` / `RIADHA_MQTT_PASSWORD` | Credentials for the backend's Mosquitto account. |
| `RIADHA_MQTT_TOPIC_PREFIX` | Shared topic namespace. Leave as `riadha/v1` unless all devices and ACLs are changed too. |

## 3. Create and manage the database

SQLite is the single-venue MVP database. The first backend startup creates the database file, tables, indexes, and the initial administrator automatically. No separate database server is required.

Start the backend once to initialize the default database at `data/riadha.db`:

```powershell
uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Stop it with `Ctrl+C` after the startup message. With another database URL, SQLite is created at that configured location.

Important: changing `RIADHA_ADMIN_PASSWORD` after first startup does not change the stored password. Reset an existing administrator password like this:

```powershell
$env:RIADHA_NEW_ADMIN_PASSWORD = "a-long-unique-local-password"
python scripts/reset_admin_password.py
Remove-Item Env:RIADHA_NEW_ADMIN_PASSWORD
```

### Backup and restore

Stop the backend before copying the database:

```powershell
New-Item -ItemType Directory -Force -Path backups
Copy-Item data\riadha.db backups\riadha-$(Get-Date -Format yyyyMMdd-HHmmss).db
```

To restore, stop the backend, make a copy of the current database, then copy the chosen backup over `data/riadha.db`. Test restoring a backup before relying on it in the field.

## 4. Configure Mosquitto

The supplied broker configuration is [infra/mosquitto/mosquitto.conf](infra/mosquitto/mosquitto.conf). The starter ACL is [infra/mosquitto/aclfile.example](infra/mosquitto/aclfile.example).

Create the runtime directories and a working ACL file:

```powershell
New-Item -ItemType Directory -Force -Path infra\mosquitto\data, infra\mosquitto\config
Copy-Item infra\mosquitto\aclfile.example infra\mosquitto\config\aclfile
```

Create a password file and accounts. The first command creates the file; do not use `-c` again because it overwrites it:

```powershell
mosquitto_passwd -c infra\mosquitto\config\passwordfile riadha-backend
mosquitto_passwd infra\mosquitto\config\passwordfile riadha-device-dev01
```

Edit `infra\mosquitto\config\aclfile` and uncomment the `dev01` device block. Create a separate account and matching restricted block for every additional device. Set the backend account password in `.env` as `RIADHA_MQTT_USERNAME` / `RIADHA_MQTT_PASSWORD`.

For a foreground development broker, start it from its configuration folder so its relative paths resolve correctly:

```powershell
cd infra\mosquitto
mosquitto -c mosquitto.conf -v
```

For a Windows or Linux service, use absolute paths in `mosquitto.conf` for `persistence_location`, `password_file`, and `acl_file`. Keep `allow_anonymous false`. Do not expose port 1883 to the public internet; add TLS if traffic crosses an untrusted network.

## MQTT topics and delivery contract

The topic source of truth is [app/topics.py](app/topics.py). With the standard prefix:

| Topic | Direction | Purpose |
| --- | --- | --- |
| `riadha/v1/devices/{device_id}/status` | Device → backend | Online state, firmware, sensor health. |
| `riadha/v1/devices/{device_id}/results` | Device → backend | Completed timing result; publish QoS 1. |
| `riadha/v1/devices/{device_id}/events` | Device → backend | Sensor faults and operational events. |
| `riadha/v1/devices/{device_id}/commands` | Backend → device | Optional configuration or reset commands. |
| `riadha/v1/devices/{device_id}/acks/{result_id}` | Backend → device | Durable database acknowledgement; QoS 1. |

The backend consumes `riadha/v1/devices/+/results`. A device must save a result to its local pending queue before publishing it, and remove it only after receiving a matching `stored` acknowledgement.

Example device result:

```json
{
  "schema_version": 1,
  "event_type": "timing.result.completed",
  "result_id": "dev01-boot42-000123",
  "device_id": "dev01",
  "athlete_id": "ATH001",
  "test": {"sport": "athletics", "event": "sprint", "distance_m": 100},
  "timing": {"elapsed_ms": 12840, "start_detected": true, "finish_detected": true, "quality": "prototype_unverified"},
  "sequence": 123
}
```

After the result is committed, the backend publishes:

```json
{"result_id":"dev01-boot42-000123","status":"stored"}
```

Duplicate deliveries return `stored` again without another row. Invalid data receives `rejected` and a safe reason code. The athlete must first exist in the database.

## 5. Start and verify everything

1. Start Mosquitto using the configuration above.
2. In a second terminal, activate `.venv` and start the API:

   ```powershell
   uvicorn app.main:app --env-file .env --host 0.0.0.0 --port 8000
   ```

3. Open `http://localhost:8000/docs`, or `http://SERVER_LAN_IP:8000/docs` on the same router.
4. Authenticate with the initial admin account and create athletes using `POST /api/athletes`.
5. Confirm the service is alive:

   ```powershell
   Invoke-RestMethod http://localhost:8000/health
   ```

6. Watch for acknowledgements to a device while it publishes results:

   ```powershell
   mosquitto_sub -h localhost -u riadha-device-dev01 -P YOUR_DEVICE_PASSWORD -t "riadha/v1/devices/dev01/acks/+" -v
   ```

## Frontend integration

The frontend calls the authenticated backend API rather than MQTT directly:

- `GET /api/dashboard-config` — polling paths, five-second refresh interval, and safe topic templates
- `GET /api/athletes?query=` / `POST /api/athletes` — athlete search and creation
- `GET /api/athletes/{id}` / `GET /api/athletes/{id}/results` — athlete profile/history
- `GET /api/results?event=&distance_m=&from=&to=` — results table and filters
- `GET /api/devices` — device state

For this MVP, authenticate API calls with HTTP Basic authentication and poll results/devices every five seconds. Never put Mosquitto or database credentials in frontend code.

## Tests

```powershell
pytest tests -q
```

The test verifies that a repeated MQTT result ID produces exactly one stored database record.

