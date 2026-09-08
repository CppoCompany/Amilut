-- =============================================================================
-- 001_create_role_and_database
-- Creates the application login role `Admin` and the `Amilut` database.
--
-- Run this file against the maintenance database (`postgres`) as a SUPERUSER.
-- The runner (run-migrations.mjs) does this automatically.
--
-- Idempotent: safe to run repeatedly.
--   * The role is created only if it does not already exist.
--   * CREATE DATABASE cannot run inside a DO block or a transaction, so the
--     runner performs the "create database if not exists" check in code and
--     executes only the CREATE DATABASE line below when needed.
-- =============================================================================

-- ---- Application login role -------------------------------------------------
DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'Admin') THEN
        CREATE ROLE "Admin" WITH LOGIN PASSWORD 'Admin' CREATEDB;
    END IF;
END
$$;

-- ---- Application database ----------------------------------------------------
-- The runner executes the following statement only if the database is absent.
-- Marker line — do not edit the text between the markers.
-- @create-database
CREATE DATABASE "Amilut" OWNER "Admin";
-- @end-create-database
