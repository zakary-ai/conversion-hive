
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS commission_percent numeric,
  ADD COLUMN IF NOT EXISTS deal_amount numeric,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Existing entries get auto-approved
UPDATE public.commissions SET status = 'approved', approved_at = COALESCE(approved_at, created_at) WHERE status = 'pending' AND created_at < now();

-- Allow closers to insert their own pending commission entries (e.g. when logging a closed deal)
DROP POLICY IF EXISTS "Closers insert own pending commissions" ON public.commissions;
CREATE POLICY "Closers insert own pending commissions"
ON public.commissions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'pending');
