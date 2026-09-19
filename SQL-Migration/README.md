# SQL-Migration

Versioned SQL that builds the **`Amilut`** database from nothing, plus a runner
wired to `npm run db:generate`.

## Files

| File | Purpose | Runs against | As |
|------|---------|--------------|----|
| `001_create_role_and_database.sql` | Login role `Admin` + database `Amilut` | `postgres` (maintenance DB) | superuser |
| `002_create_tables.sql` | `customers` + `users` tables | `Amilut` | `Admin` (via `SET ROLE`) |
| `003_create_orders.sql` | `orders` table (workspace → order screen) | `Amilut` | `Admin` (via `SET ROLE`) |
| `004_seed_admin_user.sql` | Seeds the initial admin row in `users` | `Amilut` | `Admin` (via `SET ROLE`) |
| `005_create_shipments.sql` | `shipments` table (workspace → shipment/file screen), 1:1 with `orders` | `Amilut` | `Admin` (via `SET ROLE`) |
| `006_rename_shipments_to_order_account.sql` | Renames `shipments` → `order_account` (and cleans up the empty stray 005 would otherwise recreate on re-run) | `Amilut` | `Admin` (via `SET ROLE`) |
| `007_rename_and_bump_order_account_sequence.sql` | Renames `shipments_id_seq` → `order_account_id_seq` and starts file numbers at 1000 | `Amilut` | `Admin` (via `SET ROLE`) |
| `008_seed_user_erez_nakar.sql` | Seeds an additional user row (Erez Nakar) in `users` | `Amilut` | `Admin` (via `SET ROLE`) |
| `run-migrations.mjs` | Applies `001`, then every other `NNN_*.sql` in name order | — | — |

Every step is **idempotent** — re-running does nothing if the objects already exist.

## Usage

From the repo root:

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
| `PGPORT` | `5432` | This machine runs PostgreSQL 18 on the standard **5432** port |
| `PGSUPERUSER` | `postgres` | |
| `PGPASSWORD` | — | **Required.** Superuser password |

The application role/database/password are declared in the SQL files
(`Admin` / `Amilut` / `Admin`). Change them there, not via env vars.

## Result

```
Amilut
├── customers (id, name, address, phone, email, isActive)
├── users     (id, customer_id → customers.id, name, role[=admin],
│              title, email, last_login, isActive)
├── orders    (id[seq from 1000], customer_id → customers.id,
│              handler_user_id → users.id, created_at,
│              status, shipment_type, payment_terms, incoterm, destination,
│              factory_ready_date, factory_pickup_date, departure_date, eta_date,
│              shipping_line, voyage_number, airline, flight_number,
│              updated_at, isActive)
└── order_account (id, order_id → orders.id [UNIQUE, 1:1, ON DELETE CASCADE],
               bill_of_lading_number, document_type, bl_issue_date,
               forwarder_name, voyage_flight_number, vessel_name,
               port_of_loading, port_of_discharge, manifest_number,
               transaction_number, shipper_name, shipper_address,
               consignee_name, consignee_address, notify_party,
               cargo_description, package_count, package_unit,
               gross_weight_kg, net_weight_kg, volume_cbm, hs_code,
               dangerous_goods, dangerous_goods_imo_class,
               container_number, container_type, container_seal_number,
               created_at, updated_at)
               -- created as `shipments` by 005, renamed by 006

Enum-like columns (`status`, `shipment_type`, `payment_terms`, `incoterm`,
`destination` in `orders`; `document_type` in `order_account`)
store English codes guarded by CHECK constraints; the source of truth for
`orders`' enums is `server/src/orders/orders.enums.ts`.
```

Connect the app with role `Admin` / password `Admin` on `127.0.0.1:5432`.
