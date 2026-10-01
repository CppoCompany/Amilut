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
| `009_add_supplier_name_to_orders.sql` | Adds `supplier_name` to `orders` (superseded by 010) | `Amilut` | `Admin` (via `SET ROLE`) |
| `010_create_suppliers_and_link_orders.sql` | `suppliers` table (mirrors `customers`) + `orders.supplier_id` FK, replacing `supplier_name` | `Amilut` | `Admin` (via `SET ROLE`) |
| `011_add_contact_fields_to_customers.sql` | Adds `company_reg_number` (ח״פ), `contact_name`, `contact_phone` (איש קשר) to `customers` | `Amilut` | `Admin` (via `SET ROLE`) |
| `012_orders_case_id.sql` | Flips case↔order to `orders.case_id` (1 case → many orders), replacing `order_account.order_id` | `Amilut` | `Admin` (via `SET ROLE`) |
| `013_create_import_account_files.sql` | `import_account_files` table (documents uploaded to a case), many → 1 `order_account`, descriptor in JSONB | `Amilut` | `Admin` (via `SET ROLE`) |
| `014_create_countries.sql` | `countries` lookup table (Hebrew name + ISO 3166-1 alpha-2 `key`) seeded with all 242 countries | `Amilut` | `Admin` (via `SET ROLE`) |
| `015_create_mbl_hbl.sql` | New MBL/HBL shipping-case workflow: `mbl`, `mbl_container`, `hbl` tables + `orders.hbl_id` FK — parallel to (not replacing) `order_account`/`orders.case_id` | `Amilut` | `Admin` (via `SET ROLE`) |
| `016_remove_legacy_shipment_cases.sql` | Deletes all rows from `order_account` — the old shipping-case workflow (and its `ShipmentsModule`/`ShipmentScreen`) has been fully replaced by MBL/HBL; the table/column themselves are left in place, just unused | `Amilut` | `Admin` (via `SET ROLE`) |
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
├── customers (id, name, address, phone, email,
│              company_reg_number, contact_name, contact_phone, isActive)
├── suppliers (id, name, address, phone, email, isActive)
├── users     (id, customer_id → customers.id, name, role[=admin],
│              title, email, last_login, isActive)
├── orders    (id[seq from 1000], customer_id → customers.id,
│              handler_user_id → users.id, supplier_id → suppliers.id,
│              case_id → order_account.id [nullable, ON DELETE SET NULL],
│              hbl_id → hbl.id [nullable, ON DELETE SET NULL — 015, the new
│              MBL/HBL flow's equivalent of case_id], created_at,
│              status, shipment_type, payment_terms, incoterm, destination,
│              factory_ready_date, factory_pickup_date, departure_date, eta_date,
│              shipping_line, voyage_number, airline, flight_number,
│              updated_at, isActive)
├── order_account (id [1 case → many orders.case_id],
│              bill_of_lading_number, document_type, bl_issue_date,
│              forwarder_name, voyage_flight_number, vessel_name,
│              port_of_loading, port_of_discharge, manifest_number,
│              transaction_number, shipper_name, shipper_address,
│              consignee_name, consignee_address, notify_party,
│              cargo_description, package_count, package_unit,
│              gross_weight_kg, net_weight_kg, volume_cbm, hs_code,
│              dangerous_goods, dangerous_goods_imo_class,
│              container_number, container_type, container_seal_number,
│              created_at, updated_at)
│              -- created as `shipments` by 005, renamed by 006;
│              -- was 1:1 with orders.order_id until 012 flipped it to orders.case_id
├── import_account_files (id, account_id → order_account.id [ON DELETE CASCADE],
│              data [JSONB: documentType, name, size, mimeType, relativePath,
│              uploadedAt; for SUPPLIER_INVOICE also lineItems[] — each with
│              item, description, quantity, price, total and, once the
│              classification screen saved it, classification {tradeAgreement,
│              classificationCode, approvals[], countryId → countries.id}],
│              created_at)
├── countries (id, name [Hebrew], key [ISO 3166-1 alpha-2, UNIQUE])
│              -- lookup table, seeded by 014 with 242 rows
├── mbl       (id, shipping_type[sea|air], sea_method[fcl_fcl|fcl_lcl|lcl_lcl|
│              groupage_fcl, NULL iff air], customer_id → customers.id
│              [fcl_lcl only — shared by all its HBLs], mbl_number,
│              booking_number, vessel_name, voyage_number, port_of_loading,
│              port_of_discharge, final_destination, shipper_name/address,
│              consignee_name/address, notify_party_name/address,
│              container_number, container_seal_number [single-container
│              methods only — groupage_fcl uses mbl_container instead],
│              cargo_description, gross_weight_kg, volume_cbm,
│              freight_terms[prepaid|collect], receipt_delivery_type [free
│              text, e.g. "CY/CFS"], place_of_issue, date_of_issue,
│              carrier_name, created_at, updated_at)
│              -- 015: new parallel workflow, does NOT replace order_account
├── mbl_container (id, mbl_id → mbl.id [ON DELETE CASCADE], container_number,
│              container_seal_number, cargo_description, gross_weight_kg,
│              volume_cbm, created_at)
│              -- 015: only populated for mbl.sea_method = 'groupage_fcl'
└── hbl       (id, mbl_id → mbl.id [ON DELETE CASCADE], container_id →
               mbl_container.id [groupage_fcl only, ON DELETE SET NULL],
               customer_id → customers.id, sequence_number [the "Internal
               B/L {N}" ordinal within its MBL, UNIQUE per mbl_id],
               ibl_number [system-generated, e.g. "IB-001"], hbl_number
               [free text, external house B/L number], shipper_name/address,
               consignee_name/address, notify_party_name/address — all
               HBL-specific, NOT inherited from the MBL — cargo_description,
               quantity, gross_weight_kg, volume_cbm, remarks, created_at,
               updated_at)
               -- 015: the unit orders attach to via the new orders.hbl_id
               -- (parallel to orders.case_id → order_account.id)

Enum-like columns (`status`, `shipment_type`, `payment_terms`, `incoterm`,
`destination` in `orders`; `document_type` in `order_account`; `shipping_type`,
`sea_method`, `freight_terms` in `mbl`) store English codes guarded by CHECK
constraints; the source of truth for `orders`' enums is
`server/src/orders/orders.enums.ts`.
```

Connect the app with role `Admin` / password `Admin` on `127.0.0.1:5432`.
