# Mosquitto local setup

Install Mosquitto on the local server. Place `mosquitto.conf` where your
installation expects broker configuration, then create the paths referenced by
it: `data/` and `config/`.

Copy `aclfile.example` to `config/aclfile` and add one constrained account per
device. Create the backend and device passwords with `mosquitto_passwd`; do not
commit `passwordfile` or real ACL files.

The backend connects using `RIADHA_MQTT_HOST`, `RIADHA_MQTT_PORT`,
`RIADHA_MQTT_USERNAME`, and `RIADHA_MQTT_PASSWORD`. Its configured topic prefix
is `RIADHA_MQTT_TOPIC_PREFIX` (default: `riadha/v1`).
