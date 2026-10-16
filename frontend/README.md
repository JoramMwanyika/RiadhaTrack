# RiadhaTrac frontend

This folder is reserved for the local browser dashboard. It will be used by
coaches and administrators on the same local network as the RiadhaTrac backend.

## What the frontend should do

- Provide an authenticated login experience for dashboard users.
- Show a dashboard summary: athlete count, tests today, recent results, device
  online/offline status, and pending/sync indicators where available.
- Let authorized users search for athletes and create full athlete profiles.
- Show athlete profiles with consent/sharing status, best result, latest result,
  and dated performance history.
- Provide a results table with filters for athlete, event, distance, date range,
  school/club, and device.
- Compare only equivalent results: same event, distance, protocol, and category.
  Clearly label prototype/unverified timing quality as non-official.
- Show device last-seen time, firmware version, status, and last result.
- Refresh results and device status every five seconds for the MVP, using the
  interval returned by the backend.

## Backend integration

The frontend communicates with the backend over HTTP. It should begin by
requesting authenticated `GET /api/dashboard-config`, then use:

| Endpoint | Use |
| --- | --- |
| `GET /api/athletes?query=` | Athlete directory and search |
| `POST /api/athletes` | Register a new athlete |
| `GET /api/athletes/{id}` | Athlete profile |
| `GET /api/athletes/{id}/results` | Athlete result history |
| `GET /api/results` | Results table, filtering, and comparisons |
| `GET /api/devices` | Device status page |

For the initial MVP, API calls use HTTP Basic authentication. Keep credentials
out of source control and handle failed/expired access by returning the user to
the login flow.

## MQTT boundary

The browser must **not** connect directly to Mosquitto and must never contain
device, broker, or database credentials. The backend subscribes to device MQTT
messages, validates and stores them, then exposes safe dashboard data through
the API. The topic templates in `/api/dashboard-config` are documentation for
the UI only, not connection instructions.

## Privacy and permissions

- Display only the minimum athlete information needed by the current user.
- Make consent/sharing status visible before showing or exporting an athlete's
  information.
- Restrict profile edits, result corrections, deletions, and exports to the
  authorized roles implemented by the backend.
- Require a reason for any future correction/deletion workflow so it can be
  audited.

## Future implementation

When development starts, add the selected frontend framework, components,
routing, styles, and tests here. Keep this dashboard suitable for local,
low-bandwidth use and usable on a coach's laptop or tablet.
