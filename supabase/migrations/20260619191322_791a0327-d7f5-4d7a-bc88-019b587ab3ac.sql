
-- Singleton settings
CREATE TABLE public.b2c_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  days_out INTEGER NOT NULL DEFAULT 14,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT b2c_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.b2c_settings TO anon, authenticated;
GRANT ALL ON public.b2c_settings TO service_role;
ALTER TABLE public.b2c_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read b2c_settings" ON public.b2c_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage b2c_settings" ON public.b2c_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.b2c_settings (id, slot_minutes, days_out) VALUES (1, 30, 14) ON CONFLICT (id) DO NOTHING;

-- Weekly availability windows
CREATE TABLE public.b2c_availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.b2c_availability_rules TO anon, authenticated;
GRANT ALL ON public.b2c_availability_rules TO service_role;
ALTER TABLE public.b2c_availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read b2c_availability_rules" ON public.b2c_availability_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage b2c_availability_rules" ON public.b2c_availability_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
