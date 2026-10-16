#include <Arduino.h>
#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

// Fallbacks if not defined in secrets.h
#ifndef RIADHA_BACKEND_HOST
#define RIADHA_BACKEND_HOST RIADHA_MQTT_HOST
#endif

#ifndef RIADHA_BACKEND_PORT
#define RIADHA_BACKEND_PORT 8000
#endif

#ifndef RIADHA_LCD_ADDRESS
#define RIADHA_LCD_ADDRESS 0x27
#endif

// Pin Definitions according to hardware specification
constexpr byte SDA_PIN = 4;        // IO4 (GPIO4)
constexpr byte SCL_PIN = 5;        // IO5 (GPIO5)
constexpr byte IR_PIN  = 16;       // IO16 (GPIO16) - IR Sensor OUT/DO

// 4x4 Keypad Pin Mapping
// Rows: R1 -> IO14, R2 -> IO12, R3 -> IO13, R4 -> IO15
// Cols: C1 -> IO0,  C2 -> IO2,  C3 -> RXD0 (GPIO3), C4 -> TXD0 (GPIO1)
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = {14, 12, 13, 15};
byte colPins[COLS] = {0, 2, 3, 1};

Keypad customKeypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
// Configured for 16x2 LCD
LiquidCrystal_I2C lcd(RIADHA_LCD_ADDRESS, 16, 2);

WiFiClient wifiClient;
MqttClient mqtt(wifiClient);

// Timing and State Constants
constexpr unsigned long WELCOME_MS = 4000;      // 4 seconds welcome screen
constexpr unsigned long MAX_TEST_MS = 120000;   // 2 minutes test timeout
constexpr unsigned long RETRY_SYNC_MS = 10000;  // Retry pending results every 10s
constexpr unsigned long IR_ARM_LOCKOUT_MS = 150;// Prevent instant false trigger on start
constexpr uint32_t PENDING_MAGIC = 0x52544432;
constexpr int EEPROM_BYTES = 512;
constexpr int BOOT_COUNTER_ADDR = 0;
constexpr int PENDING_ADDR = 16;

enum Screen : byte {
  WELCOME,
  MENU,
  ENTER_ATHLETE_ID,
  ATHLETE_CONFIRMED,
  NO_ATHLETE_WARNING,
  RUNNING,
  SHOW_RESULT
};

Screen screen = WELCOME;

struct PendingResult {
  uint32_t magic;
  uint32_t sequence;
  uint32_t elapsedMs;
  char athleteId[32];
  char athleteName[32];
  char resultId[48];
  uint32_t checksum;
};

PendingResult pending{};
bool pendingLoaded = false;
uint32_t bootCounter = 0;
uint32_t sequence = 0;

// Currently selected athlete state
char inputAthleteId[32] = "";
char selectedAthleteId[32] = "";
char selectedAthleteName[32] = "";

// Timing variables
unsigned long screenChangedAt = 0;
unsigned long runStartUs = 0;
unsigned long runStartMs = 0;
unsigned long resultElapsedMs = 0;
unsigned long lastRunningLcdUpdate = 0;
unsigned long lastSyncAttempt = 0;
int irIdleState = HIGH;

char resultsTopic[128];
char ackTopic[128];

uint32_t calcChecksum(const PendingResult &val) {
  const byte *p = reinterpret_cast<const byte *>(&val);
  uint32_t sum = 0;
  for (size_t i = 0; i < sizeof(PendingResult) - sizeof(val.checksum); ++i) {
    sum += p[i];
  }
  return sum;
}

void savePendingResult() {
  pending.magic = PENDING_MAGIC;
  pending.checksum = calcChecksum(pending);
  EEPROM.put(PENDING_ADDR, pending);
  EEPROM.commit();
  pendingLoaded = true;
}

void clearPendingResult() {
  pending.magic = 0;
  pending.checksum = 0;
  EEPROM.put(PENDING_ADDR, pending);
  EEPROM.commit();
  pendingLoaded = false;
}

// 16x2 Display helpers: exactly 16 characters per line
void updateLine(byte row, const char *text) {
  char buf[17];
  snprintf(buf, sizeof(buf), "%-16.16s", text ? text : "");
  lcd.setCursor(0, row);
  lcd.print(buf);
}

void showScreenLines(const char *l1, const char *l2 = "") {
  lcd.clear();
  updateLine(0, l1);
  updateLine(1, l2);
}

// Check and maintain Wi-Fi connection
void checkWifi() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiAttempt = 0;
    if (millis() - lastWifiAttempt > 10000) {
      lastWifiAttempt = millis();
      WiFi.begin(RIADHA_WIFI_SSID, RIADHA_WIFI_PASSWORD);
    }
  }
}

// Look up athlete in database via Backend REST API
bool lookupAthleteInDatabase(const char *id, char *outFirstName, size_t maxLen) {
  checkWifi();
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String("http://") + RIADHA_BACKEND_HOST + ":" + RIADHA_BACKEND_PORT + "/api/device/athlete/" + id;

  http.begin(client, url);
  http.setTimeout(4000);
  int httpCode = http.GET();

  bool found = false;
  if (httpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      const char *fn = doc["first_name"] | "";
      if (fn && strlen(fn) > 0) {
        strncpy(outFirstName, fn, maxLen - 1);
        outFirstName[maxLen - 1] = '\0';
      } else {
        const char *dn = doc["display_name"] | id;
        strncpy(outFirstName, dn, maxLen - 1);
        outFirstName[maxLen - 1] = '\0';
      }
      found = true;
    }
  }
  http.end();
  return found;
}

// Send timing result to backend (HTTP first with MQTT fallback/mirror)
bool sendResultToBackend(const PendingResult &res) {
  checkWifi();
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  // 1. HTTP POST direct to backend database
  bool httpSuccess = false;
  {
    WiFiClient client;
    HTTPClient http;
    String url = String("http://") + RIADHA_BACKEND_HOST + ":" + RIADHA_BACKEND_PORT + "/api/device/results";
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3500);

    StaticJsonDocument<384> doc;
    doc["schema_version"] = 1;
    doc["event_type"] = "timing.result.completed";
    doc["result_id"] = res.resultId;
    doc["device_id"] = RIADHA_DEVICE_ID;
    doc["athlete_id"] = res.athleteId;

    JsonObject test = doc.createNestedObject("test");
    test["sport"] = "athletics";
    test["event"] = RIADHA_EVENT;
    test["distance_m"] = RIADHA_DISTANCE_M;

    JsonObject timing = doc.createNestedObject("timing");
    timing["elapsed_ms"] = res.elapsedMs;
    timing["start_detected"] = true;
    timing["finish_detected"] = true;
    timing["quality"] = "official_optical_sensor";

    doc["sequence"] = res.sequence;

    String jsonStr;
    serializeJson(doc, jsonStr);

    int httpCode = http.POST(jsonStr);
    if (httpCode == 200 || httpCode == 201) {
      httpSuccess = true;
    }
    http.end();
  }

  // 2. Also publish over MQTT if broker is reachable
  if (mqtt.connected()) {
    StaticJsonDocument<384> doc;
    doc["schema_version"] = 1;
    doc["event_type"] = "timing.result.completed";
    doc["result_id"] = res.resultId;
    doc["device_id"] = RIADHA_DEVICE_ID;
    doc["athlete_id"] = res.athleteId;

    JsonObject test = doc.createNestedObject("test");
    test["sport"] = "athletics";
    test["event"] = RIADHA_EVENT;
    test["distance_m"] = RIADHA_DISTANCE_M;

    JsonObject timing = doc.createNestedObject("timing");
    timing["elapsed_ms"] = res.elapsedMs;
    timing["start_detected"] = true;
    timing["finish_detected"] = true;
    timing["quality"] = "official_optical_sensor";

    doc["sequence"] = res.sequence;

    mqtt.beginMessage(resultsTopic, false, 1);
    serializeJson(doc, mqtt);
    mqtt.endMessage();
  }

  return httpSuccess;
}

void onMqttMessage(int) {
  StaticJsonDocument<192> document;
  if (deserializeJson(document, mqtt)) return;
  const char *resultId = document["result_id"] | "";
  const char *status = document["status"] | "";
  if (pendingLoaded && strcmp(resultId, pending.resultId) == 0 && strcmp(status, "stored") == 0) {
    clearPendingResult();
  }
}

void maintainMqtt() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) {
      static unsigned long lastMqttAttempt = 0;
      if (millis() - lastMqttAttempt > 15000) {
        lastMqttAttempt = millis();
        mqtt.setId(RIADHA_DEVICE_ID);
        if (strlen(RIADHA_MQTT_USERNAME) > 0) {
          mqtt.setUsernamePassword(RIADHA_MQTT_USERNAME, RIADHA_MQTT_PASSWORD);
        }
        if (mqtt.connect(RIADHA_MQTT_HOST, RIADHA_MQTT_PORT)) {
          mqtt.subscribe(ackTopic, 1);
        }
      }
    } else {
      mqtt.poll();
    }
  }
}

void setScreen(Screen next) {
  screen = next;
  screenChangedAt = millis();

  switch (screen) {
    case WELCOME:
      // Exact 16x2 Welcome screen for 4 seconds
      showScreenLines("   RiadhaTrac   ", "Welcome athlete!");
      break;

    case MENU: {
      char athleteLine[17];
      if (selectedAthleteId[0] != '\0') {
        snprintf(athleteLine, sizeof(athleteLine), "Ath: %-11.11s", selectedAthleteName[0] ? selectedAthleteName : selectedAthleteId);
      } else {
        snprintf(athleteLine, sizeof(athleteLine), "No athlete sel.");
      }
      showScreenLines("1:Select 2:Start", athleteLine);
      break;
    }

    case ENTER_ATHLETE_ID: {
      char l0[17];
      snprintf(l0, sizeof(l0), "Enter ID: %-6.6s", inputAthleteId);
      showScreenLines(l0, "#=OK      *=Back");
      break;
    }

    case ATHLETE_CONFIRMED: {
      char l0[17];
      snprintf(l0, sizeof(l0), "Ath: %-11.11s", selectedAthleteName);
      showScreenLines(l0, "2:Start   *:Menu");
      break;
    }

    case NO_ATHLETE_WARNING:
      showScreenLines("No Athlete Sel!", "1:Select  *:Menu");
      break;

    case RUNNING: {
      char l0[17];
      snprintf(l0, sizeof(l0), "Run: %-11.11s", selectedAthleteName[0] ? selectedAthleteName : selectedAthleteId);
      showScreenLines(l0, "Time: 0.000 s   ");
      break;
    }

    case SHOW_RESULT: {
      char timeLine[17];
      snprintf(timeLine, sizeof(timeLine), "Time: %lu.%03lu s", resultElapsedMs / 1000UL, resultElapsedMs % 1000UL);
      showScreenLines(timeLine, "Saving to DB...");
      break;
    }
  }
}

void setup() {
  // Free UART0 pins GPIO1 (TX) and GPIO3 (RX) for Keypad columns
  // Do NOT use Serial so GPIO1 and GPIO3 operate as matrix keypad inputs
  pinMode(1, INPUT_PULLUP);
  pinMode(3, INPUT_PULLUP);

  // Initialize I2C and 16x2 LCD
  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
  lcd.backlight();

  // Initialize IR sensor pin
  pinMode(IR_PIN, INPUT_PULLUP);
  delay(10);
  irIdleState = digitalRead(IR_PIN);

  // Initialize EEPROM for persistent result queue
  EEPROM.begin(EEPROM_BYTES);
  EEPROM.get(BOOT_COUNTER_ADDR, bootCounter);
  ++bootCounter;
  EEPROM.put(BOOT_COUNTER_ADDR, bootCounter);
  EEPROM.commit();

  EEPROM.get(PENDING_ADDR, pending);
  pendingLoaded = (pending.magic == PENDING_MAGIC && pending.checksum == calcChecksum(pending));
  sequence = pendingLoaded ? pending.sequence : 0;

  // Set MQTT topics
  snprintf(resultsTopic, sizeof(resultsTopic), "%s/devices/%s/results", RIADHA_MQTT_PREFIX, RIADHA_DEVICE_ID);
  snprintf(ackTopic, sizeof(ackTopic), "%s/devices/%s/acks/+", RIADHA_MQTT_PREFIX, RIADHA_DEVICE_ID);
  mqtt.onMessage(onMqttMessage);

  // Connect Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(RIADHA_WIFI_SSID, RIADHA_WIFI_PASSWORD);

  // 1. Initial boot: Welcome athlete for 4 seconds
  setScreen(WELCOME);
}

void loop() {
  checkWifi();
  maintainMqtt();

  unsigned long now = millis();

  // Screen transition: Welcome screen for exactly 4 seconds
  if (screen == WELCOME && (now - screenChangedAt >= WELCOME_MS)) {
    setScreen(MENU);
  }

  // Periodic retry of any pending unsynced results
  if (pendingLoaded && (now - lastSyncAttempt >= RETRY_SYNC_MS)) {
    lastSyncAttempt = now;
    if (sendResultToBackend(pending)) {
      clearPendingResult();
      if (screen == MENU) setScreen(MENU);
    }
  }

  // Handle RUNNING timing state
  if (screen == RUNNING) {
    unsigned long currentElapsedMs = (now - runStartMs);

    // Update running time on row 1 of the 16x2 LCD every 75ms
    if (now - lastRunningLcdUpdate > 75) {
      lastRunningLcdUpdate = now;
      char runTimeLine[20];
      snprintf(runTimeLine, sizeof(runTimeLine), "Time: %lu.%03lu s", currentElapsedMs / 1000UL, currentElapsedMs % 1000UL);
      updateLine(1, runTimeLine);
    }

    // Check IR sensor trigger (after arming lockout)
    int currentIr = digitalRead(IR_PIN);
    if ((now - runStartMs > IR_ARM_LOCKOUT_MS) && (currentIr != irIdleState)) {
      unsigned long finishUs = micros();
      resultElapsedMs = (finishUs - runStartUs) / 1000UL;

      // Create persistent pending record
      ++sequence;
      memset(&pending, 0, sizeof(pending));
      pending.sequence = sequence;
      pending.elapsedMs = resultElapsedMs;
      strncpy(pending.athleteId, selectedAthleteId, sizeof(pending.athleteId) - 1);
      strncpy(pending.athleteName, selectedAthleteName, sizeof(pending.athleteName) - 1);
      snprintf(pending.resultId, sizeof(pending.resultId), "%s-b%u-%u", RIADHA_DEVICE_ID, bootCounter, sequence);
      savePendingResult();

      setScreen(SHOW_RESULT);

      // Save to database
      if (sendResultToBackend(pending)) {
        clearPendingResult();
        updateLine(1, "Saved! 2=Run #=M");
      } else {
        updateLine(1, "Queued!2=Run #=M");
      }
      return;
    }

    // Timeout check
    if (currentElapsedMs > MAX_TEST_MS) {
      showScreenLines("Test Timed Out! ", "* Return to Menu");
      delay(2500);
      setScreen(MENU);
      return;
    }
  }

  // Read Keypad input
  char key = customKeypad.getKey();
  if (!key) return;

  // Keypad actions per screen
  switch (screen) {
    case WELCOME:
      // Can skip welcome by pressing any key
      setScreen(MENU);
      break;

    case MENU:
      if (key == '1') {
        inputAthleteId[0] = '\0';
        setScreen(ENTER_ATHLETE_ID);
      } else if (key == '2') {
        if (selectedAthleteId[0] == '\0') {
          setScreen(NO_ATHLETE_WARNING);
        } else {
          // Start timer immediately!
          irIdleState = digitalRead(IR_PIN);
          runStartUs = micros();
          runStartMs = millis();
          setScreen(RUNNING);
        }
      }
      break;

    case ENTER_ATHLETE_ID: {
      size_t len = strlen(inputAthleteId);
      if (key >= '0' && key <= '9') {
        if (len < sizeof(inputAthleteId) - 1 && len < 6) {
          inputAthleteId[len] = key;
          inputAthleteId[len + 1] = '\0';
          char l0[17];
          snprintf(l0, sizeof(l0), "Enter ID: %-6.6s", inputAthleteId);
          updateLine(0, l0);
        }
      } else if (key == '*') {
        if (len > 0) {
          inputAthleteId[len - 1] = '\0';
          char l0[17];
          snprintf(l0, sizeof(l0), "Enter ID: %-6.6s", inputAthleteId);
          updateLine(0, l0);
        } else {
          setScreen(MENU);
        }
      } else if (key == '#' && len > 0) {
        // Query database for athlete ID
        showScreenLines("Searching DB... ", inputAthleteId);
        char firstName[32] = "";
        bool found = lookupAthleteInDatabase(inputAthleteId, firstName, sizeof(firstName));

        if (found) {
          strncpy(selectedAthleteId, inputAthleteId, sizeof(selectedAthleteId) - 1);
          strncpy(selectedAthleteName, firstName, sizeof(selectedAthleteName) - 1);
          setScreen(ATHLETE_CONFIRMED);
        } else {
          showScreenLines("Athlete Not inDB", "*=Back to Menu  ");
        }
      }
      break;
    }

    case ATHLETE_CONFIRMED:
      if (key == '2') {
        // Start Timer for confirmed athlete
        irIdleState = digitalRead(IR_PIN);
        runStartUs = micros();
        runStartMs = millis();
        setScreen(RUNNING);
      } else if (key == '*' || key == '#') {
        setScreen(MENU);
      }
      break;

    case NO_ATHLETE_WARNING:
      if (key == '1') {
        inputAthleteId[0] = '\0';
        setScreen(ENTER_ATHLETE_ID);
      } else if (key == '*') {
        setScreen(MENU);
      }
      break;

    case RUNNING:
      // Allow aborting run
      if (key == '*') {
        showScreenLines("Test Aborted!   ", "Returning...    ");
        delay(1000);
        setScreen(MENU);
      }
      break;

    case SHOW_RESULT:
      if (key == '#' || key == '*') {
        setScreen(MENU);
      } else if (key == '2') {
        // Run again with the same athlete
        irIdleState = digitalRead(IR_PIN);
        runStartUs = micros();
        runStartMs = millis();
        setScreen(RUNNING);
      }
      break;
  }
}
