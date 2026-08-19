REVOKE ALL ON FUNCTION public.can_view_module(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_module(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_module(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_module(uuid, uuid) TO service_role;