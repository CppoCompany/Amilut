# amilut_tax

A full-stack web project for customs brokerage & freight forwarding (עמילות מכס
& שילוח) with a Hebrew RTL UI. Feature modules so far: auth, customers, orders.

## Monorepo layout

```
amilut_tax/
├── client/        Angular 21 SPA (standalone components, SCSS)
├── server/        NestJS 11 REST API (Node 22)
├── .claude/       Claude Code config for this project
│   ├── agents/    Subagent definitions (none yet — see README)
│   └── skills/    Project-scoped skills: ui-verify (browser check via Chrome DevTools MCP)
├── .mcp.json      Project MCP servers: chrome-devtools, playwright, figma (approve once with /mcp)
└── CLAUDE.md      This file
```

- **client** — Angular CLI 21.1, TypeScript 5.9, standalone components, SCSS,
  PrimeNG 21 (all widgets, see below).
  Dev server on `http://localhost:4200`; proxies `/api/*` to the server.
- **server** — NestJS 11, TypeScript 5.7. Listens on `http://localhost:3000`
  with a global `/api` route prefix.

## Running

All commands run from the repo root unless noted. `npm --prefix <app>` runs a
script inside `client/` or `server/` without `cd`.

### First-time setup

```bash
npm run install:all                  # root + server + client dependencies
cp server/.env.example server/.env   # then fill GOOGLE_CLIENT_ID and JWT_SECRET
```

### Development

```bash
npm run dev                          # client + server together (concurrently)
npm --prefix server run start:dev    # Nest watch mode        → http://localhost:3000/api
npm --prefix client start            # Angular dev server     → http://localhost:4200
```

Swagger UI is served by the running server at `http://localhost:3000/api/docs`
(raw JSON at `/api/docs-json`).

### Build, test, lint

```bash
npm run build                        # server then client
npm run test                         # server (jest) then client (vitest via ng test)
npm --prefix server run lint         # eslint --fix on the server
npm --prefix server run format       # prettier on the server
npm --prefix client run test         # client tests only (add -- --watch=false in CI)
```

### Database (PostgreSQL 18 on 127.0.0.1:5432)

Versioned SQL lives in `SQL-Migration/`. The runner applies `001` (role
`Admin` + database `Amilut`) and then every other `NNN_*.sql` file in name
order. Every file is idempotent, so re-running is always safe.

```powershell
# Normal case — role + database already exist: no superuser password needed
npm run db:generate

# Fresh PostgreSQL only — needs the postgres superuser password. Put it in the
# gitignored root .env (template: SQL-Migration/.env.example; loaded via
# node --env-file-if-exists=.env), or pass it inline:
$env:PGPASSWORD='<superuser-password>'; npm run db:generate
```

```bash
# bash
PGPASSWORD='<superuser-password>' npm run db:generate
```

Override `PGHOST`, `PGPORT`, `PGSUPERUSER` via env vars if the defaults do not
fit. In Claude Code, `/generate-db` runs the same thing. Adding a table = add a
new `SQL-Migration/NNN_<name>.sql` file with `IF NOT EXISTS` guards, then update
`SQL-Migration/README.md` and `.claude/commands/generate-db.md`.

App connection for the server: role `Admin` / password `Admin`, database
`Amilut`.

### Client UI: PrimeNG, tokens, component SCSS

- **Every widget is PrimeNG 21** (stay on 21.x — 22 needs Angular 22): buttons
  (`p-button`), inputs (`pInputText`, `pTextarea`, `p-datepicker` with
  `dataType="string"` + `dateFormat="yy-mm-dd"`), `p-select`, `p-multiselect`,
  `p-autocomplete`, `p-selectbutton` (value pickers), `p-checkbox`, `p-table`,
  `p-paginator`, `p-tag`, `p-message`, `p-dialog`, `p-menu`, `p-popover`,
  `p-breadcrumb`, `p-stepper`, `p-toast`, `p-skeleton`. Don't add hand-rolled
  widgets or `.btn`-style classes; reach for the PrimeNG component.
- Theme: `client/src/app/theme/amilut-preset.ts` (Aura retuned: petrol-teal
  primary scale, cool blue-grey neutrals, crisp radii) and
  `hebrew-translation.ts`, registered with `providePrimeNG` in
  `app.config.ts`. Change the look there first. Color roles: `--color-brand`
  (deep petrol — header band, headings), `--color-accent` (actions, focus,
  selection), status hues only for status; `--color-gold` is a sparing
  secondary accent.
- `client/src/styles.scss` holds the design tokens (`:root` — `--color-*`,
  `--radius-*`, `--shadow-*`, `--ease-*`, with legacy aliases like
  `--primary-blue`) and the app's layout classes (`.form-section`,
  `.grid-row`, `.form-group`, `.filter-bar`, `.dialog-form__*`,
  `.data-table-wrapper` / `.data-table__*` cell helpers). Keep tokens and the
  preset in sync.
- Shared wrappers in `shared/`: `app-status-tag` (status → `p-tag`
  severity), `app-data-grid` (server-paged `p-table`), `app-search-select`,
  `app-multi-select`, `app-confirm-dialog`, `app-table-skeleton`. Use
  `[rowOf]="rows"` (`shared/typed-row`) on a `p-table` body template to type
  its row variable under strict templates.
- `styleClass` lands on the host for most PrimeNG components but on the inner
  `<button>` for `p-button`; style PrimeNG internals from component SCSS with
  `:host ::ng-deep …`. `ngModel` writes to PrimeNG controls asynchronously, so
  specs `await fixture.whenStable()` before reading them; inside a reactive
  form add `[ngModelOptions]="{ standalone: true }"`.
- The workspace shell (`features/workspace/`) owns the header, sidebar,
  Ctrl+K command palette and the `<p-toast>` (`shared/toast/ToastService`:
  `success()` / `error()` / `info()` from any component). Icons are Font
  Awesome 6 (CDN link in `index.html`); PrimeNG `icon` inputs take FA classes.
- Unit tests run with `client/src/test-setup.ts` (jsdom `matchMedia` shim for
  PrimeNG), wired via `angular.json` → `test.options.setupFiles`.
- Changing `angular.json` requires restarting `ng serve`.
- Production budgets: `anyComponentStyle` errors above 8 kB — split a large
  component stylesheet with `styleUrls` rather than raising the budget.

### API contract: server → client enums and types

The server is the source of truth. Enums live in
`server/src/orders/orders.enums.ts` and DTOs under `server/src/**/dto/`; both
are exposed through Swagger. The client never hand-writes API types — it
generates them from the exported OpenAPI spec.

```bash
npm run api:generate                     # both steps below, in order
npm --prefix server run openapi:export   # Nest app → server/openapi.json (no listener; checked in)
npm --prefix client run api:generate     # openapi.json → client/src/app/api/generated/schema.ts
```

Run `npm run api:generate` after any change to a server enum or DTO, and commit
both `server/openapi.json` and the generated client file. The hand-written
`client/src/app/api/enums.ts` re-exports the enums and adds Hebrew UI labels;
adding an enum member on the server breaks the client build there until a
label is added — that is intentional.

The database CHECK constraints for enum-like columns (`status`,
`shipment_type`, `payment_terms`, `incoterm`, `destination`, `last_step` in `orders`) must
be kept in sync with the server enums by hand.

## Authentication

Login page with user name (= email) and password. The email must match an
active row in the `users` table (seeded by `SQL-Migration/004_seed_admin_user.sql`);
**the password is not verified yet** — password checks are a planned
follow-up. The server issues an app JWT (`@nestjs/jwt`) whose `sub` is the
numeric `users.id`, so protected endpoints can attribute writes (orders stamp
`handler_user_id` from it). The client keeps the session in a signal-based
`AuthService` (`client/src/app/core/auth/`), attaches it via a functional
interceptor, and protects routes with `authGuard` / `guestGuard`.

**Every API route requires a bearer token.** `JwtAuthGuard` is registered
globally (`APP_GUARD` in `server/src/app.module.ts`); opt a route out with
`@Public()` from `server/src/auth/public.decorator.ts` (only
`POST /api/auth/login` and the `GET /api` liveness check are public). Use
`@CurrentUser()` to read the `JwtPayload` (`sub`, `email`, `name`, `role`) in
a handler.

Setup: `server/.env` (gitignored; template in `server/.env.example`) needs
`JWT_SECRET` (server refuses to start without it) and the PostgreSQL settings
(`PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`, defaulting to
the migration's `Admin` / `Admin` / `Amilut`); optional `ALLOWED_EMAILS` /
`ALLOWED_DOMAIN` restrict who can sign in.

Endpoints: `POST /api/auth/login {email, password?}` → `{accessToken, user}`;
`GET /api/auth/me` (Bearer) → `{user}`.

## Database access from the server

`server/src/database/` exposes a global `DatabaseService` wrapping a `pg`
pool: `query<T>(sql, params)`, `queryOne<T>(sql, params)`, `transaction(fn)`.
Feature services write parameterised SQL directly (no ORM); map rows to
response DTO classes explicitly so Swagger — and therefore the generated
client types — stay accurate. The server fails fast at startup if PostgreSQL
is unreachable.

## Conventions

- Angular: standalone components, `inject()`, typed reactive forms, signals for
  local state. Keep components thin; put logic in services.
- Nest: feature modules, DTOs validated with `class-validator`, services hold
  logic, controllers stay thin.
- Shared API route prefix is `/api`; the Angular dev proxy forwards it.

## Notes for Claude

- Do **not** use the `swing-trading-us-stocks` skill in this project.
- Confirm with the user before introducing business logic for a screen that
  has not been specified yet.
- After changing anything under `client/`, run the `ui-verify` skill: it opens
  the app in Chrome through the `chrome-devtools` MCP server declared in
  `.mcp.json` and reports PASS/FAIL per screen. Requires `npm run dev` and a
  reachable PostgreSQL; the seeded login is in
  `SQL-Migration/004_seed_admin_user.sql`.
