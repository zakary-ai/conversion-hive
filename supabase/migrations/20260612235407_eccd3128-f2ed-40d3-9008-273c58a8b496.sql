-- Booking settings (singleton)
CREATE TABLE IF NOT EXISTS public.booking_settings (
  id int PRIMARY KEY DEFAULT 1,
  slot_minutes int NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15, 30, 45, 60, 90, 120)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.booking_settings TO authenticated;
GRANT ALL ON public.booking_settings TO service_role;

ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read booking settings" ON public.booking_settings;
CREATE POLICY "Authenticated read booking settings" ON public.booking_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins update booking settings" ON public.booking_settings;
CREATE POLICY "Admins update booking settings" ON public.booking_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert booking settings" ON public.booking_settings;
CREATE POLICY "Admins insert booking settings" ON public.booking_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.booking_settings (id, slot_minutes)
SELECT 1, 30 WHERE NOT EXISTS (SELECT 1 FROM public.booking_settings WHERE id = 1);

CREATE TRIGGER booking_settings_updated_at
  BEFORE UPDATE ON public.booking_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow 'no_show' outcome on appointments
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_outcome_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('closed', 'lost', 'no_show'));
