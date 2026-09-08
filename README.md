# amilut_tax

Angular 21 + NestJS 11 monorepo scaffold.

| App        | Stack                          | Dev URL                 |
| ---------- | ------------------------------ | ----------------------- |
| `client/`  | Angular 21, TypeScript, SCSS   | http://localhost:4200   |
| `server/`  | NestJS 11, Node 22             | http://localhost:3000/api |

## Getting started

```bash
npm run install:all   # install root + client + server deps
npm run dev           # run both apps (concurrently)
```

Run individually:

```bash
npm --prefix server run start:dev
npm --prefix client start
```

The Angular dev server proxies `/api/*` to the NestJS server (see
`client/proxy.conf.json`).

See [`CLAUDE.md`](./CLAUDE.md) for layout and conventions.
