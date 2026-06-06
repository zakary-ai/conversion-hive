
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS deal_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS outcome_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_outcome_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('closed','lost'));

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS commissions_appointment_id_unique
  ON public.commissions(appointment_id) WHERE appointment_id IS NOT NULL;
