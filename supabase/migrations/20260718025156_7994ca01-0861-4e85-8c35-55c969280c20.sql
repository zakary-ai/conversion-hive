
ALTER TABLE public.closer_bookings
  ADD COLUMN IF NOT EXISTS previous_slot_start timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS unbooked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'application_status' AND e.enumlabel = 'Reapplied'
  ) THEN
    ALTER TYPE public.application_status ADD VALUE 'Reapplied';
  END IF;
END $$;
