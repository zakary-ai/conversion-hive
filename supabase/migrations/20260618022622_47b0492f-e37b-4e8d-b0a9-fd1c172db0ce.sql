
-- 1. Add 'closer' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'closer';

-- 2. Extend applications with email + booking token
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS booking_token uuid NOT NULL DEFAULT gen_random_uuid();

-- 3. closers
CREATE TABLE IF NOT EXISTS public.closers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  zoom_user_email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closers TO authenticated;
GRANT ALL ON public.closers TO service_role;
ALTER TABLE public.closers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage closers" ON public.closers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Closers read self" ON public.closers FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER closers_updated BEFORE UPDATE ON public.closers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. closer_availability_rules
CREATE TABLE IF NOT EXISTS public.closer_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id uuid NOT NULL REFERENCES public.closers(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_availability_rules TO authenticated;
GRANT SELECT ON public.closer_availability_rules TO anon;
GRANT ALL ON public.closer_availability_rules TO service_role;
ALTER TABLE public.closer_availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage avail" ON public.closer_availability_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Closer manage own avail" ON public.closer_availability_rules FOR ALL TO authenticated
  USING (closer_id IN (SELECT id FROM public.closers WHERE user_id = auth.uid()))
  WITH CHECK (closer_id IN (SELECT id FROM public.closers WHERE user_id = auth.uid()));
CREATE POLICY "Public read avail" ON public.closer_availability_rules FOR SELECT TO anon USING (true);
CREATE INDEX IF NOT EXISTS idx_closer_avail_closer ON public.closer_availability_rules(closer_id);

-- 5. closer_bookings
CREATE TABLE IF NOT EXISTS public.closer_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  assigned_closer_id uuid REFERENCES public.closers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_assignment',
  zoom_join_url text,
  zoom_meeting_id text,
  applicant_name text NOT NULL,
  applicant_email text NOT NULL,
  applicant_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_bookings TO authenticated;
GRANT ALL ON public.closer_bookings TO service_role;
ALTER TABLE public.closer_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bookings" ON public.closer_bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Closers read own bookings" ON public.closer_bookings FOR SELECT TO authenticated
  USING (assigned_closer_id IN (SELECT id FROM public.closers WHERE user_id = auth.uid()));
CREATE TRIGGER closer_bookings_updated BEFORE UPDATE ON public.closer_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_closer_bookings_slot ON public.closer_bookings(slot_start);
CREATE INDEX IF NOT EXISTS idx_closer_bookings_assigned ON public.closer_bookings(assigned_closer_id);
CREATE INDEX IF NOT EXISTS idx_closer_bookings_application ON public.closer_bookings(application_id);

-- 6. Updated handle_new_user: grant 'closer' role + link record when email matches a closer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closer_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, company_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, COALESCE(NEW.raw_user_meta_data->>'company_name',''));

  SELECT id INTO v_closer_id
  FROM public.closers
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF v_closer_id IS NOT NULL THEN
    UPDATE public.closers SET user_id = NEW.id WHERE id = v_closer_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'closer'::public.app_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client'::public.app_role);
  END IF;

  RETURN NEW;
END;
$$;
