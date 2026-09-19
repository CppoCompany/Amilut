-- =============================================================================
-- 008_seed_user_erez_nakar
-- Seeds an additional user row in `users`.
--
-- Run this file against the `Amilut` database (the runner does this, as
-- `Admin` via SET ROLE).
--
-- Idempotent: inserts only if no user with this email exists yet, so
-- re-running never creates a duplicate and never overwrites edits made later.
-- =============================================================================

INSERT INTO users (name, email, "isActive")
SELECT 'Erez Nakar', 'erez@gmail.com', true
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE lower(email) = 'erez@gmail.com'
);
