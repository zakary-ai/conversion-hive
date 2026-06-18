CREATE TABLE public.closer_payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closer_id UUID NOT NULL REFERENCES public.closers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL,
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX closer_payouts_closer_id_idx ON public.closer_payouts(closer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_payouts TO authenticated;
GRANT ALL ON public.closer_payouts TO service_role;

ALTER TABLE public.closer_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage closer payouts"
  ON public.closer_payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Closers view their own payouts"
  ON public.closer_payouts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.closers c WHERE c.id = closer_payouts.closer_id AND c.user_id = auth.uid()));