-- Migration: add audit/action columns used by the client
-- Run this in Supabase SQL editor (Database → SQL Editor) or via psql.

BEGIN;

-- Add columns to leaves table
ALTER TABLE IF EXISTS leaves
  ADD COLUMN IF NOT EXISTS action_by text,
  ADD COLUMN IF NOT EXISTS action_date timestamptz,
  ADD COLUMN IF NOT EXISTS reason_for_action text;

-- Add columns to permissions table
ALTER TABLE IF EXISTS permissions
  ADD COLUMN IF NOT EXISTS action_by text,
  ADD COLUMN IF NOT EXISTS action_date timestamptz,
  ADD COLUMN IF NOT EXISTS reason_for_action text;

COMMIT;

-- After running, refresh your app and retry Approve/Reject.
