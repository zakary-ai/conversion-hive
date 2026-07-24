
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS pool_lead_id uuid REFERENCES public.b2b_lead_pool(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS call_logs_pool_lead_idx
  ON public.call_logs (pool_lead_id, created_at DESC)
  WHERE pool_lead_id IS NOT NULL;

-- Allow the claimer of a pool lead to read that lead's call logs.
DROP POLICY IF EXISTS "Setters read own calls" ON public.call_logs;
CREATE POLICY "Setters read own calls" ON public.call_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      pool_lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.b2b_lead_pool p
        WHERE p.id = call_logs.pool_lead_id AND p.claimed_by = auth.uid()
      )
    )
  );
