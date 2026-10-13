-- =============================================================================
-- 020_create_notifications
-- Minimal in-app notification system. First consumer is 019's Customs
-- Clearance File feature (notifying "the appropriate customs broker" on
-- create), but the shape is generic — recipient + message + an optional
-- related CCF — not CCF-specific plumbing, so later features can reuse it.
--
--   related_ccf_id — → customs_clearance_files(id), nullable. ON DELETE
--                     CASCADE: a notification about a CCF that no longer
--                     exists is meaningless and should disappear with it.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS throughout.
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id                 SERIAL       PRIMARY KEY,
    recipient_user_id  INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message            TEXT         NOT NULL,
    related_ccf_id     INTEGER      REFERENCES customs_clearance_files(id) ON DELETE CASCADE,
    is_read            BOOLEAN      NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx ON notifications (recipient_user_id, is_read);
