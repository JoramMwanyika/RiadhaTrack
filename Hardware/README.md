# RiadhaTrack ESP32 timing unit

This firmware runs on a generic ESP32 DevKit. It accepts an athlete ID from a 4x4 keypad, checks that ID against the local API, times a run, and sends the completed result to the backend over MQTT.

The timer is a prototype. It supports repeatable training records but is not certified for official competition timing.

## Hardware

| Component | Connection | ESP32 pin |
| --- | --- | --- |
| 16x2 I2C LCD | SDA / SCL | GPIO 21 / GPIO 22 |
| LCD | VCC / GND | 3V3 / GND |
| 4x4 keypad rows | R1, R2, R3, R4 | GPIO 13, 12, 14, 27 |
| 4x4 keypad columns | C1, C2, C3, C4 | GPIO 26, 25, 33, 32 |
| IR finish sensor | OUT | GPIO 19 |
| IR finish sensor | VCC / GND | 3V3 / GND |

The keypad is a passive eight-wire matrix: do not connect it to VCC or GND. All components must share ground. The sensor output must be safe for ESP32 3.3 V logic.

## Configure

Copy the template, then replace every placeholder. `secrets.h` is ignored by Git and must remain private.

```powershell
cd RiadhaTrack\Hardware
Copy-Item include\secrets.example.h include\secrets.h
```

Set the Wi-Fi credentials, the server LAN IP addresses, and the unique MQTT identity. With the supplied Mosquitto configuration, use port `1884` (not the template's default `1883`):

```cpp
#define RIADHA_MQTT_HOST "192.168.1.10"
#define RIADHA_MQTT_PORT 1884
#define RIADHA_MQTT_USERNAME "riadha-device-dev01"
#define RIADHA_MQTT_PREFIX "riadha/v1"
#define RIADHA_DEVICE_ID "dev01"
#define RIADHA_BACKEND_HOST "192.168.1.10"
#define RIADHA_BACKEND_PORT 8000
```

`RIADHA_DEVICE_ID`, the MQTT username, and the device ACL block must describe the same device. Give each physical unit its own ID and MQTT account. See the [broker guide](../backend/infra/mosquitto/README.md).

## Build and upload

Install PlatformIO and connect the ESP32 by USB:

```powershell
pio run
pio run --target upload
```

The dependencies are declared in `platformio.ini`. If upload cannot find the board, identify its serial port with `pio device list` and configure PlatformIO as needed.

## Operator workflow

1. At the menu, press `A` and enter a numeric athlete ID (up to 16 characters).
2. Press `#` or `D` to verify the athlete with the backend. Press `C` while entering an ID to clear it.
3. Press `B` to start the timer.
4. Break the IR beam to finish. Any keypad key also finishes the active test as a manual stop.
5. Wait for `Saved dashboard`. The result has then been stored in SQLite.

The live display updates every 0.1 seconds. A run has a two-minute maximum duration; on timeout the unit returns to the menu without saving a result.

## Offline recovery

Before publishing, the firmware stores one completed result in EEPROM. It retries MQTT delivery every 10 seconds until it receives the matching `stored` acknowledgement. Do not begin a new test while `Result pending` is displayed.

After checking Wi-Fi, Mosquitto, and the backend, an operator may press `C` on the `Result pending` screen to deliberately discard that one unsynchronised result and clear the selected athlete. This does not erase the device configuration or reset the result-ID counter.

## MQTT contract

The unit publishes QoS 1 results to:

```text
riadha/v1/devices/dev01/results
```

It listens for QoS 1 acknowledgements at:

```text
riadha/v1/devices/dev01/acks/+
```

The backend accepts a result only after validating its payload and athlete ID. Manual keypad finishes use the `manual_start_key_stop` quality label; IR finishes use `manual_start_ir_finish`.
