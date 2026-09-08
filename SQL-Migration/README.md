# SQL-Migration

Versioned SQL that builds the **`Amilut`** database from nothing, plus a runner
wired to `npm run db:generate`.

## Files

| File | Purpose | Runs against | As |
|------|---------|--------------|----|
| `001_create_role_and_database.sql` | Login role `Admin` + database `Amilut` | `postgres` (maintenance DB) | superuser |
| `002_create_tables.sql` | `customers` + `users` tables | `Amilut` | `Admin` (via `SET ROLE`) |
| `run-migrations.mjs` | Applies the files in order | — | — |

Every step is **idempotent** — re-running does nothing if the objects already exist.

## Usage

From the repo root:

```bash
# one-time: copy the example and set the superuser password
cp SQL-Migration/.env.example .env      # then edit PGPASSWORD

npm run db:generate
```

Or pass the password inline (no `.env` needed):

```bash
# PowerShell
$env:PGPASSWORD='...'; npm run db:generate
# bash
PGPASSWORD='...' npm run db:generate
```

## Connection settings (env vars, with defaults)

| Var | Default | Notes |
|-----|---------|-------|
| `PGHOST` | `127.0.0.1` | |
| `PGPORT` | `5434` | This machine runs PostgreSQL 17 on **5434**, not the default 5432 |
| `PGSUPERUSER` | `postgres` | |
| `PGPASSWORD` | — | **Required.** Superuser password |

The application role/database/password are declared in the SQL files
(`Admin` / `Amilut` / `Admin`). Change them there, not via env vars.

## Result

```
Amilut
├── customers (id, name, address, phone, email, isActive)
└── users     (id, customer_id → customers.id, name, role[=admin],
               title, email, last_login, isActive)
```

Connect the app with role `Admin` / password `Admin` on `127.0.0.1:5434`.
