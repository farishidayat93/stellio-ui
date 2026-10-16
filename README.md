# Stellio UI

A web interface for exploring and managing a [Stellio](https://github.com/stellio-hub/stellio-context-broker) NGSI-LD context broker instance.

## Features

- **Entity Types** — browse all entity types with entity and attribute counts; expand a type to see its attributes with filter/form inputs per attribute type
- **Subscriptions** — view active subscriptions in a grid with endpoint, triggers, send count and last notification time
- **Attributes** — browse all attributes, configure field type and default value per attribute (persisted to SQLite)
- **Settings** — configure the Stellio host/port and database connection (SQLite default, PostgreSQL and MySQL supported)

## Getting Started

### Prerequisites

- Node.js >= 20
- A running Stellio instance

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

These are used as the initial seed values. Once the app runs, connection settings can be changed from the **Settings** page and are persisted to the local SQLite database.

### Develop

```sh
npm run dev
```

### Build

```sh
npm run build
npm run preview
```

## Project Structure

```
src/
├── lib/
│   ├── stellio.ts      # NGSI-LD API client (axios)
│   ├── db.ts           # SQLite database (settings + attribute configs)
│   └── config.ts       # Feature flags and theme
├── routes/
│   ├── +page            # Entity Types
│   ├── subscriptions/   # Subscriptions
│   ├── attributes/      # Attributes
│   ├── settings/        # Connection + database settings
│   └── api/             # Server-side API routes
└── env.ts               # Environment variable fallback
```

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

## Local Database

Attribute configurations and settings are stored in `stellio-ui.db` (SQLite) in the project root. This file is excluded from version control.

When a PostgreSQL or MySQL connection is configured in Settings, the app stores those credentials in SQLite but does not yet migrate data to the external database automatically.
