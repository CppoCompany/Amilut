# TASKS — Login Page (Mockup)

Derived from [PLAN.md](./PLAN.md). Check off as completed.

---

- [x] **T1 — Scaffold component files**
  Create `client/src/app/features/login/` with `login.ts`, `login.html`,
  `login.scss`, `login.spec.ts`.

- [x] **T2 — Build the typed reactive form**
  In `login.ts`: standalone `Login` component, import `ReactiveFormsModule`,
  define typed `FormGroup` with `email` (required + email) and `password`
  (required). Add `submitted` signal and `showError()` helper.

- [x] **T3 — Template: centered card**
  In `login.html`: centered card with `Welcome` heading, email + password
  fields with labels, inline `@if` error messages, and a full-width `Sign in`
  submit button bound to `[disabled]="form.invalid"`. Mock success note.

- [x] **T4 — Styling**
  In `login.scss`: full-viewport centering, card (shadow, radius, padding),
  full-width fields, error text style, disabled button state. Responsive down
  to ~320px.

- [x] **T5 — Submit handler**
  Implement `onSubmit()`: invalid → mark touched + `submitted=true`; valid →
  `console.log(email)` + show transient mock acknowledgement. No network.

- [x] **T6 — Routing**
  Edit `app.routes.ts`: lazy `/login` route + `''` redirect to `login`.

- [x] **T7 — Unit tests**
  In `login.spec.ts`: empty-invalid, email-required, email-format, password-
  required, valid→enabled, and `onSubmit` success-flag behavior.

- [x] **T8 — Verify**
  Run `npm --prefix client test`; run `npm --prefix client start` and
  eyeball the page against the SPEC acceptance criteria.
