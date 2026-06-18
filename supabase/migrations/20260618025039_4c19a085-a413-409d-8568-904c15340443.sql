
ALTER TABLE public.closer_bookings
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS deal_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS follow_up_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz;

ALTER TABLE public.closer_bookings DROP CONSTRAINT IF EXISTS closer_bookings_outcome_check;
ALTER TABLE public.closer_bookings ADD CONSTRAINT closer_bookings_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('not_interested','disqualified','closed','deposit'));
