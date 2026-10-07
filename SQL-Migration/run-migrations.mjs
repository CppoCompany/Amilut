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
 * for this machine). A superuser connection is needed only for the first step
 * (001 creates the role and the database). Once those exist, every later step
 * runs as the app role `Admin`, so the superuser password becomes optional:
 * when PGPASSWORD is not set the runner connects as `Admin`/`Admin` to the app
 * database, skips 001, and applies 002+ directly.
 *
 *   PGHOST        default 127.0.0.1
 *   PGPORT        default 5432            (this box runs PG 18 on the standard 5432 port)
 *   PGSUPERUSER   default postgres
 *   PGPASSWORD    superuser password — required only until 001 has been applied
 *   PGAPPPASSWORD default Admin           (password of the app role, as declared in 001)
 *
 * Usage (from repo root):
 *   npm run db:generate                         (DB already exists — no superuser needed)
 *   PGPASSWORD=... npm run db:generate          (first run, bash)
 *   $env:PGPASSWORD='...'; npm run db:generate  (first run, PowerShell)
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
const APP_PASSWORD = process.env.PGAPPPASSWORD || 'Admin'; // as declared in 001

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

/**
 * Superuser path: apply 001 on the maintenance DB, then open a superuser
 * connection to the app DB with SET ROLE so later objects are owned by Admin.
 */
async function connectAsSuperuser(step001) {
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

  const app = new Client({ ...cfg, database: step001.dbName });
  await app.connect();
  await app.query(`SET ROLE "${APP_ROLE}"`);
  return app;
}

/**
 * App-role path (no PGPASSWORD): the role and database must already exist.
 * Steps 002+ only ever create/alter objects owned by Admin, so Admin itself
 * can apply them — no superuser needed.
 */
async function connectAsAppRole(step001) {
  const app = new Client({
    host: cfg.host,
    port: cfg.port,
    user: APP_ROLE,
    password: APP_PASSWORD,
    database: step001.dbName,
  });
  try {
    await app.connect();
  } catch (err) {
    fail(
      `PGPASSWORD is not set, and connecting as "${APP_ROLE}" to ` +
        `"${step001.dbName}" on ${cfg.host}:${cfg.port} failed:\n` +
        `      ${err.message}\n\n` +
        '    The superuser password is only needed while the role/database do ' +
        'not exist yet (step 001). For a first run provide it via PGPASSWORD, e.g.\n' +
        '      PGPASSWORD=yourpass npm run db:generate',
    );
  }
  console.log(
    `\n  Amilut DB migration → ${APP_ROLE}@${cfg.host}:${cfg.port} ` +
      `(no superuser password given)\n`,
  );
  console.log(
    `  • role "${APP_ROLE}" and database "${step001.dbName}" already exist — step 001 skipped`,
  );
  return app;
}

async function main() {
  const step001 = parseStep001(await readSql('001_create_role_and_database.sql'));
  const laterFiles = await listLaterMigrations();

  // ---- Step 001 + connection for the rest ------------------------------------
  const app = cfg.password
    ? await connectAsSuperuser(step001)
    : await connectAsAppRole(step001);

  // ---- Steps 002+: schema files (on the app DB, as/owned by Admin) ----------
  try {
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
