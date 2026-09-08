# amilut_tax

A full-stack web project. **Scaffold stage** — framework structure is in place;
the application domain and feature modules are not decided yet.

## Monorepo layout

```
amilut_tax/
├── client/        Angular 21 SPA (standalone components, SCSS)
├── server/        NestJS 11 REST API (Node 22)
├── .claude/       Claude Code config for this project
│   ├── agents/    Subagent definitions (none yet — see README)
│   └── skills/    Project-scoped skills (none yet — see README)
└── CLAUDE.md      This file
```

- **client** — Angular CLI 21.1, TypeScript 5.9, standalone components, SCSS.
  Dev server on `http://localhost:4200`; proxies `/api/*` to the server.
- **server** — NestJS 11, TypeScript 5.7. Listens on `http://localhost:3000`
  with a global `/api` route prefix.

## Running

From the repo root:

```bash
npm install     # root tooling only (concurrently)
npm run dev     # client + server together
```

Per app:

```bash
npm --prefix server run start:dev    # Nest watch mode  → :3000
npm --prefix client start            # Angular dev      → :4200
```

## Conventions

- Angular: standalone components, `inject()`, typed reactive forms, signals for
  local state. Keep components thin; put logic in services.
- Nest: feature modules, DTOs validated with `class-validator`, services hold
  logic, controllers stay thin.
- Shared API route prefix is `/api`; the Angular dev proxy forwards it.

## Notes for Claude

- Do **not** use the `swing-trading-us-stocks` skill in this project.
- This is a generic scaffold — confirm the domain with the user before
  introducing business logic.
