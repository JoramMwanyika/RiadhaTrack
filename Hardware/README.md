# RiadhaTrac timing hardware (ESP8266)

This firmware runs directly on a NodeMCU-style ESP8266. It connects to local Wi-Fi and Mosquitto itself; an Arduino Uno or serial MQTT gateway is not used.

## What it does

- Displays the RiadhaTrac welcome/menu flow on a 20×4 I2C LCD.
- Accepts a numeric athlete ID using a 3×4 keypad.
- Uses hardware interrupts for separate start and finish gates.
- Creates a durable EEPROM-backed result before it attempts MQTT delivery.
- Publishes the result directly to MQTT at QoS 1 and removes it only after the backend's `stored` ACK.
- Retries a pending result every 10 seconds after Wi-Fi/broker recovery.

This is a single-slot pending queue for the ESP8266 prototype. Do not power-cycle-test it with more than one unsynchronised result. A larger queue needs an ESP8266 LittleFS implementation or external storage.

## Hardware and wiring

| Part | ESP8266 NodeMCU pin | GPIO | Notes |
| --- | --- | --- | --- |
| LCD SDA | D2 | GPIO4 | I2C bus |
| LCD SCL | D1 | GPIO5 | I2C bus |
| PCF8574 keypad expander SDA/SCL | D2 / D1 | GPIO4 / GPIO5 | Shares I2C with the LCD |
| Start gate | D5 | GPIO14 | Uses `INPUT_PULLUP` and falling-edge interrupt |
| Finish gate | D6 | GPIO12 | Uses `INPUT_PULLUP` and falling-edge interrupt |
| 3×4 keypad rows | PCF8574 P0–P3 | — | Rows |
| 3×4 keypad columns | PCF8574 P4–P6 | — | Columns; P7 unused |

Use a 20×4 I2C LCD at address `0x27` and a PCF8574 at `0x20` by default. Change the configuration macros if your modules use other addresses.

Connect each gate between its pin and GND only when its output is open-drain/relay compatible. If a sensor has a push-pull 5V output, level-shift it before connecting to the 3.3V ESP8266. Never apply 5V to an ESP8266 GPIO. Matched break-beam gates are preferable to reflective IR sensors for outdoor timing.

## Configure device secrets

1. Copy the template:

   ```powershell
   Copy-Item include\secrets.example.h include\secrets.h
   ```

2. Edit `include/secrets.h` and set Wi-Fi credentials, the local Mosquitto IP, and the device's dedicated MQTT username/password.

3. Set a unique `RIADHA_DEVICE_ID` for every physical device. Its ID must match the account and ACL configured in `backend/infra/mosquitto/aclfile`.

`secrets.h` is ignored by Git. Do not place real Wi-Fi or MQTT credentials in `secrets.example.h` or source files.

## MQTT behavior

With device ID `dev01` and the default prefix, the firmware publishes results to:

```text
riadha/v1/devices/dev01/results
```

It subscribes to:

```text
riadha/v1/devices/dev01/acks/+
```

The backend validates the payload and sends a `stored` ACK only after the SQLite transaction succeeds. The device therefore retains an event during Wi-Fi, broker, or backend outages. Topic ACLs and backend setup are documented in [../backend/README.md](../backend/README.md).

## Build and upload

Install PlatformIO, connect the ESP8266 by USB, then:

```powershell
cd RiadhaTrack\Hardware
pio run
pio run --target upload
```

Change `upload_port` in `platformio.ini` only if PlatformIO cannot find the board automatically.

## Operator flow

1. Power on: the welcome screen appears for three seconds.
2. Press `1`, enter the numeric athlete ID, then press `#`.
3. Confirm the athlete with `#`, which arms the start gate.
4. The LCD changes from `Ready at Start` to `Running` at the start edge.
5. The finish edge records elapsed milliseconds and shows the result.
6. `Saved` appears only after the backend ACK; otherwise the result stays `Pending Sync` and automatically retries.

The backend remains responsible for confirming that an athlete ID exists. Register athletes in the dashboard before testing; an unknown ID is rejected safely and remains visible to the operator as pending.

## Field validation

Before relying on recorded times, test both sensor polarity and placement, repeated-trigger lockout, missed gates, timing repeatability, Wi-Fi recovery, broker restart recovery, and ESP8266 power interruption. Results remain labelled `prototype_optical_sensor` and must not be treated as official timing until validated.

