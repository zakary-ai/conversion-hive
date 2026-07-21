
ALTER VIEW public.ob_lead_timeline SET (security_invoker = true);

-- webhook_events: allow service_role writes (RLS bypassed anyway); add an admin insert path for completeness
CREATE POLICY "ob_webhook_events admin write" ON public.ob_webhook_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
