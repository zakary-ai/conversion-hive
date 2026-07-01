
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_token text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_confirmation_token_key
  ON public.appointments (confirmation_token)
  WHERE confirmation_token IS NOT NULL;
