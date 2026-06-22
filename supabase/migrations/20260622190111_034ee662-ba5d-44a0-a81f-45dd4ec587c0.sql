ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS counted_at timestamptz;
CREATE INDEX IF NOT EXISTS call_logs_user_lead_started_idx ON public.call_logs (user_id, lead_id, started_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_to_number_started_idx ON public.call_logs (to_number, started_at DESC) WHERE openphone_call_id IS NULL;