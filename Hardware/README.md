# RiadhaTrac timing hardware (ESP8266)

This firmware runs directly on a NodeMCU ESP8266 board. It connects to local Wi-Fi and interfaces directly with the FastAPI backend database and Mosquitto broker.

## Hardware and Pinout

| Component | Connection on module | ESP8266 pin label on board | GPIO | Notes |
|---|---|---|---|---|
| **LCD (I²C)** | SDA | IO4 | GPIO4 | I²C data line |
| **LCD (I²C)** | SCL | IO5 | GPIO5 | I²C clock line |
| **LCD** | GND | GND | — | Power ground |
| **LCD** | VCC | 3V3 / Vin | — | 3.3V or 5V with level-friendly I²C |
| **Keypad** | R1 | IO14 | GPIO14 | Row 1 |
| **Keypad** | R2 | IO12 | GPIO12 | Row 2 |
| **Keypad** | R3 | IO13 | GPIO13 | Row 3 |
| **Keypad** | R4 | IO15 | GPIO15 | Row 4 |
| **Keypad** | C1 | IO0 | GPIO0 | Column 1 |
| **Keypad** | C2 | IO2 | GPIO2 | Column 2 |
| **Keypad** | C3 | RXD0 | GPIO3 | Column 3 |
| **Keypad** | C4 | TXD0 | GPIO1 | Column 4 |
| **IR Sensor** | OUT / DO | IO16 | GPIO16 | High-speed optical finish gate |
| **IR Sensor** | GND | GND | — | Power ground |
| **IR Sensor** | VCC | 3V3 | — | 3.3V power |

## Operator & Screen Flow (16×2 LCD)

1. **Power On / Boot**:
   - The 16×2 LCD displays for **4 seconds**:
     ```text
        RiadhaTrac   
     Welcome athlete!
     ```
2. **Main Menu**:
   - The LCD presents two options:
     ```text
     1:Select 2:Start
     Ath: Eliud
     ```
     *(Shows `No athlete sel.` if no athlete has been selected yet).*
3. **Select Athlete (`1`)**:
   - Press **`1`** on the keypad:
     ```text
     Enter ID: 101   
     #=OK      *=Back
     ```
   - Enter digits `0`–`9` (`*` backspaces, `#` confirms).
   - The ESP8266 queries the database (`GET /api/device/athlete/<id>`) over Wi-Fi.
   - When found, it fetches the athlete's **first name** from SQLite:
     ```text
     Ath: Eliud      
     2:Start   *:Menu
     ```
   - If not found in SQLite:
     ```text
     Athlete Not inDB
     *=Back to Menu  
     ```
4. **Start Timer (`2`)**:
   - Press **`2`**: The timer starts counting immediately:
     ```text
     Run: Eliud      
     Time: 3.420 s   
     ```
   - When the runner reaches the IR sensor (connected to GPIO16), the beam triggers and the timer stops automatically.
   - The result is immediately recorded under that athlete in the SQLite database (`POST /api/device/results` & MQTT).
   - Once stored, the LCD displays:
     ```text
     Time: 11.840 s  
     Saved! 2=Run #=M
     ```
   - Pressing **`2`** immediately runs the timer again for the same athlete, or **`#`** / **`*`** returns to the main menu.

## Uploading to ESP8266

1. Ensure `Hardware/include/secrets.h` is configured with your Wi-Fi SSID, password, and the LAN IP of your backend laptop.
2. Connect the ESP8266 via USB.
3. Build and upload with PlatformIO:
   ```powershell
   cd Hardware
   pio run --target upload
   ```
