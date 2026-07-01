-- Allow two commission rows per appointment (setter + closer) instead of one.
DROP INDEX IF EXISTS public.commissions_appointment_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS commissions_appointment_role_unique
  ON public.commissions (appointment_id, role)
  WHERE appointment_id IS NOT NULL;