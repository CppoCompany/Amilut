/**
 * run-migrations.mjs
 * -----------------------------------------------------------------------------
 * Generates the `Amilut` database from scratch by applying the versioned SQL
 * files in this folder, in order:
 *
 *   001_create_role_and_database.sql   -> role `Admin` + database `Amilut`
 *   002_create_tables.sql              -> `customers`, `users` tables
 *   003_create_orders.sql              -> `orders` table
 *   004_seed_admin_user.sql            -> initial admin row in `users`
 *   NNN_*.sql                          -> any later file, applied in name order
 *
 * Every step is idempotent, so re-running is safe.
 *
 * Connection settings come from environment variables (with sensible defaults
 * for this machine). A superuser connection is required because the first step
 * creates a role and a database.
 *
 *   PGHOST        default 127.0.0.1
 *   PGPORT        default 5432            (this box runs PG 18 on the standard 5432 port)
 *   PGSUPERUSER   default postgres
 *   PGPASSWORD    REQUIRED — superuser password (no default)
 *
 * Usage (from repo root):
 *   PGPASSWORD=... npm run db:generate          (bash)
 *   $env:PGPASSWORD='...'; npm run db:generate  (PowerShell)
 * -----------------------------------------------------------------------------
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const HERE = dirname(fileURLToPath(import.meta.url));

const cfg = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGSUPERUSER || 'postgres',
  password: process.env.PGPASSWORD,
};

const APP_ROLE = 'Admin'; // objects created by step 002 are owned by this role

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

async function readSql(file) {
  return readFile(join(HERE, file), 'utf8');
}

/**
 * Every `NNN_*.sql` file in this folder except 001, sorted by name so the
 * numeric prefix defines the order. These all run against the app database.
 */
async function listLaterMigrations() {
  const files = (await readdir(HERE))
    .filter((f) => /^\d{3}_.*\.sql$/i.test(f) && !f.startsWith('001_'))
    .sort();
  if (files.length === 0) fail('No migration files found after 001.');
  return files;
}

/**
 * Splits 001 into: (a) everything before the create-database marker (the role
 * DDL) and (b) the CREATE DATABASE statement between the markers, plus the
 * database name parsed out of it.
 */
function parseStep001(sql) {
  const start = sql.indexOf('-- @create-database');
  const end = sql.indexOf('-- @end-create-database');
  if (start === -1 || end === -1) {
    fail('001 file is missing the @create-database markers.');
  }
  const rolePart = sql.slice(0, start).trim();
  const createDbStmt = sql
    .slice(start + '-- @create-database'.length, end)
    .trim();
  const m = createDbStmt.match(/CREATE DATABASE\s+"([^"]+)"/i);
  if (!m) fail('Could not find CREATE DATABASE "<name>" in 001.');
  return { rolePart, createDbStmt, dbName: m[1] };
}

async function main() {
  if (!cfg.password) {
    fail(
      'PGSUPERUSER password not set. Provide the superuser password via the ' +
        'PGPASSWORD environment variable, e.g.\n' +
        '      PGPASSWORD=yourpass npm run db:generate',
    );
  }

  const step001 = parseStep001(await readSql('001_create_role_and_database.sql'));
  const laterFiles = await listLaterMigrations();

  console.log(
    `\n  Amilut DB migration → ${cfg.user}@${cfg.host}:${cfg.port}\n`,
  );

  // ---- Step 001: role + database (on the maintenance DB, as superuser) ------
  const admin = new Client({ ...cfg, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(step001.rolePart);
    console.log(`  ✓ role "${APP_ROLE}" ensured`);

    const { rowCount } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [step001.dbName],
    );
    if (rowCount === 0) {
      await admin.query(step001.createDbStmt); // CREATE DATABASE (no txn)
      console.log(`  ✓ database "${step001.dbName}" created`);
    } else {
      console.log(`  • database "${step001.dbName}" already exists — skipped`);
    }
  } finally {
    await admin.end();
  }

  // ---- Steps 002+: schema files (on the app DB; SET ROLE so Admin owns them)
  const app = new Client({ ...cfg, database: step001.dbName });
  await app.connect();
  try {
    await app.query(`SET ROLE "${APP_ROLE}"`);
    for (const file of laterFiles) {
      await app.query(await readSql(file));
      console.log(`  ✓ ${file} applied (objects owned by "${APP_ROLE}")`);
    }
  } finally {
    await app.end();
  }

  console.log(`\n  Done. Database "${step001.dbName}" is ready.\n`);
}

main().catch((err) => fail(err.message || String(err)));
