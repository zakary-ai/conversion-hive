
-- 1) Remove anon SELECT on dm_setters (leak of full_name/email)
DROP POLICY IF EXISTS "dm_setters public apply lookup" ON public.dm_setters;
REVOKE SELECT ON public.dm_setters FROM anon;

-- 2) Scope manager team-read policy to authenticated only (was TO public)
DROP POLICY IF EXISTS "dm_setters manager read team" ON public.dm_setters;
CREATE POLICY "dm_setters manager read team"
  ON public.dm_setters
  FOR SELECT
  TO authenticated
  USING (manager_id = public.get_dm_setter_id_for_user(auth.uid()));

-- 3) Revoke anon (and unnecessary authenticated) EXECUTE on SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dm_setter_id_for_user(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dm_setter_id_for_user(uuid) TO authenticated;
