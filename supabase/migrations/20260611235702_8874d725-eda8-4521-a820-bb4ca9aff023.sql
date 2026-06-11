
-- 1) Quiz questions: restrict SELECT to admins; non-admins read via server functions using service role
DROP POLICY IF EXISTS "All view questions" ON public.quiz_questions;
CREATE POLICY "Admins view questions"
  ON public.quiz_questions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) Explicit admin-only INSERT policy on user_roles to remove any ambiguity
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) scraper_runs: admin UPDATE/DELETE policies
CREATE POLICY "Admins update scraper runs"
  ON public.scraper_runs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete scraper runs"
  ON public.scraper_runs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Revoke EXECUTE on SECURITY DEFINER helpers from API roles.
--    RLS policies and triggers still invoke them since they run as superuser/definer.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
