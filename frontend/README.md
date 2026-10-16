# RiadhaTrac frontend

This is a dependency-free local dashboard. It connects to the FastAPI backend,
which is the only component allowed to read or write the SQLite database.

## Run locally

Start the backend first from `../backend`, then serve this directory:

```powershell
cd RiadhaTrack\frontend
python -m http.server 5173
```

Open `http://127.0.0.1:5173`. Sign in with the backend's initial admin account.
The default API address is `http://127.0.0.1:8000`; change it on the login page
when accessing the backend through a LAN IP.

The dashboard uses the protected API to load athletes, results, and devices,
and to create athlete records. It does not access SQLite or MQTT directly.
