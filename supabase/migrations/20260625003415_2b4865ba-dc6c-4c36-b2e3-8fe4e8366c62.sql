DROP POLICY IF EXISTS "Authenticated read avail" ON public.closer_availability_rules;
CREATE POLICY "Admins and closers read avail" ON public.closer_availability_rules
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'closer'));