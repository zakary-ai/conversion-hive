ALTER TABLE public.closer_bookings DROP CONSTRAINT IF EXISTS closer_bookings_outcome_check;
ALTER TABLE public.closer_bookings ADD CONSTRAINT closer_bookings_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('not_interested','disqualified','closed','deposit','no_show'));