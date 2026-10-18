#include <Arduino.h>
#include <EEPROM.h>
#include <WiFi.h>
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

// ESP32 DevKit wiring. Dxx means the pin labelled xx on the ESP32 board.
constexpr byte LCD_SDA_D = 21;
constexpr byte LCD_SCL_D = 22;
constexpr byte IR_FINISH_D = 19;
constexpr byte ROWS = 4;
constexpr byte COLS = 4;
byte rowPins[ROWS] = {13, 12, 14, 27};
byte colPins[COLS] = {26, 25, 33, 32};
char keyMap[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};

constexpr unsigned long WELCOME_MS = 3000;
constexpr unsigned long MAX_TEST_MS = 120000;
constexpr unsigned long RETRY_MS = 10000;
constexpr unsigned long RECONNECT_MS = 10000;
constexpr uint32_t PENDING_MAGIC = 0x52544533;
constexpr int EEPROM_BYTES = 512;
constexpr int BOOT_COUNTER_ADDRESS = 0;
constexpr int PENDING_ADDRESS = 16;

LiquidCrystal_I2C lcd(0x27, 16, 2);
Keypad keypad = Keypad(makeKeymap(keyMap), rowPins, colPins, ROWS, COLS);
WiFiClient wifiClient;
MqttClient mqtt(wifiClient);

enum Screen : byte { WELCOME, MENU, ENTER_ATHLETE, RUNNING, SHOW_RESULT, PENDING_SYNC, MESSAGE };
Screen screen = WELCOME;

struct PendingResult {
  uint32_t magic;
  uint32_t sequence;
  uint32_t elapsedMs;
  char athleteId[17];
  char resultId[33];
  uint32_t checksum;
};

PendingResult pending{};
char athleteId[17] = "";
char resultsTopic[96];
char ackTopic[128];
uint32_t bootCounter = 0;
uint32_t sequence = 0;
unsigned long screenChangedAt = 0;
unsigned long timerStartedUs = 0;
unsigned long lastPublishAt = 0;
unsigned long lastConnectAt = 0;
unsigned long resultElapsedMs = 0;
bool pendingLoaded = false;
bool finishSensorWasClear = false;

uint32_t recordChecksum(const PendingResult &value) {
  const byte *data = reinterpret_cast<const byte *>(&value);
  uint32_t total = 0;
  for (size_t i = 0; i < sizeof(PendingResult) - sizeof(value.checksum); ++i) total += data[i];
  return total;
}

void savePending() {
  pending.magic = PENDING_MAGIC;
  pending.checksum = recordChecksum(pending);
  EEPROM.put(PENDING_ADDRESS, pending);
  EEPROM.commit();
  pendingLoaded = true;
}

void clearPending() {
  pending.magic = 0;
  pending.checksum = recordChecksum(pending);
  EEPROM.put(PENDING_ADDRESS, pending);
  EEPROM.commit();
  pendingLoaded = false;
}

void show(const char *top, const char *bottom = "") {
  char topLine[17];
  char bottomLine[17];
  snprintf(topLine, sizeof(topLine), "%-16.16s", top);
  snprintf(bottomLine, sizeof(bottomLine), "%-16.16s", bottom);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(topLine);
  lcd.setCursor(0, 1);
  lcd.print(bottomLine);
}

void showMenu() {
  if (athleteId[0]) show(athleteId, "B Start Timer");
  else show("A Select Athlete", "B Start Timer");
}

void changeScreen(Screen next) {
  screen = next;
  screenChangedAt = millis();
  if (next == MENU) showMenu();
  else if (next == ENTER_ATHLETE) show("Enter athlete ID", athleteId[0] ? athleteId : "# save  C clear");
  else if (next == RUNNING) show("TIMING...", "IR is finish");
  else if (next == PENDING_SYNC) show("Result pending", "Waiting for sync");
  else if (next == SHOW_RESULT) {
    char result[17];
    snprintf(result, sizeof(result), "%lu.%03lus", resultElapsedMs / 1000, resultElapsedMs % 1000);
    show("Time recorded", result);
  }
}

void publishPending() {
  if (!pendingLoaded || !mqtt.connected()) return;
  JsonDocument document;
  document["schema_version"] = 1;
  document["event_type"] = "timing.result.completed";
  document["result_id"] = pending.resultId;
  document["device_id"] = RIADHA_DEVICE_ID;
  document["athlete_id"] = pending.athleteId;
  JsonObject test = document["test"].to<JsonObject>();
  test["sport"] = "athletics";
  test["event"] = RIADHA_EVENT;
  test["distance_m"] = RIADHA_DISTANCE_M;
  JsonObject timing = document["timing"].to<JsonObject>();
  timing["elapsed_ms"] = pending.elapsedMs;
  timing["start_detected"] = true;
  timing["finish_detected"] = true;
  timing["quality"] = "manual_start_ir_finish";
  document["sequence"] = pending.sequence;
  mqtt.beginMessage(resultsTopic, false, 1);
  serializeJson(document, mqtt);
  mqtt.endMessage();
  lastPublishAt = millis();
}

void onMqttMessage(int) {
  JsonDocument document;
  if (deserializeJson(document, mqtt)) return;
  const char *receivedId = document["result_id"] | "";
  const char *status = document["status"] | "";
  const char *reason = document["reason"] | "";
  if (!pendingLoaded || strcmp(receivedId, pending.resultId) != 0) return;
  if (strcmp(status, "stored") == 0) {
    clearPending();
    show("Saved dashboard", pending.athleteId);
    screen = MESSAGE;
    screenChangedAt = millis();
  } else if (strcmp(status, "rejected") == 0) {
    clearPending();
    show(strcmp(reason, "unknown_athlete") == 0 ? "Unknown athlete" : "Result rejected", strcmp(reason, "unknown_athlete") == 0 ? "Register ID first" : "Check backend");
    screen = MESSAGE;
    screenChangedAt = millis();
  }
}

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastConnectAt >= RECONNECT_MS) {
      lastConnectAt = millis();
      WiFi.begin(RIADHA_WIFI_SSID, RIADHA_WIFI_PASSWORD);
    }
    return;
  }
  if (!mqtt.connected() && millis() - lastConnectAt >= RECONNECT_MS) {
    lastConnectAt = millis();
    mqtt.setId(RIADHA_DEVICE_ID);
    mqtt.setUsernamePassword(RIADHA_MQTT_USERNAME, RIADHA_MQTT_PASSWORD);
    if (mqtt.connect(RIADHA_MQTT_HOST, RIADHA_MQTT_PORT)) mqtt.subscribe(ackTopic, 1);
  }
  if (mqtt.connected()) mqtt.poll();
}

void completeResult() {
  resultElapsedMs = (micros() - timerStartedUs) / 1000UL;
  ++sequence;
  memset(&pending, 0, sizeof(pending));
  pending.sequence = sequence;
  pending.elapsedMs = resultElapsedMs;
  strncpy(pending.athleteId, athleteId, sizeof(pending.athleteId) - 1);
  snprintf(pending.resultId, sizeof(pending.resultId), "%s-b%u-%u", RIADHA_DEVICE_ID, bootCounter, sequence);
  savePending();
  changeScreen(SHOW_RESULT);
  publishPending();
}

void pollFinishSensor() {
  if (screen != RUNNING) return;
  const bool sensorClear = digitalRead(IR_FINISH_D) == HIGH;
  if (sensorClear) finishSensorWasClear = true;
  if (finishSensorWasClear && !sensorClear) completeResult();
}

void startTimer() {
  timerStartedUs = micros();
  finishSensorWasClear = digitalRead(IR_FINISH_D) == HIGH;
  changeScreen(RUNNING);
}

void handleKey(char key) {
  if (screen == MENU) {
    if (key == 'A') changeScreen(ENTER_ATHLETE);
    else if (key == 'B') {
      if (pendingLoaded) changeScreen(PENDING_SYNC);
      else if (athleteId[0]) startTimer();
      else { show("Select athlete", "Press A first"); screen = MESSAGE; screenChangedAt = millis(); }
    }
    return;
  }
  if (screen == ENTER_ATHLETE) {
    const size_t length = strlen(athleteId);
    if (key >= '0' && key <= '9' && length < sizeof(athleteId) - 1) {
      athleteId[length] = key;
      athleteId[length + 1] = '\0';
      changeScreen(ENTER_ATHLETE);
    } else if (key == 'C') {
      athleteId[0] = '\0';
      changeScreen(ENTER_ATHLETE);
    } else if ((key == '#' || key == 'D') && length) changeScreen(MENU);
    else if (key == 'A' || key == '*') changeScreen(MENU);
    return;
  }
  if (screen == RUNNING && (key == 'A' || key == 'C' || key == '*')) {
    show("Test cancelled", "");
    screen = MESSAGE;
    screenChangedAt = millis();
  } else if ((screen == SHOW_RESULT || screen == PENDING_SYNC || screen == MESSAGE) && (key == 'A' || key == 'C' || key == '*' || key == '#')) changeScreen(MENU);
}

void setup() {
  EEPROM.begin(EEPROM_BYTES);
  EEPROM.get(BOOT_COUNTER_ADDRESS, bootCounter);
  ++bootCounter;
  EEPROM.put(BOOT_COUNTER_ADDRESS, bootCounter);
  EEPROM.commit();
  EEPROM.get(PENDING_ADDRESS, pending);
  pendingLoaded = pending.magic == PENDING_MAGIC && pending.checksum == recordChecksum(pending);
  sequence = pendingLoaded ? pending.sequence : 0;
  snprintf(resultsTopic, sizeof(resultsTopic), "%s/devices/%s/results", RIADHA_MQTT_PREFIX, RIADHA_DEVICE_ID);
  snprintf(ackTopic, sizeof(ackTopic), "%s/devices/%s/acks/+", RIADHA_MQTT_PREFIX, RIADHA_DEVICE_ID);
  Wire.begin(LCD_SDA_D, LCD_SCL_D);
  Wire.setClock(100000);
  lcd.init();
  lcd.backlight();
  pinMode(IR_FINISH_D, INPUT_PULLUP);
  mqtt.onMessage(onMqttMessage);
  WiFi.mode(WIFI_STA);
  WiFi.begin(RIADHA_WIFI_SSID, RIADHA_WIFI_PASSWORD);
  lastConnectAt = millis();
  show("RiadhaTrack", "Welcome Athlete");
  screenChangedAt = millis();
}

void loop() {
  ensureMqtt();
  pollFinishSensor();
  const unsigned long now = millis();
  if (screen == WELCOME && now - screenChangedAt >= WELCOME_MS) changeScreen(pendingLoaded ? PENDING_SYNC : MENU);
  if (screen == RUNNING && (micros() - timerStartedUs) / 1000UL > MAX_TEST_MS) {
    show("Test timed out", "Press A for menu");
    screen = MESSAGE;
    screenChangedAt = now;
  }
  if (pendingLoaded && now - lastPublishAt >= RETRY_MS) publishPending();
  if ((screen == SHOW_RESULT || screen == MESSAGE) && now - screenChangedAt >= 4000) changeScreen(pendingLoaded ? PENDING_SYNC : MENU);
  const char key = keypad.getKey();
  if (key) handleKey(key);
}
