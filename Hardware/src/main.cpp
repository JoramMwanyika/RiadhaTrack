#include <Arduino.h>
#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_MCP23X17.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

// NodeMCU ESP8266 pins. LCD + keypad share I2C, leaving D5/D6 for gate interrupts.
constexpr byte SDA_PIN = 4;       // D2
constexpr byte SCL_PIN = 5;       // D1
constexpr byte START_PIN = 14;    // D5
constexpr byte FINISH_PIN = 12;   // D6
constexpr unsigned long WELCOME_MS = 3000;
constexpr unsigned long MAX_TEST_MS = 120000;
constexpr unsigned long EDGE_LOCKOUT_US = 50000;
constexpr unsigned long RETRY_MS = 10000;
constexpr unsigned long RECONNECT_MS = 10000;
constexpr uint32_t PENDING_MAGIC = 0x52544431;
constexpr int EEPROM_BYTES = 256;
constexpr int BOOT_COUNTER_ADDRESS = 0;
constexpr int PENDING_ADDRESS = 16;

LiquidCrystal_I2C lcd(0x27, 20, 4);
Adafruit_MCP23X17 keypad;
WiFiClient wifiClient;
MqttClient mqtt(wifiClient);

enum Screen : byte { WELCOME, MENU, ENTER_ATHLETE, CONFIRM, READY, RUNNING, SHOW_RESULT, PENDING_SYNC };
Screen screen = WELCOME;

volatile bool timingArmed = false;
volatile bool timingRunning = false;
volatile bool startCaptured = false;
volatile bool finishCaptured = false;
volatile unsigned long startTickUs = 0, finishTickUs = 0;
volatile unsigned long lastStartEdgeUs = 0, lastFinishEdgeUs = 0;

struct PendingResult {
  uint32_t magic, sequence, elapsedMs;
  char athleteId[17];
  char resultId[33];
  uint32_t checksum;
};

PendingResult pending{};
char athleteId[17] = "";
char resultsTopic[96], ackTopic[128];
uint32_t bootCounter = 0, sequence = 0;
unsigned long screenChangedAt = 0, runStartedAt = 0, lastPublishAt = 0, lastConnectAt = 0, resultElapsedMs = 0;
bool pendingLoaded = false;

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

void show(const char *line1, const char *line2 = "", const char *line3 = "", const char *line4 = "") {
  const char *lines[] = {line1, line2, line3, line4};
  lcd.clear();
  for (byte row = 0; row < 4; ++row) { lcd.setCursor(0, row); lcd.print(lines[row]); }
}

void changeScreen(Screen next) {
  screen = next;
  screenChangedAt = millis();
  if (next == MENU) show("1 Select Athlete", "2 Start Test", pendingLoaded ? "Pending sync exists" : "");
  if (next == ENTER_ATHLETE) show("Enter Athlete ID", athleteId, "* clear   # confirm");
  if (next == CONFIRM) show("Athlete selected:", athleteId, "# arm test  * change");
  if (next == READY) show("Ready at Start", athleteId, "Waiting for gate", "* cancel");
  if (next == RUNNING) show("Running", athleteId, "Waiting for finish");
  if (next == SHOW_RESULT) {
    char timeLine[21];
    snprintf(timeLine, sizeof(timeLine), "Time: %lu.%03lu s", resultElapsedMs / 1000, resultElapsedMs % 1000);
    show("Test complete", timeLine, "Sending result...");
  }
  if (next == PENDING_SYNC) show("Pending Sync", pending.athleteId, "Keep device powered", "* returns to menu");
}

char scanKeypad() {
  const char keys[4][3] = {{'1','2','3'}, {'4','5','6'}, {'7','8','9'}, {'*','0','#'}};
  for (byte row = 0; row < 4; ++row) {
    keypad.digitalWrite(row, LOW);
    for (byte col = 0; col < 3; ++col) {
      if (keypad.digitalRead(4 + col) == LOW) {
        delay(20);
        while (keypad.digitalRead(4 + col) == LOW) delay(1);
        keypad.digitalWrite(row, HIGH);
        return keys[row][col];
      }
    }
    keypad.digitalWrite(row, HIGH);
  }
  return 0;
}

void ICACHE_RAM_ATTR onStartGate() {
  const unsigned long now = micros();
  if (timingArmed && !timingRunning && now - lastStartEdgeUs > EDGE_LOCKOUT_US) {
    lastStartEdgeUs = now; startTickUs = now; startCaptured = true; timingRunning = true;
  }
}

void ICACHE_RAM_ATTR onFinishGate() {
  const unsigned long now = micros();
  if (timingRunning && now - lastFinishEdgeUs > EDGE_LOCKOUT_US) {
    lastFinishEdgeUs = now; finishTickUs = now; finishCaptured = true; timingRunning = false; timingArmed = false;
  }
}

void publishPending() {
  if (!pendingLoaded || !mqtt.connected()) return;
  StaticJsonDocument<320> document;
  document["schema_version"] = 1;
  document["event_type"] = "timing.result.completed";
  document["result_id"] = pending.resultId;
  document["device_id"] = RIADHA_DEVICE_ID;
  document["athlete_id"] = pending.athleteId;
  JsonObject test = document.createNestedObject("test");
  test["sport"] = "athletics"; test["event"] = RIADHA_EVENT; test["distance_m"] = RIADHA_DISTANCE_M;
  JsonObject timing = document.createNestedObject("timing");
  timing["elapsed_ms"] = pending.elapsedMs; timing["start_detected"] = true; timing["finish_detected"] = true;
  timing["quality"] = "prototype_optical_sensor";
  document["sequence"] = pending.sequence;
  mqtt.beginMessage(resultsTopic, false, 1); // retained=false, QoS 1
  serializeJson(document, mqtt);
  mqtt.endMessage();
  lastPublishAt = millis();
}

void onMqttMessage(int) {
  StaticJsonDocument<192> document;
  if (deserializeJson(document, mqtt)) return;
  const char *resultId = document["result_id"] | "";
  const char *status = document["status"] | "";
  if (pendingLoaded && strcmp(resultId, pending.resultId) == 0 && strcmp(status, "stored") == 0) {
    clearPending();
    show("Saved", "Result stored safely");
    delay(1000);
    changeScreen(MENU);
  }
}

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastConnectAt >= RECONNECT_MS) { lastConnectAt = millis(); WiFi.begin(RIADHA_WIFI_SSID, RIADHA_WIFI_PASSWORD); }
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

void makeResult() {
  noInterrupts(); const unsigned long elapsedUs = finishTickUs - startTickUs; interrupts();
  resultElapsedMs = elapsedUs / 1000UL;
  ++sequence;
  memset(&pending, 0, sizeof(pending));
  pending.sequence = sequence; pending.elapsedMs = resultElapsedMs;
  strncpy(pending.athleteId, athleteId, sizeof(pending.athleteId) - 1);
  snprintf(pending.resultId, sizeof(pending.resultId), "%s-b%u-%u", RIADHA_DEVICE_ID, bootCounter, sequence);
  savePending();
  publishPending();
  changeScreen(SHOW_RESULT);
}

void setup() {
  EEPROM.begin(EEPROM_BYTES);
  EEPROM.get(BOOT_COUNTER_ADDRESS, bootCounter);
  ++bootCounter; EEPROM.put(BOOT_COUNTER_ADDRESS, bootCounter); EEPROM.commit();
  EEPROM.get(PENDING_ADDRESS, pending);
  pendingLoaded = pending.magic == PENDING_MAGIC && pending.checksum == recordChecksum(pending);
  sequence = pendingLoaded ? pending.sequence : 0;
  snprintf(resultsTopic, sizeof(resultsTopic), "%s/devices/%s/results", RIADHA_MQTT_PREFIX, RIADHA_DEVICE_ID);
  snprintf(ackTopic, sizeof(ackTopic), "%s/devices/%s/acks/+", RIADHA_MQTT_PREFIX, RIADHA_DEVICE_ID);
  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init(); lcd.backlight();
  keypad.begin_I2C(RIADHA_KEYPAD_ADDRESS);
  for (byte row = 0; row < 4; ++row) { keypad.pinMode(row, OUTPUT); keypad.digitalWrite(row, HIGH); }
  for (byte col = 4; col < 7; ++col) keypad.pinMode(col, INPUT_PULLUP);
  pinMode(START_PIN, INPUT_PULLUP); pinMode(FINISH_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(START_PIN), onStartGate, FALLING);
  attachInterrupt(digitalPinToInterrupt(FINISH_PIN), onFinishGate, FALLING);
  mqtt.onMessage(onMqttMessage);
  WiFi.mode(WIFI_STA); WiFi.begin(RIADHA_WIFI_SSID, RIADHA_WIFI_PASSWORD);
  lastConnectAt = millis();
  show("RIADHATRAC", "Welcome Athlete"); screenChangedAt = millis();
}

void loop() {
  ensureMqtt();
  if (screen == WELCOME && millis() - screenChangedAt >= WELCOME_MS) changeScreen(pendingLoaded ? PENDING_SYNC : MENU);
  if (pendingLoaded && millis() - lastPublishAt >= RETRY_MS) publishPending();
  if (startCaptured) { noInterrupts(); startCaptured = false; interrupts(); runStartedAt = millis(); changeScreen(RUNNING); }
  if (finishCaptured) { noInterrupts(); finishCaptured = false; interrupts(); makeResult(); }
  if (screen == RUNNING && millis() - runStartedAt > MAX_TEST_MS) { timingArmed = false; timingRunning = false; show("Test timed out", "No finish detected", "* return to menu"); }
  const char key = scanKeypad();
  if (!key) return;
  if (screen == MENU && !pendingLoaded) { if (key == '1') changeScreen(ENTER_ATHLETE); if (key == '2' && athleteId[0]) changeScreen(CONFIRM); }
  else if (screen == ENTER_ATHLETE) {
    const size_t length = strlen(athleteId);
    if (key == '*') { athleteId[0] = '\0'; changeScreen(ENTER_ATHLETE); }
    else if (key == '#' && length) changeScreen(CONFIRM);
    else if (key >= '0' && key <= '9' && length < sizeof(athleteId) - 1) { athleteId[length] = key; athleteId[length + 1] = '\0'; changeScreen(ENTER_ATHLETE); }
  } else if (screen == CONFIRM) { if (key == '#') { timingArmed = true; timingRunning = false; changeScreen(READY); } if (key == '*') changeScreen(ENTER_ATHLETE); }
  else if ((screen == READY || screen == RUNNING || screen == PENDING_SYNC) && key == '*') { timingArmed = false; timingRunning = false; changeScreen(MENU); }
}
