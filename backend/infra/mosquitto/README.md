# RiadhaTrack Mosquitto broker

This folder provides a local-only Mosquitto configuration for RiadhaTrack. It requires authenticated accounts and limits every device to its own MQTT topics.

The supplied [`mosquitto.conf`](mosquitto.conf) uses absolute workspace paths and listens on TCP port **1884**. It is appropriate for this checkout; change the paths if you relocate the project or run Mosquitto as a service.

## Set up runtime files

From `RiadhaTrack/backend`:

```powershell
New-Item -ItemType Directory -Force -Path infra\mosquitto\data, infra\mosquitto\config
Copy-Item infra\mosquitto\aclfile.example infra\mosquitto\config\aclfile
```

Create an account for the backend and one account for the first timing unit. Use `-c` only for the first command; repeating it overwrites the password file.

```powershell
mosquitto_passwd -c infra\mosquitto\config\passwordfile riadha-backend
mosquitto_passwd infra\mosquitto\config\passwordfile riadha-device-dev01
```

Edit `infra/mosquitto/config/aclfile` and uncomment the `dev01` rules. For every additional device, add a unique MQTT account plus a matching device-specific ACL block. Never commit `passwordfile` or a real ACL file.

## Start the broker

Run the broker from this folder so that relative command examples remain clear:

```powershell
cd RiadhaTrack\backend\infra\mosquitto
mosquitto -c mosquitto.conf -v
```

If Mosquitto is not on `PATH`, use its executable path, for example:

```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" -c mosquitto.conf -v
```

Confirm the listener:

```powershell
Get-NetTCPConnection -LocalPort 1884 -State Listen
```

Set `RIADHA_MQTT_PORT=1884` in `backend/.env` and `RIADHA_MQTT_PORT 1884` in every timing device configuration. If you change the listener port, update all three locations.

## Topic permissions

The `riadha-backend` account can read device results, status, and events and can write acknowledgements and commands. A device account can write only its own status, events, and results and can read only its own acknowledgements and commands.

With the default prefix, device `dev01` publishes results to:

```text
riadha/v1/devices/dev01/results
```

The backend replies to:

```text
riadha/v1/devices/dev01/acks/{result_id}
```

Keep the ACL prefix, `RIADHA_MQTT_TOPIC_PREFIX`, and device `RIADHA_MQTT_PREFIX` identical.

## Security

Use this broker only on a trusted local network. Do not expose port 1884 to the internet. Add TLS and review the Mosquitto service account and file permissions before sending traffic across an untrusted network.
