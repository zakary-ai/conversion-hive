CREATE TABLE public.dm_manager_zoom_credentials (
  manager_id uuid PRIMARY KEY REFERENCES public.dm_setters(id) ON DELETE CASCADE,
  zoom_account_id text,
  zoom_client_id text,
  zoom_client_secret text,
  zoom_host_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_manager_zoom_credentials TO authenticated;
GRANT ALL ON public.dm_manager_zoom_credentials TO service_role;

ALTER TABLE public.dm_manager_zoom_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage their own zoom credentials"
ON public.dm_manager_zoom_credentials FOR ALL TO authenticated
USING (manager_id = public.get_dm_setter_id_for_user(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (manager_id = public.get_dm_setter_id_for_user(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER dm_manager_zoom_credentials_updated_at
BEFORE UPDATE ON public.dm_manager_zoom_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();