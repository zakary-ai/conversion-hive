ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by UUID,
  ADD COLUMN IF NOT EXISTS paid_note TEXT;

CREATE INDEX IF NOT EXISTS commissions_paid_at_idx ON public.commissions(paid_at);