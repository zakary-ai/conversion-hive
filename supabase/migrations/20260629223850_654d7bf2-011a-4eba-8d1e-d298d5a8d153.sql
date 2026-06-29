
-- 1) Closers: B2B flag
ALTER TABLE public.closers
  ADD COLUMN IF NOT EXISTS b2b_active boolean NOT NULL DEFAULT false;

-- 2) Closer availability track (b2c | b2b)
ALTER TABLE public.closer_availability_rules
  ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'b2c';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'closer_availability_rules_track_check'
  ) THEN
    ALTER TABLE public.closer_availability_rules
      ADD CONSTRAINT closer_availability_rules_track_check CHECK (track IN ('b2c','b2b'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS closer_availability_rules_closer_track_idx
  ON public.closer_availability_rules (closer_id, track);

-- 3) Appointments: assigned closer for B2B routing
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS assigned_closer_id uuid REFERENCES public.closers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_assigned_closer_idx
  ON public.appointments (assigned_closer_id);
CREATE INDEX IF NOT EXISTS appointments_type_scheduled_idx
  ON public.appointments (type, scheduled_at);

-- Backfill: existing bookings that already have a meeting link were already "assigned"
UPDATE public.appointments
   SET status = 'assigned'
 WHERE type = 'booking'
   AND meeting_url IS NOT NULL
   AND (status IS NULL OR status NOT IN ('assigned','completed','cancelled'));

-- 4) B2B booking settings (mirror of b2c_settings)
CREATE TABLE IF NOT EXISTS public.b2b_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15,30,45,60,90,120)),
  days_out integer NOT NULL DEFAULT 14 CHECK (days_out BETWEEN 1 AND 180),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.b2b_settings TO authenticated;
GRANT ALL ON public.b2b_settings TO service_role;

ALTER TABLE public.b2b_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='b2b_settings' AND policyname='Authenticated read b2b_settings') THEN
    CREATE POLICY "Authenticated read b2b_settings" ON public.b2b_settings
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='b2b_settings' AND policyname='Admins insert b2b_settings') THEN
    CREATE POLICY "Admins insert b2b_settings" ON public.b2b_settings
      FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='b2b_settings' AND policyname='Admins update b2b_settings') THEN
    CREATE POLICY "Admins update b2b_settings" ON public.b2b_settings
      FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- Seed singleton row, copying from existing booking_settings.slot_minutes if present
INSERT INTO public.b2b_settings (id, slot_minutes, days_out)
SELECT 1, COALESCE((SELECT slot_minutes FROM public.booking_settings WHERE id = 1), 30), 14
ON CONFLICT (id) DO NOTHING;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_b2b_settings_updated_at ON public.b2b_settings;
CREATE TRIGGER trg_b2b_settings_updated_at
  BEFORE UPDATE ON public.b2b_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
