
CREATE TABLE public.dm_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dm_setter_id UUID NOT NULL REFERENCES public.dm_setters(id) ON DELETE CASCADE,
  dm_daily_log_id UUID REFERENCES public.dm_daily_logs(id) ON DELETE SET NULL,
  name_normalized TEXT NOT NULL,
  name_original TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dm_setter_id, name_normalized)
);

CREATE INDEX idx_dm_recipients_setter_created ON public.dm_recipients (dm_setter_id, created_at DESC);

GRANT SELECT, INSERT ON public.dm_recipients TO authenticated;
GRANT ALL ON public.dm_recipients TO service_role;

ALTER TABLE public.dm_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Setters view their own recipients"
ON public.dm_recipients FOR SELECT
TO authenticated
USING (dm_setter_id = public.get_dm_setter_id_for_user(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Setters insert their own recipients"
ON public.dm_recipients FOR INSERT
TO authenticated
WITH CHECK (dm_setter_id = public.get_dm_setter_id_for_user(auth.uid()));
