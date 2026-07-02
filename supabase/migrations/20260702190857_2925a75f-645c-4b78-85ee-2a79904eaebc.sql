
CREATE OR REPLACE FUNCTION public.get_dm_setter_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.dm_setters WHERE user_id = _user_id LIMIT 1;
$$;

DROP POLICY IF EXISTS "dm_setters manager read team" ON public.dm_setters;
CREATE POLICY "dm_setters manager read team" ON public.dm_setters
FOR SELECT USING (manager_id = public.get_dm_setter_id_for_user(auth.uid()));
