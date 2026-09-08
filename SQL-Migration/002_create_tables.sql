-- =============================================================================
-- 002_create_tables
-- Creates the `customers` and `users` tables inside the `Amilut` database.
--
-- Run this file against the `Amilut` database. The runner connects as a
-- superuser and issues `SET ROLE "Admin"` first, so every object created here
-- is owned by the `Admin` role.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
-- =============================================================================

-- ---- customers --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    address    VARCHAR(500),
    phone      VARCHAR(50),
    email      VARCHAR(255),
    "isActive" BOOLEAN      NOT NULL DEFAULT true
);

-- ---- users ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL       PRIMARY KEY,
    customer_id INTEGER      REFERENCES customers(id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    role        VARCHAR(50)  NOT NULL DEFAULT 'admin',
    title       VARCHAR(100),
    email       VARCHAR(255),
    last_login  TIMESTAMPTZ,
    "isActive"  BOOLEAN      NOT NULL DEFAULT true
);
