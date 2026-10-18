# RiadhaTrack ESP32 timing unit

This firmware targets a generic ESP32 DevKit with a 16×2 I²C LCD, direct 4×4 keypad, and one IR finish sensor. The keypad starts a test, the LCD shows the live time, and either the IR sensor or any keypad key finishes and saves it. Results are delivered via MQTT to the FastAPI backend, which stores them in SQLite.

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

### Timing a test

Once a test starts, the LCD refreshes the elapsed time every 0.1 seconds. Either the IR finish sensor or **any keypad key** stops and saves the result. Results stopped with a key are sent with the `manual_start_key_stop` quality label; IR-finished results use `manual_start_ir_finish`.

1. Startup: `RiadhaTrack` / `Welcome Athlete`.
2. Press `A`, type a registered athlete ID, then press `#` or `D` to confirm it. The device checks the backend before continuing; an unregistered ID displays `Athlete not found`.
3. Press `B` to manually start the timer.
4. Watch the elapsed time update on the LCD.
5. Trigger the IR sensor or press any keypad key to stop and save the timer.
6. The device stores the result locally, sends it to MQTT, and the dashboard shows it under that athlete after the backend acknowledges it.

`C` clears an athlete ID while entering it. During a running test, every key saves the elapsed result instead of cancelling it.

### Clear a stuck pending result

If the LCD shows `Result pending`, first check that Wi-Fi, Mosquitto, and the backend are running. To deliberately discard that unsynchronised result and restart the device workflow, press **`C`** while the `Result pending` screen is displayed. The unit clears the pending result and current athlete selection, then returns to the main menu. This does not erase Wi-Fi/MQTT settings or reset the device’s unique result-ID counter.

## Configure and upload

Copy `include/secrets.example.h` to `include/secrets.h`, fill in Wi‑Fi and MQTT details, then run:

```powershell
pio run
pio run --target upload
```

Use the broker and backend setup described in `../backend/README.md`.
