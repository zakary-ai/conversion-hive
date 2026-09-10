CREATE TABLE public.pif_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_channel text NOT NULL,
  slack_ts text NOT NULL,
  slack_user text,
  posted_at timestamp with time zone,
  raw_text text NOT NULL,
  person_name text,
  amount_due numeric,
  due_date date,
  payment_method text,
  recurrence_note text,
  status text NOT NULL DEFAULT 'due',
  paid_at timestamp with time zone,
  notes text,
  needs_review boolean NOT NULL DEFAULT false,
  manually_edited boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pif_payments_slack_ts_key UNIQUE (slack_channel, slack_ts)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pif_payments TO authenticated;
GRANT ALL ON public.pif_payments TO service_role;

ALTER TABLE public.pif_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pif payments"
ON public.pif_payments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pif_payments_updated_at
BEFORE UPDATE ON public.pif_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX pif_payments_due_date_idx ON public.pif_payments (due_date);

CREATE TABLE public.pif_payment_sync (
  id integer NOT NULL PRIMARY KEY DEFAULT 1,
  last_synced_at timestamp with time zone,
  last_status text,
  last_error text,
  messages_seen integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pif_payment_sync_singleton CHECK (id = 1)
);

GRANT SELECT ON public.pif_payment_sync TO authenticated;
GRANT ALL ON public.pif_payment_sync TO service_role;

ALTER TABLE public.pif_payment_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view pif payment sync"
ON public.pif_payment_sync FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pif_payment_sync_updated_at
BEFORE UPDATE ON public.pif_payment_sync
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pif_payment_sync (id) VALUES (1) ON CONFLICT DO NOTHING;