# RiadhaTrac Frontend

Local browser dashboard for coaches and administrators on the same network as the RiadhaTrac backend.

## Features

- **HTTP Basic authentication** – credentials stored only in sessionStorage, cleared on logout or 401
- **Dashboard** – athlete count, tests today, recent results, device online/offline status
- **Athletes** – search, create profiles, view consent/sharing status, best & latest results, full history
- **Results** – filterable table (athlete, event, distance, date range, school/club, device) + comparison of equivalent results only
- **Devices** – last-seen, firmware, status, last result; live refresh
- **Polling** – uses `refreshIntervalMs` from `GET /api/dashboard-config` (defaults to 5 s)

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router 6
- Lucide icons
- date-fns

## Quick start

```bash
cd riadha-trac-frontend
npm install
npm run dev
```

Open http://localhost:5173

The Vite dev server proxies `/api` → `http://localhost:8080` (see `vite.config.ts`).  
Point the backend to the same host or set `VITE_API_BASE` in a `.env` file.

## Backend contract

| Endpoint | Purpose |
| --- | --- |
| `GET /api/dashboard-config` | Auth check + refresh interval + feature flags |
| `GET /api/athletes?query=` | Directory / search |
| `POST /api/athletes` | Create athlete |
| `GET /api/athletes/{id}` | Profile |
| `GET /api/athletes/{id}/results` | Result history |
| `GET /api/results` | Filtered results |
| `GET /api/devices` | Device status |

All requests send `Authorization: Basic …`. On 401/403 the UI returns to the login screen.

## Privacy notes

- Consent status is always visible on athlete profiles.
- Prototype / unverified timings are labelled as non-official.
- Comparison only allows results that share event + distance + protocol + category.
- No MQTT credentials, device secrets, or broker details ever reach the browser.

## Build for production

```bash
npm run build
# serve the dist/ folder behind the same origin as the API, or configure CORS
```

## Project structure

```
riadha-trac-frontend/
├── .env.example
├── .gitignore
├── README.md
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── public/
│   ├── favicon.svg
│   └── logo.jpeg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── api/
    │   └── client.ts
    ├── context/
    │   └── AuthContext.tsx
    ├── hooks/
    │   └── usePolling.ts
    ├── lib/
    │   └── utils.ts
    ├── types/
    │   └── index.ts
    └── components/
        ├── Login.tsx
        ├── Layout.tsx
        ├── Dashboard.tsx
        ├── ui/
        │   ├── Spinner.tsx
        │   └── StatusDot.tsx
        ├── Athletes/
        │   ├── AthleteList.tsx
        │   ├── AthleteForm.tsx
        │   └── AthleteProfile.tsx
        ├── Results/
        │   ├── ResultsTable.tsx
        │   └── ResultCompare.tsx
        └── Devices/
            └── DeviceList.tsx
```
