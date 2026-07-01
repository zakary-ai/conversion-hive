
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS role text CHECK (role IN ('setter','closer','manual'));

-- Best-effort backfill: existing single-row commissions are treated as 'closer' rows
UPDATE public.commissions SET role = 'closer' WHERE role IS NULL AND appointment_id IS NOT NULL;
UPDATE public.commissions SET role = 'manual' WHERE role IS NULL;

CREATE INDEX IF NOT EXISTS commissions_appointment_role_idx ON public.commissions(appointment_id, role);
