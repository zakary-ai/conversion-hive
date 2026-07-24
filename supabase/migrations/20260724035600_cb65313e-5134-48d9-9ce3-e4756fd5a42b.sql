
DROP POLICY IF EXISTS "pool update" ON public.b2b_lead_pool;
CREATE POLICY "pool update" ON public.b2b_lead_pool
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR claimed_by = auth.uid()
  OR (claimed_by IS NULL AND archived = false AND status = 'unclaimed'::public.b2b_pool_status)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR claimed_by = auth.uid()
);
