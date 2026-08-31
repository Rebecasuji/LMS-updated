-- ============================================================================
-- Comp Off Module Migration
-- Adds: comp_off_requests, comp_off_usage_ledger, app_notifications tables
-- Extends: leaves table with Comp Off coverage/LOP tracking columns
-- Safe to run multiple times (uses IF NOT EXISTS guards throughout).
-- Does NOT touch/drop any existing table, column, or data.
-- ============================================================================

-- 1) comp_off_requests: the "Apply Comp Off" request + dual approval + credit ledger header
CREATE TABLE IF NOT EXISTS comp_off_requests (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  username text,
  employee_name text,

  earned_start_date date NOT NULL,
  earned_end_date date NOT NULL,
  comp_off_days numeric NOT NULL DEFAULT 1,
  reason text,

  applied_date timestamptz DEFAULT now(),

  -- Admin approval (independent)
  admin_status text NOT NULL DEFAULT 'Pending',      -- Pending | Approved | Rejected
  admin_approved_by text,
  admin_approved_at timestamptz,
  admin_comments text,

  -- HR approval (independent)
  hr_status text NOT NULL DEFAULT 'Pending',         -- Pending | Approved | Rejected
  hr_approved_by text,
  hr_approved_at timestamptz,
  hr_comments text,

  -- Derived final state -- only becomes 'Approved' once BOTH admin_status
  -- and hr_status are 'Approved'. If only one has approved so far, this is
  -- 'Partially Approved / Pending Final Approval'. If either rejects, 'Rejected'.
  final_status text NOT NULL DEFAULT 'Pending',

  credited boolean NOT NULL DEFAULT false,
  credited_at timestamptz,
  credited_days numeric NOT NULL DEFAULT 0,
  used_days numeric NOT NULL DEFAULT 0,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_off_requests_user ON comp_off_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_comp_off_requests_final_status ON comp_off_requests(final_status);

-- 2) comp_off_usage_ledger: every calendar day of Comp Off consumed by a Comp Off leave
--    application is recorded here (FIFO against comp_off_requests). Prevents a used
--    day from ever being reused, and prevents the same leave+date pairing being
--    double counted.
CREATE TABLE IF NOT EXISTS comp_off_usage_ledger (
  id serial PRIMARY KEY,
  comp_off_request_id integer NOT NULL REFERENCES comp_off_requests(id) ON DELETE CASCADE,
  leave_id integer REFERENCES leaves(id) ON DELETE SET NULL,
  user_id text NOT NULL,
  used_date date NOT NULL,
  days_used numeric NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE (leave_id, comp_off_request_id, used_date)
);

CREATE INDEX IF NOT EXISTS idx_compoff_ledger_user ON comp_off_usage_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_compoff_ledger_leave ON comp_off_usage_ledger(leave_id);

-- 3) app_notifications: lightweight in-app notification feed for Employee/Admin/HR.
--    A row can target a specific user_id, or a whole role (e.g. broadcast to all HR).
CREATE TABLE IF NOT EXISTS app_notifications (
  id serial PRIMARY KEY,
  user_id text,              -- specific recipient (nullable when role-broadcast)
  role text,                 -- 'Admin' | 'HR' | 'Employee' (nullable when user-specific)
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,        -- e.g. comp_off_applied, comp_off_admin_approved, comp_off_hr_approved,
                              --      comp_off_credited, comp_off_rejected, comp_off_lop_warning
  related_type text,         -- 'comp_off_request' | 'leave'
  related_id integer,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_role ON app_notifications(role);

-- 4) Extend the existing `leaves` table (non-destructive) so a Comp Off leave
--    application can record exactly how many days were covered by approved
--    Comp Off balance vs. how many fell through to LOP.
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS comp_off_covered_days numeric DEFAULT 0;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS lop_days numeric DEFAULT 0;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS comp_off_uncovered_dates text; -- comma-separated ISO dates treated as LOP

-- 5) (DEV ONLY) If you use RLS and need quick anon-key access while testing,
--    uncomment the permissive policies below. Do NOT leave enabled in production.
-- ALTER TABLE comp_off_requests DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE comp_off_usage_ledger DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE app_notifications DISABLE ROW LEVEL SECURITY;

-- End of script
