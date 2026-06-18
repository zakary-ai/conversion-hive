ALTER TABLE public.closer_bookings
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2);