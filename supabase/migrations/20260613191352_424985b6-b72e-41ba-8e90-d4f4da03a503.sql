
-- Trigger functions: nobody should be calling these directly from the API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leads_status_change_tg() FROM PUBLIC, anon, authenticated;
