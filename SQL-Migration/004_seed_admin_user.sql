-- =============================================================================
-- 004_seed_admin_user
-- Seeds the initial administrator row in `users` so the application has an
-- account to sign in with on a fresh database.
--
-- Run this file against the `Amilut` database (the runner does this, as
-- `Admin` via SET ROLE).
--
-- Idempotent: inserts only if no user with this email exists yet, so
-- re-running never creates a duplicate and never overwrites edits made later.
-- =============================================================================

INSERT INTO users (name, role, title, email, "isActive")
SELECT 'Barak Shuli', 'admin', 'Administrator', 'barakshuli@gmail.com', true
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE lower(email) = 'barakshuli@gmail.com'
);
