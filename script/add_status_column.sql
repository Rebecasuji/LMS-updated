-- Migration: add missing `status` column to `leaves` table
-- Run this in Supabase SQL editor (Database → SQL Editor) or via psql.

BEGIN;

ALTER TABLE IF EXISTS leaves
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Pending';

COMMIT;

-- After running, refresh your app and retry Approve/Reject.
