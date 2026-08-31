-- Add leave_duration_type column to leaves table
ALTER TABLE public.leaves
ADD COLUMN IF NOT EXISTS leave_duration_type text DEFAULT 'Full Day';

-- Optional: backfill from existing data if you have a different column
-- UPDATE public.leaves SET leave_duration_type = 'Full Day' WHERE leave_duration_type IS NULL;
