
ALTER TABLE public.closer_bookings
  ADD COLUMN IF NOT EXISTS previous_slot_start timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS unbooked_at timestamptz;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted';

CREATE INDEX IF NOT EXISTS idx_closer_bookings_status_slot
  ON public.closer_bookings (status, slot_start);
