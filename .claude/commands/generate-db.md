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
   - `007_rename_and_bump_order_account_sequence.sql` — renames its id sequence and starts file numbers at 1000
   - `008_seed_user_erez_nakar.sql` — seeds an additional user row
   - `009_add_supplier_name_to_orders.sql` — adds `supplier_name` to `orders` (superseded by 010)
   - `010_create_suppliers_and_link_orders.sql` — `suppliers` table (mirrors `customers`) + `orders.supplier_id` FK
   - `011_add_contact_fields_to_customers.sql` — adds `company_reg_number`, `contact_name`, `contact_phone` to `customers`
   - `012_orders_case_id.sql` — flips case↔order to `orders.case_id` (1 case → many orders), replacing `order_account.order_id`
   - `013_create_import_account_files.sql` — `import_account_files` table (documents uploaded to a case, JSONB descriptor), many → 1 `order_account`
   - `014_create_countries.sql` — `countries` lookup table (Hebrew `name` + ISO alpha-2 `key`), seeded with 242 countries
   - `015_create_mbl_hbl.sql` — new MBL/HBL shipping-case workflow (`mbl`, `mbl_container`, `hbl` tables + `orders.hbl_id`), parallel to the existing `order_account`/`orders.case_id` flow
   - `016_remove_legacy_shipment_cases.sql` — deletes all rows from `order_account`; the old shipping-case workflow (`ShipmentsModule`/`ShipmentScreen`) has been removed in favor of MBL/HBL
   - `017_import_account_files_to_mbl.sql` — re-points `import_account_files.account_id` from `order_account` to `mbl(id)`; paperwork is filed under the MBL case
   If the folder or files are missing, stop and tell Barak.

2. **Decide whether the superuser password is needed.** It is needed **only
   when the `Admin` role or the `Amilut` database does not exist yet** (step
   001). Check first:

   ```powershell
   $env:PGPASSWORD='Admin'; & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U Admin -d Amilut -h 127.0.0.1 -p 5432 -w -c "select 1"
   ```

   - If that succeeds → go to step 3 **without** a superuser password. The
     runner connects as `Admin`, skips 001 and applies 002+ (all objects are
     owned by `Admin`, so no superuser is involved).
   - If it fails (fresh PostgreSQL) → the runner needs the `postgres`
     superuser password via `PGPASSWORD`. It is read from the gitignored root
     `.env` (template: `SQL-Migration/.env.example`). If the root `.env` has no
     `PGPASSWORD` line and it is not set in the environment, ask Barak for it
     (do NOT hardcode it in any tracked file). Other connection settings
     default correctly for this machine:
     `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGSUPERUSER=postgres`.

3. **Run the migration runner directly** (not through npm). From the repo root,
   in PowerShell. The `--env-file-if-exists=.env` flag loads the root `.env`:

   ```powershell
   # Normal case — role + database already exist (or PGPASSWORD is in .env):
   node --env-file-if-exists=.env SQL-Migration/run-migrations.mjs

   # Fresh PostgreSQL with no PGPASSWORD in .env:
   $env:PGPASSWORD='<superuser-password>'; node --env-file-if-exists=.env SQL-Migration/run-migrations.mjs
   ```

   The runner applies `001` (superuser path only), then every other `NNN_*.sql`
   file in name order (`002`, `003`, …). Every step is idempotent, so it is safe
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
