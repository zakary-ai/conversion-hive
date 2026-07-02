
ALTER TABLE public.closer_bookings
  ADD COLUMN IF NOT EXISTS dm_setter_commission_amount numeric,
  ADD COLUMN IF NOT EXISTS dm_setter_commission_status text,
  ADD COLUMN IF NOT EXISTS dm_setter_commission_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS dm_setter_manager_id uuid,
  ADD COLUMN IF NOT EXISTS dm_setter_manager_commission_amount numeric,
  ADD COLUMN IF NOT EXISTS dm_setter_manager_commission_status text,
  ADD COLUMN IF NOT EXISTS dm_setter_manager_commission_paid_at timestamptz;
