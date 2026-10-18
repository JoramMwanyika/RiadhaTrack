# RiadhaTrack dashboard

The dashboard is a React 18 and Vite application for signing in, registering athletes, reviewing timing results, and viewing device status. It talks only to the FastAPI HTTP API; it never receives SQLite or MQTT credentials.

## Prerequisites

- Node.js 18 or later
- A running [RiadhaTrack backend](../backend/README.md)

## Run in development

```powershell
cd RiadhaTrack\frontend
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. The development server proxies `/api` requests to `http://localhost:8000`, so start the backend on that machine first.

Sign in with the administrator credentials configured in `backend/.env`. The backend creates that initial administrator on its first startup. The login screen can also create a local coach account; only administrators can delete athletes.

## Use from another machine

Vite listens on the LAN by default. When the dashboard and backend run on the same server, open:

```text
http://SERVER_LAN_IP:5173
```

The Vite proxy still reaches the local backend. Ensure the server firewall permits the dashboard port for the trusted LAN.

For a separately hosted frontend build, define `VITE_API_BASE` with the API prefix and add the frontend origin to `RIADHA_CORS_ORIGINS` in the backend configuration. For example:

```powershell
$env:VITE_API_BASE = "http://192.168.1.10:8000/api"
npm run build
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Vite development server |
| `npm run build` | Type-check and create the production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint, when an ESLint configuration is present |

## Behaviour

- Authentication uses an API-issued bearer token stored for the browser session.
- Results and device status are refreshed every five seconds.
- Athlete IDs must already exist before the timing unit can submit results for them.
- Result edits and exports are not implemented in the current dashboard.
