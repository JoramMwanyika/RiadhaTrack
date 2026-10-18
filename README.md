<p align="center">
  <img src="frontend/public/riadha-track-logo.png" alt="RiadhaTrack logo" width="320">
</p>

<h1 align="center">RiadhaTrack</h1>

<p align="center">
  <strong>Offline-first athletics timing and performance records for grassroots programmes.</strong><br>
  Built for reliable local operation—even when the internet is unavailable.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Mode-Offline--first-1b6ca8?style=flat-square" alt="Offline-first">
  <img src="https://img.shields.io/badge/Hardware-ESP32-00979D?style=flat-square" alt="ESP32">
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square" alt="FastAPI">
  <img src="https://img.shields.io/badge/Database-SQLite-003B57?style=flat-square" alt="SQLite">
  <img src="https://img.shields.io/badge/Messaging-MQTT-660066?style=flat-square" alt="MQTT">
</p>

> **Prototype notice:** RiadhaTrack supports repeatable training and talent-development records. It is not certified as an official competition-timing or photo-finish system. Validate sensors and timing accuracy in the intended field conditions before relying on measurements.

## The project

RiadhaTrack is a low-cost, local athletics testing system designed for grassroots programmes. It replaces stopwatch-and-notebook workflows with a simple connected flow: a coach identifies an athlete on the timing unit, starts a test, captures a finish, and sees the stored performance in a browser dashboard.

The current implementation uses an **ESP32** timing unit, a local **Mosquitto** broker, a **FastAPI** backend, **SQLite** storage, and a **React** dashboard. Everything runs on a trusted local Wi-Fi network, so timing and record access can continue without internet connectivity.

| Built for | What it provides |
| --- | --- |
| Coaches and test operators | Simple athlete selection, test control, and an accessible results history |
| Schools and clubs | A low-cost local record of athletes, timed tests, and device activity |
| Athletes | A consistent performance history that coaches can review over time |
| Field operation | Local result queuing and automatic retry after a temporary Wi-Fi, broker, or server outage |

### Key capabilities

- **Reliable result delivery:** the ESP32 saves a result before it sends it, then removes it only after the backend confirms durable storage.
- **Private local operation:** athlete data, MQTT traffic, and the dashboard remain within the local network by default.
- **One source of truth:** FastAPI validates every result and writes it to SQLite; MQTT transports messages but is not the database.
- **Coach-friendly dashboard:** register athletes, view result history, filter tests, and inspect device status in a browser.
- **Safer device access:** per-device MQTT accounts and topic access rules limit each unit to its own messages.

## How it works

```text
ESP32 timing unit --Wi-Fi/MQTT--> Mosquitto --MQTT--> FastAPI --> SQLite
                                                        ^
                                                        | HTTP API
                                                   React dashboard
```

The browser never connects to MQTT or SQLite. The backend is the only component that writes timing results to the database.

<details>
<summary><strong>End-to-end result lifecycle</strong></summary>

1. The coach selects a registered athlete and starts a test on the ESP32.
2. The LCD shows the live elapsed time; either the IR finish sensor or any keypad key completes the run, and the ESP32 stores the result in local EEPROM.
3. The device publishes the result to Mosquitto using MQTT QoS 1.
4. FastAPI validates the message, prevents duplicate inserts, and commits it to SQLite.
5. FastAPI returns a `stored` acknowledgement to the device.
6. The ESP32 clears its pending record, and the dashboard shows the result on its next refresh.

</details>

## Contents

- [What you need](#what-you-need)
- [Quick start order](#quick-start-order)
- [Start MQTT (Mosquitto)](#1-start-mqtt-mosquitto)
- [Configure the backend and database](#2-configure-the-backend-and-database)
- [Start the frontend](#3-start-the-frontend-and-connect-it-to-the-backend)
- [Wire the ESP32 hardware](#4-wire-the-esp32-timing-hardware)
- [Connect hardware to MQTT, backend, and database](#5-connect-hardware-to-mqtt-backend-and-database)
- [Run an end-to-end test](#6-run-an-end-to-end-test)
- [Day-to-day operation](#day-to-day-operation)
- [Verification and troubleshooting](#verification-and-troubleshooting)

## What you need

- A computer running the backend, Mosquitto, and (normally) the frontend.
- Python 3.11 or later.
- Node.js 18 or later and npm.
- Mosquitto and its command-line tools (`mosquitto`, `mosquitto_passwd`, and `mosquitto_sub`).
- PlatformIO Core or PlatformIO IDE to build and upload the ESP32 firmware.
- An ESP32 DevKit, 16x2 I2C LCD, 4x4 matrix keypad, IR finish sensor, jumper wires, and a shared local Wi-Fi network.

Internet access is not required after dependencies have been installed. Keep the computer, ESP32, and dashboard users on the same trusted LAN; do not expose MQTT port 1883 to the internet.

## Quick start order

Start the system in this order:

1. Configure and start Mosquitto.
2. Configure and start the FastAPI backend; it creates the SQLite database automatically.
3. Start the Vite frontend and sign in.
4. Register the athlete ID that will be entered on the timing unit.
5. Wire, configure, and upload the ESP32 unit.
6. Run a test and confirm that the result appears in the dashboard.

The detailed steps below use PowerShell and assume commands begin in this repository directory (`RiadhaTrack`).

## 1. Start MQTT (Mosquitto)

Mosquitto transports messages between the timing hardware and backend. It does not store the official results; FastAPI stores them in SQLite after validating them.

### Install and confirm Mosquitto in PowerShell

Install Mosquitto for Windows, including its command-line tools, then open a **new PowerShell window** and confirm that the broker command is available:

```powershell
mosquitto -h
mosquitto_passwd -h
```

If PowerShell reports that `mosquitto` is not recognized, either add Mosquitto's installation directory to your `PATH` and reopen PowerShell, or call the executable using its usual Windows installation path:

```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" -h
& "C:\Program Files\mosquitto\mosquitto_passwd.exe" -h
```

Use the same full executable path in the commands below if Mosquitto is not on your `PATH`.

Create the broker data/config directories and copy the starter access-control list:

```powershell
cd backend
New-Item -ItemType Directory -Force -Path infra\mosquitto\data, infra\mosquitto\config
Copy-Item infra\mosquitto\aclfile.example infra\mosquitto\config\aclfile
```

Create one broker account for the backend and one account for the first ESP32. Choose strong passwords and retain them for the next steps. Use `-c` only for the first command because it creates (and would overwrite) the password file.

```powershell
mosquitto_passwd -c infra\mosquitto\config\passwordfile riadha-backend
mosquitto_passwd infra\mosquitto\config\passwordfile riadha-device-dev01
```

Open `backend/infra/mosquitto/config/aclfile` and remove the `#` characters from the `dev01` device rules. For each additional device, create a new MQTT account and a matching ACL block with that device's unique ID.

### Run the broker in PowerShell

Open a dedicated PowerShell terminal for Mosquitto. From the repository root, run the broker from its configuration directory so the relative paths in `mosquitto.conf` work:

```powershell
cd RiadhaTrack\backend\infra\mosquitto
mosquitto -c mosquitto.conf -v
```

The `-v` option prints connection, subscription, publish, and access-denied messages in the terminal. Leave this PowerShell window open while using RiadhaTrack; close it or press `Ctrl+C` to stop the broker.

If `mosquitto` is not in `PATH`, run the same command with the full executable path:

```powershell
cd RiadhaTrack\backend\infra\mosquitto
& "C:\Program Files\mosquitto\mosquitto.exe" -c mosquitto.conf -v
```

The broker listens on TCP port `1883`. In a second PowerShell window, confirm it is listening:

```powershell
Get-NetTCPConnection -LocalPort 1883 -State Listen
```

If the backend runs on a different computer, replace relative paths in `mosquitto.conf` with absolute paths and allow port 1883 through the server firewall only for the trusted local network.

## 2. Configure the backend and database

Open a second terminal and create the Python environment:

```powershell
cd RiadhaTrack\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env`. Set a unique admin password and enter the `riadha-backend` MQTT password you created above. When Mosquitto runs on the same computer, this is the minimum configuration:

```dotenv
RIADHA_DATABASE_URL=sqlite:///./data/riadha.db
RIADHA_ADMIN_USERNAME=admin
RIADHA_ADMIN_PASSWORD=use-a-unique-12-plus-character-password
RIADHA_MQTT_HOST=localhost
RIADHA_MQTT_PORT=1883
RIADHA_MQTT_USERNAME=riadha-backend
RIADHA_MQTT_PASSWORD=the-password-created-for-riadha-backend
RIADHA_MQTT_TOPIC_PREFIX=riadha/v1
RIADHA_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

If the broker is on another computer, set `RIADHA_MQTT_HOST` to that computer's LAN IP address. Keep the topic prefix as `riadha/v1` unless you change it consistently in the broker ACL and device firmware too.

Start the API:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On its first startup, the backend creates `backend/data/riadha.db`, its tables and indexes, and the initial administrator. Verify it with:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

The expected response includes `status` set to `ok` and `database` set to `sqlite`. The API documentation is available at `http://localhost:8000/docs`.

### How the backend connects MQTT to SQLite

At startup, FastAPI connects to the configured broker as `riadha-backend` and subscribes to:

```text
riadha/v1/devices/+/results
```

For every device result it receives, the backend validates the JSON and checks that the athlete exists. It then inserts a single row in SQLite (duplicates with the same `result_id` are safe) and publishes either a `stored` or `rejected` acknowledgement to the device. Thus a successful device acknowledgement means the result is already in the database.

## 3. Start the frontend and connect it to the backend

Open a third terminal:

```powershell
cd RiadhaTrack\frontend
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`, and sign in with `RIADHA_ADMIN_USERNAME` and `RIADHA_ADMIN_PASSWORD` from `backend/.env`.

During development, `frontend/vite.config.ts` proxies browser requests beginning with `/api` to `http://localhost:8000`. This is the connection between the frontend and backend—no API URL needs to be entered for the standard same-computer setup.

To open the dashboard from another device on the LAN, browse to `http://SERVER_LAN_IP:5173`. Run Vite on the same server as FastAPI; its proxy continues to reach the local backend. If you deploy the frontend separately instead, set `VITE_API_BASE` at build time to `http://SERVER_LAN_IP:8000/api` and add the frontend origin to `RIADHA_CORS_ORIGINS` in `backend/.env` (for example `http://192.168.1.10:5173`), then restart the backend.

Use the **Athletes** page to create each athlete before using their ID on hardware. An unknown athlete ID causes the backend to reject a timing result.

## 4. Wire the ESP32 timing hardware

Use a generic ESP32 DevKit. `Dxx` below means the board pin labelled with that number.

| Component | Terminal(s) | ESP32 connection |
| --- | --- | --- |
| 16x2 I2C LCD | SDA / SCL | D21 / D22 |
| 16x2 I2C LCD | VCC / GND | 3V3 / GND |
| 4x4 keypad | R1, R2, R3, R4 | D13, D12, D14, D27 |
| 4x4 keypad | C1, C2, C3, C4 | D26, D25, D33, D32 |
| IR finish sensor | OUT | D19 |
| IR finish sensor | VCC / GND | 3V3 / GND |

The keypad is an eight-wire passive matrix: do **not** attach keypad wires to VCC or GND. All devices must share the ESP32 ground. The IR sensor output must be safe for ESP32 3.3 V logic; do not drive D19 with 5 V.

## 5. Connect hardware to MQTT, backend, and database

Copy the firmware secrets template to the untracked secrets file:

```powershell
cd RiadhaTrack\Hardware
Copy-Item include\secrets.example.h include\secrets.h
```

Edit `Hardware/include/secrets.h` with the Wi-Fi details and the device MQTT account. The settings must agree with the broker ACL and backend configuration:

```cpp
#define RIADHA_WIFI_SSID "YOUR_WIFI_NAME"
#define RIADHA_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define RIADHA_MQTT_HOST "192.168.1.10" // LAN IP of the Mosquitto computer
#define RIADHA_MQTT_PORT 1883
#define RIADHA_MQTT_USERNAME "riadha-device-dev01"
#define RIADHA_MQTT_PASSWORD "the-password-created-for-this-device"
#define RIADHA_MQTT_PREFIX "riadha/v1"
#define RIADHA_DEVICE_ID "dev01"
#define RIADHA_EVENT "sprint"
#define RIADHA_DISTANCE_M 100
#define RIADHA_BACKEND_HOST "192.168.1.10" // LAN IP of the FastAPI computer
#define RIADHA_BACKEND_PORT 8000
```

`RIADHA_MQTT_HOST` and `RIADHA_BACKEND_HOST` normally use the same server LAN IP because Mosquitto and FastAPI run on the same computer. `RIADHA_DEVICE_ID` must match the device ID in both the MQTT username/ACL block and its topic paths. Give every physical unit a unique ID such as `dev02`.

Build and upload with the ESP32 connected by USB:

```powershell
pio run
pio run --target upload
```

After booting, the device joins Wi-Fi, connects as its MQTT user, and subscribes to its acknowledgement topic. It publishes results using QoS 1 here:

```text
riadha/v1/devices/dev01/results
```

The backend writes an accepted result to SQLite and replies here:

```text
riadha/v1/devices/dev01/acks/<result_id>
```

The ESP32 keeps one pending result in EEPROM and retries publication every 10 seconds until it receives the matching `stored` acknowledgement. This protects a completed test during a temporary Wi-Fi, broker, or backend outage.

## 6. Run an end-to-end test

1. In the dashboard, create an athlete—for example, `ATH001`.
2. On the ESP32, press `A`, enter `ATH001`, and press `#` (or `D`) to confirm it. The device checks the ID with FastAPI before allowing the test; it displays `Athlete not found` if the record has not been registered.
3. Press `B` to start the timer.
4. Watch the live elapsed time on the LCD, then break the IR beam or press any keypad key to finish the test.
5. The LCD first shows the time, then `Saved dashboard` after the backend has stored it.
6. Open the dashboard **Results** page or the athlete profile; the result appears on the next five-second refresh.

To observe acknowledgements from the server computer, use the device account and password:

```powershell
mosquitto_sub -h localhost -u riadha-device-dev01 -P YOUR_DEVICE_PASSWORD -t "riadha/v1/devices/dev01/acks/+" -v
```

If the LCD says `Unknown athlete`, add that ID in the dashboard and repeat the test. If it remains on `Result pending`, check that the ESP32, broker, and backend use the same LAN address, credentials, device ID, and topic prefix.

To start fresh on the hardware, press **`C`** while the `Result pending` screen is visible. This deliberately discards the queued result and clears the selected athlete, without erasing network credentials or reusing old result IDs. Use it only when you no longer need to recover that pending result.

## Day-to-day operation

1. Start Mosquitto.
2. Start the backend (`uvicorn app.main:app --host 0.0.0.0 --port 8000`).
3. Start the frontend (`npm run dev`) and sign in.
4. Turn on the ESP32 unit and wait for its welcome screen.
5. Register athletes, run tests, and review results in the dashboard.

The persistent data is `backend/data/riadha.db`. Stop the backend before copying it for a backup:

```powershell
Copy-Item backend\data\riadha.db backend\backups\riadha-$(Get-Date -Format yyyyMMdd-HHmmss).db
```

Create the `backend/backups` directory first if it does not exist. Keep `backend/.env`, Mosquitto password files, and `Hardware/include/secrets.h` private; they contain credentials.

### Deleting an athlete

An administrator can open an athlete profile in the dashboard and select **Delete athlete**, then confirm the prompt. To protect timing history, athletes with recorded results cannot be deleted; the dashboard displays an explanation instead. Deleting an athlete without results is recorded in the audit log.

## Verification and troubleshooting

Run the backend test suite from `backend`:

```powershell
pytest tests -q
```

- **Backend health check fails:** ensure the virtual environment is active and the service is running on port 8000.
- **Frontend cannot sign in:** verify the backend is running, then use the credentials set before the first backend startup. Changing `RIADHA_ADMIN_PASSWORD` later does not reset an existing user.
- **MQTT connection fails:** confirm Mosquitto is running, its host/IP is reachable from the ESP32, and the username/password and ACL block match the device ID.
- **Result is rejected:** register the athlete first and ensure the device ID in the message topic matches the device ID in its JSON configuration.
- **Device has a pending result:** keep all services running; the firmware retries automatically until it receives an acknowledgement.

For component-specific detail, see [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md), and [Hardware/README.md](Hardware/README.md).
