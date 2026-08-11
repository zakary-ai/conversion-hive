CREATE TABLE public.b2b_live_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool_lead_id uuid REFERENCES public.b2b_lead_pool(id) ON DELETE SET NULL,
  justcall_call_id text,
  phone text,
  direction text NOT NULL DEFAULT 'outbound',
  state text NOT NULL DEFAULT 'ringing',
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.b2b_live_calls TO authenticated;
GRANT ALL ON public.b2b_live_calls TO service_role;

ALTER TABLE public.b2b_live_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Setters read their own live calls"
ON public.b2b_live_calls FOR SELECT TO authenticated
USING (setter_id = auth.uid());

CREATE POLICY "Admins read all live calls"
ON public.b2b_live_calls FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER b2b_live_calls_updated_at
BEFORE UPDATE ON public.b2b_live_calls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_b2b_live_calls_setter_started ON public.b2b_live_calls (setter_id, started_at DESC);
CREATE UNIQUE INDEX idx_b2b_live_calls_justcall_id ON public.b2b_live_calls (justcall_call_id) WHERE justcall_call_id IS NOT NULL;

ALTER TABLE public.b2b_live_calls REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.b2b_live_calls;

ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS justcall_call_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_justcall_id ON public.call_logs (justcall_call_id) WHERE justcall_call_id IS NOT NULL;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS justcall_agent_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS justcall_agent_email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS justcall_number_e164 text;