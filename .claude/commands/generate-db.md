---
description: Generate the Amilut database by running the SQL migration files directly (no npm)
allowed-tools: Bash, Read, Glob
---

# /generate-db

Build (or update) the **`Amilut`** PostgreSQL database by applying the versioned
SQL migration files in `SQL-Migration/`, **in order**. Do NOT use `npm run` —
invoke the runner directly.

## Steps

1. **Confirm the migration files exist.** They live in `SQL-Migration/`:
   - `001_create_role_and_database.sql` — role `Admin` + database `Amilut`
   - `002_create_tables.sql` — `customers` + `users` tables
   - `003_create_orders.sql` — `orders` table
   - `004_seed_admin_user.sql` — initial admin user row
   - `005_create_shipments.sql` — `shipments` table (1:1 with `orders`)
   - `006_rename_shipments_to_order_account.sql` — renames it to `order_account`
   If the folder or files are missing, stop and tell Barak.

2. **Determine the superuser password.** The runner needs the `postgres`
   superuser password via the `PGPASSWORD` env var. If it is not already set in
   the environment, ask Barak for it (do NOT hardcode it in any file). Other
   connection settings default correctly for this machine:
   `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGSUPERUSER=postgres`.

3. **Run the migration runner directly** (not through npm). From the repo root,
   in PowerShell:

   ```powershell
   $env:PGPASSWORD='<superuser-password>'; node SQL-Migration/run-migrations.mjs
   ```

   The runner applies `001`, then every other `NNN_*.sql` file in name order (`002`, `003`, …). Every step is idempotent, so it is safe
   to re-run — existing objects are skipped.

4. **Verify and report.** Confirm success from the runner output. Then verify by
   logging in as the app role and listing the tables:

   ```powershell
   $env:PGPASSWORD='Admin'; & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U Admin -d Amilut -h 127.0.0.1 -p 5432 -c "\dt"
   ```

   Report to Barak: which objects were created vs. already existed, and confirm
   `Admin`/`Admin` can connect on `127.0.0.1:5432`.

## Notes

- Application credentials are defined in the SQL files: role `Admin` /
  password `Admin`, database `Amilut`. Change them there, not here.
- If you need a clean rebuild, drop `Amilut` and the `Admin` role first (as
  superuser), then re-run this command. Terminate open sessions to `Amilut`
  before dropping if PostgreSQL reports the database is in use.
