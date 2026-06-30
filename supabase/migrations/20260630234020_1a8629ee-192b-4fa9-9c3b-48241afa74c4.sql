DROP POLICY IF EXISTS "Update own appointments or admin" ON public.appointments;
CREATE POLICY "Update own appointments assigned closer or admin"
ON public.appointments FOR UPDATE
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR assigned_closer_id IN (SELECT c.id FROM closers c WHERE c.user_id = auth.uid())
  OR b2b_closer_id IN (SELECT bc.id FROM b2b_closers bc WHERE bc.user_id = auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR assigned_closer_id IN (SELECT c.id FROM closers c WHERE c.user_id = auth.uid())
  OR b2b_closer_id IN (SELECT bc.id FROM b2b_closers bc WHERE bc.user_id = auth.uid())
);