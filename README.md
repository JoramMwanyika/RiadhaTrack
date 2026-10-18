# RiadhaTrack

RiadhaTrack is a local-first athletics timing and record-keeping system for schools, clubs, and grassroots programmes. A coach registers athletes in a browser dashboard, an ESP32 timing unit captures a run, and the result is stored on the local server.

> **Prototype notice:** This project is for training and talent-development records. It is not a certified competition-timing or photo-finish system. Validate the equipment in its intended conditions before relying on a measurement.

## Architecture

```text
ESP32 timing unit -- MQTT --> Mosquitto -- MQTT --> FastAPI --> SQLite
                                                        ^
                                                        | HTTP API
                                                 React dashboard
```

The browser never connects to MQTT or SQLite. FastAPI validates results and is the system of record. The ESP32 keeps one unsynchronised result in EEPROM and retries MQTT delivery until it receives a `stored` acknowledgement.

## Components

| Directory | Purpose |
| --- | --- |
| [`Hardware`](Hardware/README.md) | ESP32 firmware, wiring, device configuration, and field operation |
| [`backend`](backend/README.md) | FastAPI API, SQLite database, and MQTT ingestion service |
| [`frontend`](frontend/README.md) | React/Vite dashboard for accounts, athletes, results, and devices |
| [`backend/infra/mosquitto`](backend/infra/mosquitto/README.md) | Local Mosquitto configuration and access-control guidance |

## Requirements

- Python 3.11+
- Node.js 18+ and npm
- Mosquitto plus `mosquitto_passwd`
- PlatformIO Core or the PlatformIO IDE
- ESP32 DevKit, 16x2 I2C LCD, 4x4 matrix keypad, IR finish sensor, and a trusted local Wi-Fi network

Install dependencies while internet access is available. Normal use can remain on the local network.

## Quick start

1. Configure Mosquitto following the [broker guide](backend/infra/mosquitto/README.md). The supplied configuration listens on port **1884**.
2. Configure and start the [backend](backend/README.md). Set `RIADHA_MQTT_PORT=1884` when using the supplied broker configuration.
3. Start the [frontend](frontend/README.md), sign in with the initial administrator account, and create an athlete.
4. Wire and configure the [ESP32 timing unit](Hardware/README.md). Its MQTT port and backend address must match the server.
5. Select the registered athlete on the unit, start a test, and trigger the finish sensor. Confirm the result appears in the dashboard.

## Result delivery

1. The device verifies the entered athlete ID with the local API.
2. It starts the timer when the operator presses `B`.
3. The IR beam break, or any keypad key, completes the run.
4. The firmware saves the result in EEPROM before publishing it with MQTT QoS 1.
5. The backend validates and stores the result in SQLite, then publishes a `stored` acknowledgement.
6. Only after the matching acknowledgement does the device clear its queued result.

An unknown athlete is rejected. A temporary Wi-Fi, broker, or API outage leaves the result pending on the device for automatic retry.

## Security and data care

- Keep MQTT, the API, and the dashboard on a trusted LAN; do not expose the broker to the public internet.
- Use unique MQTT accounts for the backend and every device. Restrict each account with the supplied ACL pattern.
- Do not commit `backend/.env`, Mosquitto password files, or `Hardware/include/secrets.h`.
- Back up `backend/data/riadha.db` with the backend stopped. See the [backend guide](backend/README.md#backup-and-restore).

## Verification

From `backend`, run the automated ingestion test:

```powershell
pytest tests -q
```

Use `http://localhost:8000/health` to check the backend and `http://localhost:8000/docs` to inspect the API.
