# Generated API types

Everything in this folder is **generated** from the server's OpenAPI spec
(`server/openapi.json`) by [`openapi-typescript`](https://openapi-ts.dev/) with the
`--enum` flag, which turns named string-enum schemas (those carrying `x-enum-varnames`)
into real TypeScript `enum`s with the same member names as the server.

Do not edit `schema.ts` by hand — your changes will be overwritten.

## Regenerate

From the repo root (re-exports the spec from the NestJS server, then regenerates):

```bash
npm run api:generate
```

Or step by step:

```bash
npm --prefix server run openapi:export && npm --prefix client run api:generate
```

The output is checked into git so the client builds without running the server first.

Hand-written re-exports and UI label maps live one level up in `src/app/api/enums.ts`.
