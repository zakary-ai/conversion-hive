DROP POLICY IF EXISTS "View own appointments or admin" ON public.appointments;

CREATE POLICY "View own appointments assigned closer or admin"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR assigned_closer_id IN (
    SELECT c.id
    FROM public.closers c
    WHERE c.user_id = auth.uid()
  )
  OR b2b_closer_id IN (
    SELECT bc.id
    FROM public.b2b_closers bc
    WHERE bc.user_id = auth.uid()
  )
);