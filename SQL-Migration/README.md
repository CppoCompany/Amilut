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
| `017_import_account_files_to_mbl.sql` | Re-points `import_account_files.account_id` from `order_account` to `mbl(id)` — paperwork is now filed under the MBL case ("מספר תיק"), since 016 left no `order_account` rows to file under | `Amilut` | `Admin` (via `SET ROLE`) |
| `018_mbl_handler_and_status.sql` | Adds `mbl.handler_user_id` (→ `users.id`, the user who opened the case — drives "התיקים שלי") and `mbl.status` (`open`/`in_release`/`released`/`closed`, default `open` — drives "תיקים בהתרה"), with indexes | `Amilut` | `Admin` (via `SET ROLE`) |
| `019_create_customs_clearance_files.sql` | `customs_clearance_files` table ("תיק סליקת מכס"): server-generated sequential `file_number` (`CCF1000`, ...), optional 1:1 `shipment_file_id` → `mbl(id)` (UNIQUE, nullable), `status`, `created_by` | `Amilut` | `Admin` (via `SET ROLE`) |
| `020_create_notifications.sql` | `notifications` table — minimal in-app notification system (recipient, message, optional `related_ccf_id` → `customs_clearance_files(id)`, read/unread), first used by the CCF feature | `Amilut` | `Admin` (via `SET ROLE`) |
| `021_import_account_files_order_or_ccf.sql` | Re-points `import_account_files` from `mbl` (`account_id`) to either `orders.id` (`order_id`) or `customs_clearance_files.id` (`ccf_id`), exactly one via CHECK; truncates existing dev rows (no valid backfill target) | `Amilut` | `Admin` (via `SET ROLE`) |
| `022_orders_last_step.sql` | Adds `orders.last_step` (`customer`/`shipment`/`schedule`/`documents`, default `customer`) — the furthest tab of the order form reached, so a saved partial order resumes there | `Amilut` | `Admin` (via `SET ROLE`) |
| `023_notifications_actor.sql` | Adds `notifications.actor_user_id` (→ `users.id`, nullable, `ON DELETE SET NULL`) — the user whose action triggered the notification | `Amilut` | `Admin` (via `SET ROLE`) |
| `024_create_line_item_notes.sql` | `line_item_notes` table — notes written on the classification screen against one supplier-invoice line (`file_id` → `import_account_files.id` + `line_index`), with author and timestamp | `Amilut` | `Admin` (via `SET ROLE`) |
| `025_air_reference_tables.sql` | Air lookups: `airport` (seeded with TLV, mapped to `orders.destination = 'ben_gurion'`), `cargo_terminal` (seeded with Maman / Swissport by name — `code` left NULL until verified), `air_weight_rule` (default row: divisor 6000, round up to 0.5 kg; no carrier rows) | `Amilut` | `Admin` (via `SET ROLE`) |
| `026_air_master_house.sql` | Air columns on `mbl` (MAWB: `air_method`, airports, terminal, pieces, calculated/approved chargeable weight + rule snapshot + override marker, SHC codes) and `hbl` (HAWB: `shipping_type`, `is_master_mirror`, `handler_user_id`, pieces, weights, SHC); `hbl.mbl_id`/`sequence_number` become nullable (sea still requires a master via CHECK); air-only unique MAWB/HAWB numbers; `mbl_flight_leg`, `hbl_piece_dimension` | `Amilut` | `Admin` (via `SET ROLE`) |
| `027_air_status_arrivals_audit.sql` | Status tracks `mbl.shipment_status(+_source)`, `hbl.document_status`; append-only `status_history`, `hbl_master_link_history`, `audit_log`; `hbl_arrival` (void-only updates); triggers enforcing it | `Amilut` | `Admin` (via `SET ROLE`) |
| `028_ccf_per_house.sql` | `customs_clearance_files.hbl_id` (UNIQUE — one CCF per air HAWB, at most one of `shipment_file_id`/`hbl_id`) and `clearance_status` | `Amilut` | `Admin` (via `SET ROLE`) |
| `029_fix_air_test_orders_destination.sql` | Moves the two identified air test orders (1001, 1003 — matched on all their fingerprints) from `ashdod` to `ben_gurion`; only reports any other air order with a non-airport destination | `Amilut` | `Admin` (via `SET ROLE`) |
| `run-migrations.mjs` | Applies `001`, then every other `NNN_*.sql` in name order | — | — |
| `reset-superuser-password.ps1` | Recovery tool: resets a lost `postgres` superuser password on this machine (elevated PowerShell; `-SaveToEnv` writes it into the root `.env`) | — | Windows admin |

Every step is **idempotent** — re-running does nothing if the objects already exist.

## Usage

From the repo root:

```bash
# Database already exists (the normal case) — no superuser password needed.
# The runner connects as the app role `Admin`, skips 001 and applies 002+.
npm run db:generate

# First run on a fresh PostgreSQL (001 must create the role + database):
# either put PGPASSWORD in the gitignored root .env (template: .env.example here)
# — npm run db:generate loads it via node --env-file-if-exists=.env — or:
$env:PGPASSWORD='...'; npm run db:generate   # PowerShell
PGPASSWORD='...' npm run db:generate         # bash
```

## Connection settings (env vars, with defaults)

| Var | Default | Notes |
|-----|---------|-------|
| `PGHOST` | `127.0.0.1` | |
| `PGPORT` | `5432` | This machine runs PostgreSQL 18 on the standard **5432** port |
| `PGSUPERUSER` | `postgres` | Used only when `PGPASSWORD` is set |
| `PGPASSWORD` | — | Superuser password. **Required only for the first run** (step 001). When unset, the runner falls back to the app role |
| `PGAPPPASSWORD` | `Admin` | Password of the app role, used by the fallback. Must match `001` |

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
│              last_step [022], updated_at, isActive)
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
├── import_account_files (id, order_id → orders.id [nullable, ON DELETE
│              CASCADE], ccf_id → customs_clearance_files.id [nullable, ON
│              DELETE CASCADE] — exactly one set, CHECK (021; was
│              account_id → mbl.id from 017 until then),
│              data [JSONB: documentType, name, size, mimeType, relativePath,
│              uploadedAt; for SUPPLIER_INVOICE also lineItems[] — each with
│              item, description, quantity, price, total and, once the
│              classification screen saved it, classification {tradeAgreement,
│              classificationCode, approvals[], licenses[], countryId → countries.id}],
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
│              carrier_name, handler_user_id → users.id [018, the user who
│              opened the case], status[open|in_release|released|closed,
│              default open — 018], created_at, updated_at)
│              -- 015: new parallel workflow, does NOT replace order_account
├── mbl_container (id, mbl_id → mbl.id [ON DELETE CASCADE], container_number,
│              container_seal_number, cargo_description, gross_weight_kg,
│              volume_cbm, created_at)
│              -- 015: only populated for mbl.sea_method = 'groupage_fcl'
├── hbl       (id, mbl_id → mbl.id [ON DELETE CASCADE], container_id →
│              mbl_container.id [groupage_fcl only, ON DELETE SET NULL],
│              customer_id → customers.id, sequence_number [the "Internal
│              B/L {N}" ordinal within its MBL, UNIQUE per mbl_id],
│              ibl_number [system-generated, e.g. "IB-001"], hbl_number
│              [free text, external house B/L number], shipper_name/address,
│              consignee_name/address, notify_party_name/address — all
│              HBL-specific, NOT inherited from the MBL — cargo_description,
│              quantity, gross_weight_kg, volume_cbm, remarks, created_at,
│              updated_at)
│              -- 015: the unit orders attach to via the new orders.hbl_id
│              -- (parallel to orders.case_id → order_account.id)
├── customs_clearance_files (id, file_number [UNIQUE, e.g. "CCF1000" — from
│              customs_clearance_files_file_number_seq, server-generated only],
│              shipment_file_id → mbl.id [nullable, UNIQUE, ON DELETE SET
│              NULL — at most one CCF per shipping case], status[open|closed,
│              default open], created_by → users.id, created_at, updated_at)
│              -- 019: "תיק סליקת מכס" — can exist standalone or linked 1:1
│              -- to an mbl shipping case
├── notifications (id, recipient_user_id → users.id [ON DELETE CASCADE],
│              message, related_ccf_id → customs_clearance_files.id
│              [nullable, ON DELETE CASCADE], is_read[default false],
│              actor_user_id → users.id [023, nullable, ON DELETE SET
│              NULL], created_at)
│              -- 020: minimal in-app notification system, first used by the
│              -- CCF feature
├── line_item_notes (id, file_id → import_account_files.id [ON DELETE
│              CASCADE], line_index [position in data.lineItems, >= 0],
│              body, created_by → users.id [nullable, ON DELETE SET NULL],
│              created_at)
│              -- 024: notes popup of the classification ("סיווג") table rows
│
│   Air freight (025–028). `mbl` = MAWB and `hbl` = HAWB when shipping_type = 'air'
│   (columns listed in 026/027); a Direct MAWB has one hidden house with
│   is_master_mirror = true. Air HAWBs may have mbl_id NULL (awaiting a MAWB).
├── airport (code [IATA, PK], name_he, name_en, is_import_destination,
│              order_destination [UNIQUE, ↔ orders.destination], is_active)
├── cargo_terminal (id, airport_code → airport.code, code [nullable, UNIQUE —
│              unverified], name_he, name_en, is_active, sort_order)
├── air_weight_rule (id, airline_prefix [3 digits, NULL = default, UNIQUE],
│              volumetric_divisor, rounding_step_kg, rounding_mode[up|nearest])
├── mbl_flight_leg (id, mbl_id → mbl.id [CASCADE], leg_no, flight_number,
│              from_airport, to_airport, etd, eta, atd, ata)
├── hbl_piece_dimension (id, hbl_id → hbl.id [CASCADE], piece_count,
│              length_cm, width_cm, height_cm)
├── hbl_arrival (id, hbl_id → hbl.id [RESTRICT], flight_number, arrival_date,
│              pieces_received, notes, is_override, override_reason,
│              created_by, created_at, voided_at, voided_by, void_reason)
│              -- rows are never deleted; one-time void only (trigger)
├── status_history (id, entity_type[mbl|hbl|ccf], entity_id, track
│              [shipment|document|clearance], from_value, to_value,
│              source[manual|auto|correction], reason, changed_by, changed_at)
├── hbl_master_link_history (id, hbl_id, previous_mbl_id, new_mbl_id,
│              is_correction, reason, changed_by, changed_at)
└── audit_log (id, entity_type, entity_id, action, before_value, after_value,
               reason, changed_by, changed_at)
               -- the three history tables are append-only (triggers)

Enum-like columns (`status`, `shipment_type`, `payment_terms`, `incoterm`,
`destination`, `last_step` in `orders`; `document_type` in `order_account`; `shipping_type`,
`sea_method`, `freight_terms`, `status`, `air_method`, `shipment_status`,
`shipment_status_source` in `mbl`; `shipping_type`, `document_status` in `hbl`;
`status`, `clearance_status` in `customs_clearance_files`; the tracks / sources
in `status_history`) store English codes guarded by CHECK constraints;
the source of truth for `orders`' enums is `server/src/orders/orders.enums.ts`,
for `mbl`'s is `server/src/mbl/mbl.enums.ts` + `server/src/air/air.enums.ts`,
for the status tracks `server/src/status-tracks/status-tracks.enums.ts`, and
for `customs_clearance_files`' `status` is `server/src/ccf/ccf.enums.ts`.
```

Connect the app with role `Admin` / password `Admin` on `127.0.0.1:5432`.
