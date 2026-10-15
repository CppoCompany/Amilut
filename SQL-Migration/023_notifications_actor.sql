-- =============================================================================
-- 023_notifications_actor
-- Adds `notifications.actor_user_id` — the user whose action triggered the
-- notification (e.g. who opened the Customs Clearance File), shown next to
-- the event in the dashboard's "הודעות" widget.
--
--   actor_user_id — → users(id), nullable: rows written before this
--                   migration have no recorded actor, and a system-generated
--                   notification may have none. ON DELETE SET NULL: deleting
--                   a user keeps the notifications they triggered.
--
-- Backfill: every notification so far was written by CCF creation, whose
-- actor is the CCF's creator (`customs_clearance_files.created_by`).
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the backfill only touches rows still
-- without an actor.
-- =============================================================================

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE notifications n
   SET actor_user_id = c.created_by
  FROM customs_clearance_files c
 WHERE n.related_ccf_id = c.id
   AND n.actor_user_id IS NULL;
