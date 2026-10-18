# RiadhaTrack ESP32 timing unit

This firmware targets a generic ESP32 DevKit with a 16×2 I²C LCD, direct 4×4 keypad, and one IR finish sensor. The keypad starts a test; the IR sensor finishes it. Results are delivered via MQTT to the FastAPI backend, which stores them in SQLite.

## Wiring

`Dxx` refers to the pin numbered `xx` on the ESP32 board.

| Component | Connection | ESP32 pin |
|---|---|---|
| LCD | SDA | D21 |
| LCD | SCL | D22 |
| LCD | VCC / GND | 3V3 / GND |
| Keypad | R1, R2, R3, R4 | D13, D12, D14, D27 |
| Keypad | C1, C2, C3, C4 | D26, D25, D33, D32 |
| IR finish sensor | OUT | D19 |
| IR finish sensor | VCC / GND | 3V3 / GND |

The keypad is a passive eight-wire matrix: do not connect VCC or GND to it. All component grounds must be common. Use 3.3V-compatible sensor output levels.

## Keypad operation

1. Startup: `RiadhaTrack` / `Welcome Athlete`.
2. Press `A`, type a registered athlete ID, then press `#` or `D` to confirm it.
3. Press `B` to manually start the timer.
4. Trigger the IR sensor to stop the timer.
5. The device stores the result locally, sends it to MQTT, and the dashboard shows it under that athlete after the backend acknowledges it.

`C` clears an athlete ID, while `A`, `C`, or `*` cancels a running test.

## Configure and upload

Copy `include/secrets.example.h` to `include/secrets.h`, fill in Wi‑Fi and MQTT details, then run:

```powershell
pio run
pio run --target upload
```

Use the broker and backend setup described in `../backend/README.md`.
