#pragma once

// Copy this file to secrets.h, replace every placeholder, and keep secrets.h
// out of source control. Use a per-device MQTT account from the broker ACL.
#define RIADHA_WIFI_SSID "YOUR_WIFI_SSID"
#define RIADHA_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define RIADHA_MQTT_HOST "192.168.1.10"
#define RIADHA_MQTT_PORT 1883
#define RIADHA_MQTT_USERNAME "riadha-device-dev01"
#define RIADHA_MQTT_PASSWORD "YOUR_DEVICE_MQTT_PASSWORD"
#define RIADHA_MQTT_PREFIX "riadha/v1"
#define RIADHA_DEVICE_ID "dev01"
#define RIADHA_EVENT "sprint"
#define RIADHA_DISTANCE_M 100
#define RIADHA_BACKEND_HOST "192.168.1.10"
#define RIADHA_BACKEND_PORT 8000
// Direct 4x4 keypad: its rows and columns are configured in src/main.cpp.
