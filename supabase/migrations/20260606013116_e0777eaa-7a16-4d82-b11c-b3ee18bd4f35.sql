CREATE TABLE public.availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute)
);
GRANT SELECT ON public.availability_rules TO authenticated;
GRANT ALL ON public.availability_rules TO service_role;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view availability"
  ON public.availability_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage availability"
  ON public.availability_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));