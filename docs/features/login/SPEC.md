# SPEC — Login Page (Mockup)

**Feature:** User login page
**Scope:** Frontend mockup only — no backend, no API, no database, no persistence
**App:** `client/` (Angular 21 standalone SPA)
**Status:** Draft

---

## 1. Goal

> As a user, I need to be able to log into the system.

Deliver a login **page** with a single centered card containing a `Welcome`
heading, an email field, a password field, and a submit button. Validate that
fields are not empty and that the email is well-formed before the form can be
submitted.

This iteration is a **mockup**: no real authentication. Submitting a valid form
does nothing more than a visible, local-only acknowledgement (e.g. logging the
value / showing a transient "submitted" state). No HTTP calls, no token, no
route guard, no server.

## 2. In scope

- A standalone `LoginComponent` reachable at the route `/login`.
- App routes redirect the empty path `''` to `/login` so the page is the
  landing screen for now.
- A centered card (box) containing:
  - `Welcome` heading.
  - **Email** field (`type="email"`).
  - **Password** field (`type="password"`).
  - **Submit** button labelled e.g. `Sign in`.
- Client-side validation using Angular **typed reactive forms**:
  - Email: required + valid email format.
  - Password: required (non-empty).
- Validation UX:
  - Inline error messages shown per field after the field is touched or a
    submit is attempted.
  - Submit button disabled while the form is invalid.
  - No error text shown on a pristine, untouched form.
- Responsive, centered layout that works on mobile and desktop.
- Unit tests for the component's validation logic.

## 3. Out of scope (explicitly not in this iteration)

- Any server / NestJS work, API endpoints, or DTOs.
- Real authentication, sessions, JWT, cookies, or storage.
- Password reset, "remember me", social / SSO login, sign-up.
- Route guards or redirect-after-login flows.
- i18n / RTL (English-only copy for the mockup).
- Visual design system / theming beyond clean, neutral styling.

## 4. UI / layout

```
┌───────────────────────────────────────────────┐
│                                                 │
│            ┌───────────────────────┐            │
│            │                       │            │
│            │       Welcome         │            │
│            │                       │            │
│            │  Email                │            │
│            │  [____________________]│           │
│            │  ⚠ inline error        │           │
│            │                       │            │
│            │  Password             │            │
│            │  [____________________]│           │
│            │  ⚠ inline error        │           │
│            │                       │            │
│            │     [   Sign in   ]   │            │
│            │                       │            │
│            └───────────────────────┘            │
│                  (centered card)                │
└───────────────────────────────────────────────┘
```

- The card is horizontally and vertically centered in the viewport.
- Max card width ~360–400px; full-width fields inside.
- Neutral, clean styling (card shadow, rounded corners, comfortable spacing).

## 5. Validation rules

| Field    | Rule(s)                          | Error message                          |
|----------|----------------------------------|----------------------------------------|
| Email    | `required`                       | `Email is required`                    |
| Email    | `email` (valid format)           | `Enter a valid email address`          |
| Password | `required`                       | `Password is required`                 |

- Errors appear only after the control is `touched` **or** a submit was
  attempted.
- The submit button is `disabled` whenever the form is `invalid`.
- On valid submit: local acknowledgement only (no network). For the mockup,
  surface a transient "Signed in (mock)" message and/or `console.log` the
  email; clear any submitted state when the user edits again.

## 6. Acceptance criteria

1. Navigating to the app root shows the login page (redirected to `/login`).
2. The page shows a single centered card with the heading `Welcome`, an email
   input, a password input, and a `Sign in` button.
3. With both fields empty, the submit button is disabled and no error text is
   shown until interaction.
4. Touching and leaving the email field empty shows `Email is required`.
5. Typing an invalid email (e.g. `foo@`) shows `Enter a valid email address`.
6. Touching and leaving the password field empty shows `Password is required`.
7. Entering a valid email and a non-empty password enables the submit button.
8. Submitting a valid form makes **no** network request and shows the local
   mock acknowledgement.
9. Layout stays centered and usable from ~320px wide up to desktop.
10. Unit tests cover: required-email, invalid-email, required-password, and the
    valid → enabled-submit path.

## 7. Conventions to follow

- Standalone component, `ReactiveFormsModule`, `inject()`, signals for local UI
  state (e.g. submitted flag), per `client/CLAUDE.md`.
- SCSS for component styles; keep the component thin.
- Prettier: 100 print width, single quotes (already configured in
  `client/package.json`).
