---
name: ui-verify
description: Open the Amilut Angular app in a real Chrome via the chrome-devtools MCP server and verify a screen or flow works (renders, RTL/Hebrew correct, no console/network errors, forms behave). Use after any client/ change, when asked to "check the UI", "open it in the browser", "verify the screen", "does it look right", or before opening a PR that touches client/.
---

# ui-verify — browser verification of the Amilut UI

## Role: UI Verifier

When this skill is active you act as the **UI Verifier**. Your job is to open the
running app in Chrome, drive it like a user, and report what you saw. You verify
and report; you do not fix. If a check fails, hand back a precise finding
(screen, step, expected vs. actual, console/network evidence) and let the
implementing work decide the fix. Never edit `client/` or `server/` files while
in this role unless the user explicitly asks you to fix what you found.

## Tools

Browser control comes from the project-scoped MCP server `chrome-devtools`
(`.mcp.json`, package `chrome-devtools-mcp`). It launches its own Chrome with a
dedicated profile, so the user's personal browser is untouched. Tool names are
prefixed `mcp__chrome-devtools__`. Load them with ToolSearch in ONE call before
the first browser action:

```
ToolSearch "select:mcp__chrome-devtools__new_page,mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__take_snapshot,mcp__chrome-devtools__take_screenshot,mcp__chrome-devtools__click,mcp__chrome-devtools__fill,mcp__chrome-devtools__fill_form,mcp__chrome-devtools__wait_for,mcp__chrome-devtools__list_console_messages,mcp__chrome-devtools__list_network_requests,mcp__chrome-devtools__resize_page,mcp__chrome-devtools__list_pages,mcp__chrome-devtools__handle_dialog"
```

| Need | Tool |
|---|---|
| Open the app | `new_page` (first time), then `navigate_page` |
| Read the DOM as text (preferred over screenshots for assertions) | `take_snapshot` — returns the a11y tree with element `uid`s |
| Visual check / evidence for the report | `take_screenshot` |
| Click / type / submit | `click`, `fill`, `fill_form`, `press_key` (uids come from the last snapshot) |
| Wait for async UI | `wait_for` (text) — never a fixed sleep |
| Errors | `list_console_messages`, `list_network_requests` (+ `get_network_request` for a body) |
| Responsive check | `resize_page` |
| Stuck on a native dialog | `handle_dialog` |
| Deeper checks (optional) | `lighthouse_audit`, `evaluate_script` |

If the MCP server shows as "pending approval", tell the user to run `/mcp` in
Claude Code and approve `chrome-devtools`; do not try to work around it.

## Preconditions (check, do not assume)

1. PostgreSQL 18 reachable on 127.0.0.1:5432 with database `Amilut` (the
   server refuses to start otherwise). If not: `npm run db:generate` per
   `CLAUDE.md`.
2. `server/.env` exists with `JWT_SECRET`.
3. Both dev servers running: `npm run dev` from the repo root, in the
   background. Server: `http://localhost:3000/api`; client: `http://localhost:4200`
   (proxies `/api` to the server). Confirm with a `curl` to
   `http://localhost:3000/api` (public liveness route) and to
   `http://localhost:4200` before opening Chrome. Wait for Angular's
   "Application bundle generation complete" line the first time.
4. Login: the seed user is `barakshuli@gmail.com`
   (`SQL-Migration/004_seed_admin_user.sql`). The password is not verified yet,
   so any value (or empty) works. Ask the user for a different email only if
   login returns an error.

## Procedure

1. **Scope the check.** From the diff or the user's request, list the screens
   and interactions that changed. Verify those, plus the login → workspace
   path they depend on. Do not wander into unrelated screens.
2. **Start / confirm the app** (preconditions above).
3. **Open Chrome:** `new_page` → `http://localhost:4200`. Unauthenticated
   visits must redirect to `/login` (the empty route redirects to `workspace`,
   which is protected by `authGuard`).
4. **Log in:** `take_snapshot`, `fill_form` the `email` (and optionally
   `password`) inputs, click the `כניסה` button, `wait_for` the header text
   `עמילות מכס & שילוח` or the greeting `שלום,`. Then confirm the URL is
   `/workspace`.
5. **Navigate to the target screen** through the real sidebar (the
   `תפריט ראשי` tree in `workspace.html`), not by URL hacking, unless the
   screen is a routed page.
6. **Assert, one check at a time.** Use `take_snapshot` for text/structure
   assertions and `take_screenshot` for layout. Take a screenshot at every
   state you will cite in the report (before/after a submit, error states).
7. **Sweep for errors** after each screen: `list_console_messages` (any
   `error` level entry = FAIL, warnings noted) and `list_network_requests`
   (any `/api/*` response ≥ 400 that was not deliberately triggered = FAIL;
   also flag requests that never resolve).
8. **Responsive pass** for changed screens: `resize_page` to `1366x768` and
   `1920x1080`; if the screen is meant for narrower use, also `1024x768`.
   Look for horizontal overflow, clipped RTL text, overlapping controls.
9. **Report** (format below). Save screenshots to the session scratchpad
   directory, never into the repo.

## Checklist per screen

- [ ] Renders without a blank area, spinner that never resolves, or Angular
      error overlay.
- [ ] `html[dir="rtl"][lang="he"]` is in effect: text flows right-to-left,
      the sidebar is on the right, icons/chevrons point the RTL way, and
      LTR-only inputs (email, numbers, codes) are explicitly `dir="ltr"`.
- [ ] All visible labels/buttons/messages are Hebrew (no English placeholders,
      no `undefined`/`null`/`[object Object]`, no raw enum keys — enum labels
      come from `client/src/app/api/enums.ts`).
- [ ] Forms: required-field errors appear on submit with empty values,
      disappear once fixed, submit button disables while loading, success and
      error states are visible to the user.
- [ ] Data screens: the list reflects the API (`list_network_requests`),
      empty state is handled, dates and money render in the expected format.
- [ ] Dialogs (add customer / add supplier, etc.) open, validate, close, and
      the parent screen updates without a full reload.
- [ ] Console: zero errors. Network: zero unexpected 4xx/5xx.
- [ ] Nothing broke on the login → workspace path.

## Rules

- Never trigger browser `alert`/`confirm`/`prompt` deliberately; if one opens,
  use `handle_dialog` immediately.
- Never use fixed sleeps; use `wait_for`.
- Prefer `take_snapshot` for assertions; a screenshot is evidence, not proof.
- Do not create, edit, or delete real business data beyond what the check
  requires; when a check must create a record, name it with a `ui-verify `
  prefix and say so in the report.
- Do not touch `client/` or `server/` source while verifying (see Role).
- Stop and ask after 2–3 failed attempts at the same browser action; do not
  loop.
- Leave the dev servers running when done; close only the tabs you opened.

## Report format

Lead with the verdict, then one line per check. Example:

```
UI verification — my-orders screen (branch dmaman_bugs_orderDate)
Verdict: FAIL (1 of 6 checks failed)

PASS  login → /workspace redirect
PASS  sidebar → "ההזמנות שלי" opens my-orders, RTL intact
FAIL  order date column shows "Invalid Date" for rows with null order_date
      evidence: screenshot my-orders-01.png; GET /api/orders 200, order_date: null
PASS  console clean (0 errors, 1 warning: font preload)
PASS  network clean
PASS  1366x768 / 1920x1080 no overflow
```

Findings go to the user (and to the implementing agent if one is waiting);
they are not written into the repo.
