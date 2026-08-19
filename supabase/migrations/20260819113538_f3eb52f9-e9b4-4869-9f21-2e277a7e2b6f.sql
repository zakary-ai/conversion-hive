ALTER TABLE public.dm_setters ADD COLUMN IF NOT EXISTS booking_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS dm_setters_booking_slug_key ON public.dm_setters (booking_slug);

CREATE TABLE public.dm_manager_availability_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id uuid NOT NULL REFERENCES public.dm_setters(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute <= 1440),
  end_minute integer NOT NULL CHECK (end_minute >= 0 AND end_minute <= 1440),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_manager_availability_rules TO authenticated;
GRANT ALL ON public.dm_manager_availability_rules TO service_role;
ALTER TABLE public.dm_manager_availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm manager availability admin all" ON public.dm_manager_availability_rules
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "dm manager availability own all" ON public.dm_manager_availability_rules
  FOR ALL TO authenticated
  USING (manager_id = public.get_dm_setter_id_for_user(auth.uid()))
  WITH CHECK (manager_id = public.get_dm_setter_id_for_user(auth.uid()));

CREATE TABLE public.dm_manager_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id uuid NOT NULL REFERENCES public.dm_setters(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  scheduled_at timestamp with time zone NOT NULL,
  timezone text,
  meeting_url text,
  status text NOT NULL DEFAULT 'scheduled',
  outcome text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX dm_manager_bookings_manager_idx ON public.dm_manager_bookings (manager_id, scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_manager_bookings TO authenticated;
GRANT ALL ON public.dm_manager_bookings TO service_role;
ALTER TABLE public.dm_manager_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm manager bookings admin all" ON public.dm_manager_bookings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "dm manager bookings own read" ON public.dm_manager_bookings
  FOR SELECT TO authenticated USING (manager_id = public.get_dm_setter_id_for_user(auth.uid()));
CREATE POLICY "dm manager bookings own update" ON public.dm_manager_bookings
  FOR UPDATE TO authenticated
  USING (manager_id = public.get_dm_setter_id_for_user(auth.uid()))
  WITH CHECK (manager_id = public.get_dm_setter_id_for_user(auth.uid()));
CREATE TRIGGER dm_manager_bookings_updated_at BEFORE UPDATE ON public.dm_manager_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS owner_manager_id uuid REFERENCES public.dm_setters(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.can_view_module(_owner uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _owner IS NULL
    OR public.has_role(_user, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.dm_setters s
      WHERE s.user_id = _user AND (s.id = _owner OR s.manager_id = _owner)
    )
$$;

DROP POLICY IF EXISTS "All view modules" ON public.modules;
CREATE POLICY "View permitted modules" ON public.modules
  FOR SELECT TO authenticated USING (public.can_view_module(owner_manager_id, auth.uid()));

CREATE POLICY "Managers insert own modules" ON public.modules
  FOR INSERT TO authenticated
  WITH CHECK (owner_manager_id IS NOT NULL AND owner_manager_id = public.get_dm_setter_id_for_user(auth.uid()));
CREATE POLICY "Managers update own modules" ON public.modules
  FOR UPDATE TO authenticated
  USING (owner_manager_id IS NOT NULL AND owner_manager_id = public.get_dm_setter_id_for_user(auth.uid()))
  WITH CHECK (owner_manager_id IS NOT NULL AND owner_manager_id = public.get_dm_setter_id_for_user(auth.uid()));
CREATE POLICY "Managers delete own modules" ON public.modules
  FOR DELETE TO authenticated
  USING (owner_manager_id IS NOT NULL AND owner_manager_id = public.get_dm_setter_id_for_user(auth.uid()));