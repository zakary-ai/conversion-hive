-- 1. Extend profiles with OpenPhone fields and personal phone (for bridge calling)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_phone_e164 text,
  ADD COLUMN IF NOT EXISTS openphone_user_id text,
  ADD COLUMN IF NOT EXISTS openphone_number_e164 text,
  ADD COLUMN IF NOT EXISTS openphone_number_id text;

-- 2. Pool of pre-purchased OpenPhone numbers, admin-managed
CREATE TABLE IF NOT EXISTS public.openphone_number_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  openphone_number_id text NOT NULL UNIQUE,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.openphone_number_pool TO authenticated;
GRANT ALL ON public.openphone_number_pool TO service_role;

ALTER TABLE public.openphone_number_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage number pool"
  ON public.openphone_number_pool FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_openphone_number_pool_updated
  BEFORE UPDATE ON public.openphone_number_pool
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Call logs (bridge calls placed via OpenPhone)
CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  openphone_call_id text UNIQUE,
  direction text NOT NULL DEFAULT 'outbound',
  status text,
  from_number text,
  to_number text,
  duration_sec integer,
  recording_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_logs_user_idx ON public.call_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_lead_idx ON public.call_logs(lead_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Setters read own calls"
  ON public.call_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Setters insert own calls"
  ON public.call_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update calls"
  ON public.call_logs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_call_logs_updated
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();