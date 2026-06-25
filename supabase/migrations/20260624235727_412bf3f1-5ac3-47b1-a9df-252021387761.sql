
ALTER TABLE public.closer_bookings
  ADD COLUMN IF NOT EXISTS commission_status text NOT NULL DEFAULT 'pending'
    CHECK (commission_status IN ('pending','approved'));

-- Mark existing recorded outcomes as approved so they aren't retroactively held.
UPDATE public.closer_bookings
  SET commission_status = 'approved'
  WHERE outcome IN ('closed','deposit') AND commission_status = 'pending';
