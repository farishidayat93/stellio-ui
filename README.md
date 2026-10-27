# Stellio UI

A web interface for exploring and managing a [Stellio](https://github.com/stellio-hub/stellio-context-broker) NGSI-LD context broker instance.

## Features

- **Overview** (`/`) — landing page linking to the enabled sections, with the current connection status and a short-cut to Settings when no broker is configured
- **Entities** (`/entities`) — browse all entity types with entity and attribute counts; open a type to inspect its attributes, filter its entities and page through them
- **Subscriptions** (`/subscriptions`) — view active subscriptions in a grid with endpoint, triggers, send count and last notification time
- **Attributes** (`/attributes`) — browse all attributes, configure field type and default value per attribute (persisted to SQLite)
- **Settings** (`/settings`) — configure the Stellio host/port, opt into the multi-host switcher and manage the saved connections (storage is always SQLite)

## Getting Started

### Prerequisites

- Node.js >= 22 (better-sqlite3 13 does not support older releases)
- A running Stellio instance
- Docker with Compose v2, if you prefer the [container deployment](#docker) over Node

### Install

```sh
npm install
```

### Configure

Copy `.env.example` to `.env` and set your Stellio host and port:

```sh
cp .env.example .env
```

```env
STELLIO_HOST=localhost
STELLIO_PORT=8765
```

These are used as the initial seed values. Once the app runs, connection settings can be changed from the **Settings** page and are persisted to the local SQLite database. The first connection saved there is also added to the [saved broker list](#multiple-brokers).

### Connection guardrail

If no Stellio host and port are available from either the environment or the local
database, the app does not attempt to reach Stellio. Instead it shows a
**Connect to a Stellio context broker** prompt linking to the **Settings** page,
and the Settings page displays a "not connected" banner. The landing page is
exempt from the guardrail so its section cards stay reachable, and it shows the
same warning inline instead. Page data loaders return
empty results rather than erroring, and the NGSI-LD client throws a descriptive
`StellioNotConfiguredError` if something tries to call it anyway. Saving a
connection requires both a host and a numeric port.

### Develop

```sh
npm run dev
```

### Build

```sh
npm run build
npm run preview   # vite preview, default port 4173 — or: node build/index.js
```

The build uses `@sveltejs/adapter-node`, so `npm run build` always emits a runnable Node server in `build/`. `node build/index.js` serves it on `PORT` (default 3000) and reads its connection settings from the environment at startup rather than baking them into the bundle, so one build can be deployed against a different broker.

### Docker

`Dockerfile` and `compose.yaml` are the supported deployment path — nothing but Docker and a reachable Stellio broker is required on the host.

```sh
cp .env.example .env          # optional: seed STELLIO_HOST / STELLIO_PORT
docker compose up -d --build  # build the image and start it
```

Then open <http://localhost:3000>. Compose reads `.env` for the seed connection, so the container talks to the same broker `npm run dev` uses; to reach a broker running on the Docker host itself, set `STELLIO_HOST=host.docker.internal` (the compose file already adds the `host-gateway` mapping).

| Piece           | Where it goes                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Image           | built locally as `stellio-ui:local`; a pullable registry image can replace `build:` later (the compose file marks where)          |
| SQLite database | `/data/stellio-ui.db` inside the `stellio-data` named volume, so settings and cached type snapshots survive `docker compose down` |
| Port            | `3000` in the container, published as `${UI_PORT:-3000}` on the host                                                              |
| Seed settings   | `STELLIO_HOST` / `STELLIO_PORT` from `.env`                                                                                       |
| Tuning          | `STELLIO_TIMEOUT_MS`, `STELLIO_MAX_CONCURRENCY`, `STELLIO_CACHE_DISABLED` (uncomment in `compose.yaml`)                           |
| Healthcheck     | the image probes `/` every 30s; `docker compose ps` reports health                                                                |

Useful commands:

```sh
docker compose logs -f stellio-ui   # follow the server log
docker compose exec stellio-ui ls -l /data
docker compose down                 # stop, keep the volume
docker compose down -v              # stop and delete settings + cache
```

The container runs as the unprivileged `node` user (uid 1000) and only ever writes to `/data`. To keep the database in a host directory instead of a volume, replace `stellio-data:/data` with `./data:/data` and run `mkdir -p data && chown 1000:1000 data` first.

## Project Structure

```markdown
src/
├── lib/
│ ├── stellio.ts # NGSI-LD API client (axios, cached + connection-pooled)
│ ├── entities.ts # Browser-safe entity types + filter/query helpers
│ ├── components/ # Entity browser UI (type list, panel, attributes, filters, table)
│ ├── cache.ts # TTL cache with single-flight and stale-while-revalidate
│ ├── concurrency.ts # Bounded-concurrency helpers (semaphore, runPool)
│ ├── db.ts # SQLite database (settings, attribute configs, type snapshots)
│ ├── hosts.ts # Saved Stellio connections + multi-host switcher state
│ └── config.ts # Feature flags and theme
├── routes/
│ ├── +page # Overview (landing page)
│ ├── entities/ # Entities
│ ├── subscriptions/ # Subscriptions
│ ├── attributes/ # Attributes
│ ├── settings/ # Connection, multi-host and storage settings
│ └── api/ # Server-side API routes
└── env.ts # Environment variable fallback

Dockerfile # two-stage image: build with adapter-node, run as the node user
compose.yaml # single-service deployment (mounts the stellio-data volume)
```

## Performance & Caching

Stellio answers `/types/{typeName}` by aggregating every entity of that type, so
the cost of opening a type grows with its size — measured on a 1.6M-entity
instance: ~2s for a 13-entity type, ~7.5s for a 10k-entity type and ~20-22s for
the 497k-entity `Alert` type. A page that needs a count for each of 24 types
therefore cannot afford to ask for them up front.

What the UI does instead:

- **One request on load.** The Entities page (`/entities`) fetches `/types`
  (cheap) and renders immediately; the expensive per-type calls are never
  awaited by the server.
- **Progressive hydration.** Types whose counts are unknown are marked
  `pending`, shown as `···`, and filled in by the browser in small batches
  (3 concurrent requests) after the page has painted.
- **Persisted snapshots.** Every `/types/{typeName}` answer is stored in the
  `type_info_cache` table, keyed by host and port, so a freshly started server
  paints the real counts from disk.
- **TTL cache with stale-while-revalidate.** Responses are cached in-process
  (`/types` 60s, `/types/{typeName}` and `/attributes/{name}` 5min, entity pages
  30s, `/attributes` and `/subscriptions` 60s). An expired entry is served
  immediately while a refresh runs behind it, and concurrent readers of the same
  key share a single request.
- **Calls are pooled.** One axios instance per connection with keep-alive
  sockets, a per-request timeout (60s) and a global concurrency cap (4) so a slow
  query cannot occupy every connection.
- **No `count=true`.** NGSI-LD `count=true` was measured at ~60x the cost of a
  plain page (10.5s vs 0.17s on a 1.5k-entity type); the UI uses the cached type
  counts for pagination instead.

Repeat views of the same data are served from memory: on the instance above,
`/types/Alert` went from 22.6s cold to 0.009s warm, and the Entities page
from ~21.6s (blocking) to ~2s first paint.

Requesting `GET /api/types/{typeName}?refresh=1` bypasses the cache for that one
call.

Optional environment knobs: `STELLIO_TIMEOUT_MS` (default 60000),
`STELLIO_MAX_CONCURRENCY` (default 4) and `STELLIO_CACHE_DISABLED` (default
false) — see `.env.example`.

## Configuration

### Feature Flags

Toggle pages on/off in `src/lib/config.ts`:

```ts
export const features = {
	entityTypes: true,
	subscriptions: true,
	attributes: true
};
```

### Theme

Change the accent color in `src/lib/config.ts`:

```ts
export type Theme = 'indigo' | 'emerald' | 'rose' | 'amber';
export const theme: Theme = 'indigo';
```

### Multiple Brokers

The app talks to one Stellio broker at a time. By default that is the connection
saved under **Settings → Stellio Connection**; because several brokers are often
used side by side, the saved list can be exposed as a switcher in the header.

- **Saved connections.** Saving a host and port adds it to the list. The list
  holds at most 10 connections, most recently used first, and lives in the
  local SQLite database (`stellio_hosts`). On a fresh install the first read
  seeds it from `STELLIO_HOST` / `STELLIO_PORT`, so the connection already
  configured shows up as a saved broker.
- **The switcher.** Turn on **Settings → Multiple hosts** to add a connection
  `<select>` to the header, next to the theme switcher. Picking another entry
  switches the app to it (`POST /api/settings` with `active_host`), reloads the
  layout and the current page, and moves that broker to the top of the list.
  The switcher renders only when the toggle is on, and only saved connections
  (plus the connection in use) are offered — a value that isn't on the list is
  rejected by the API.
- **Active connection.** Switching rewrites the existing `stellio_host` /
  `stellio_port` settings, so per-host data keeps working unchanged: the
  cached type snapshots (`type_info_cache`) are keyed by host and port and stay
  valid per broker, while the in-process response cache is cleared on a switch
  because it belongs to the previous broker. Toggling **Multiple hosts** by
  itself does not touch the caches.
- **Removing a host.** Removing the connection currently in use keeps the app
  on it (something has to be connected) but stops offering it in the switcher;
  the header then shows it as the current entry. Saving a host and port again
  re-adds it.

## Local Database

Attribute configurations and settings are stored in `stellio-ui.db` (SQLite) in the project root. This file is excluded from version control. Point `STELLIO_DB_PATH` at another location to move it — the [Docker image](#docker) uses `/data/stellio-ui.db` inside its volume, and the parent directory is created if it does not exist.

The last known entity and attribute counts per entity type are kept in the same file (`type_info_cache`), keyed by Stellio host and port. They let the Entities page render real counts without querying Stellio first — see [Performance & Caching](#performance--caching).

The database engine is fixed to **SQLite** for now. The type picker that used to offer PostgreSQL and MySQL is gone from Settings: the stored `db_type` is forced back to `sqlite` (on startup and on every settings write), and the API no longer accepts another value for it. If an external database is added later, the credentials some older installs saved (`db_host`, `db_port`, `db_name`, `db_user`, `db_password`) are still in the database untouched.
