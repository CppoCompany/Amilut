# PLAN — Login Page (Mockup)

Implementation plan for [SPEC.md](./SPEC.md). Frontend-only, `client/` app.

---

## Approach

Add one standalone `LoginComponent` under a `features/login/` folder, wire it
into the router as the default route, and back the form with a **typed reactive
form**. Local UI state (whether a submit was attempted, mock-submitted flag)
uses signals. No services or HTTP — a `onSubmit()` handler does the local-only
acknowledgement so the seam for a future `AuthService` is obvious.

## File layout

```
client/src/app/
├── app.routes.ts                       (edit) add '' → /login redirect + /login route
└── features/
    └── login/
        ├── login.ts                    (new) LoginComponent
        ├── login.html                  (new) centered card template
        ├── login.scss                  (new) card + form styling
        └── login.spec.ts               (new) validation unit tests
```

Rationale: a `features/` folder gives the scaffold a place to grow feature
modules, matching the "feature modules" convention without over-engineering a
single page.

## Component design

- **Selector:** `app-login`, standalone.
- **Imports:** `ReactiveFormsModule`.
- **Form:** built with a typed `FormGroup` (via `NonNullableFormBuilder` or
  `new FormGroup({...})`):
  - `email: FormControl<string>` — `Validators.required`, `Validators.email`.
  - `password: FormControl<string>` — `Validators.required`.
- **State (signals):**
  - `submitted = signal(false)` — set true on a submit attempt; gates whether
    errors show even before a field is touched, and toggles the mock success
    message.
- **Template logic:**
  - A small helper to decide when to show an error for a control:
    show when `control.invalid && (control.touched || submitted())`.
  - Submit button `[disabled]="form.invalid"`.
  - Use native control flow `@if` for error messages and the mock success note.
- **onSubmit():**
  - If `form.invalid`: mark all controls touched, set `submitted` true, return.
  - If valid: `console.log` the email, show a transient "Signed in (mock)"
    message. No network.

## Routing

`app.routes.ts`:

```ts
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.Login) },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
```

Lazy `loadComponent` keeps the initial route lean and is idiomatic for Angular
standalone routing.

## Styling

- Full-viewport flex container, centered both axes.
- Card: white background, rounded corners, subtle shadow, padding ~2rem, max
  width ~380px.
- Fields full-width with labels above; error text in a muted red below each.
- Submit button full-width; disabled style when form invalid.
- Reuse the neutral gray tokens already present in the scaffold where sensible;
  keep styles scoped to the component.

## Validation message mapping

| Control  | Error key   | Message                       |
|----------|-------------|-------------------------------|
| email    | `required`  | `Email is required`           |
| email    | `email`     | `Enter a valid email address` |
| password | `required`  | `Password is required`        |

## Testing strategy (vitest + TestBed)

- Form invalid when empty.
- Email required error when email blank and touched.
- Email format error for `foo@`.
- Password required error when blank.
- Form valid + submit enabled for `a@b.com` + `secret`.
- `onSubmit` with invalid form does not set the mock success flag; with valid
  form it does.

## Risks / notes

- Angular's `Validators.email` is lenient (accepts e.g. `a@b`). Acceptable for a
  mockup; note for later if stricter rules are needed.
- No `provideHttpClient` is added — confirms there is genuinely no network path.
- The `app.spec.ts` test asserting the placeholder `Hello, client` heading is
  unaffected because `App` still renders via `router-outlet`; we do not modify
  `app.html`/`app.ts`.
