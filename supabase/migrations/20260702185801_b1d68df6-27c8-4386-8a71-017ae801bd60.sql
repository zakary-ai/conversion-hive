
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS dm_setter_id uuid NULL REFERENCES public.dm_setters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_applications_dm_setter ON public.applications(dm_setter_id) WHERE dm_setter_id IS NOT NULL;

ALTER TABLE public.closer_bookings
  ADD COLUMN IF NOT EXISTS dm_setter_id uuid NULL REFERENCES public.dm_setters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_closer_bookings_dm_setter ON public.closer_bookings(dm_setter_id) WHERE dm_setter_id IS NOT NULL;

-- Allow dm_setters row to exist before the user has signed up (linked later by handle_new_user)
ALTER TABLE public.dm_setters ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_closer_id uuid;
  v_b2b_closer_id uuid;
  v_dm_setter_id uuid;
  v_dm_is_manager boolean;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, company_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, COALESCE(NEW.raw_user_meta_data->>'company_name',''));

  SELECT id INTO v_closer_id FROM public.closers WHERE lower(email) = lower(NEW.email) LIMIT 1;
  SELECT id INTO v_b2b_closer_id FROM public.b2b_closers WHERE lower(email) = lower(NEW.email) LIMIT 1;
  SELECT id, is_manager INTO v_dm_setter_id, v_dm_is_manager FROM public.dm_setters WHERE lower(email) = lower(NEW.email) LIMIT 1;

  IF v_closer_id IS NOT NULL THEN
    UPDATE public.closers SET user_id = NEW.id WHERE id = v_closer_id;
  END IF;
  IF v_b2b_closer_id IS NOT NULL THEN
    UPDATE public.b2b_closers SET user_id = NEW.id WHERE id = v_b2b_closer_id;
  END IF;
  IF v_dm_setter_id IS NOT NULL THEN
    UPDATE public.dm_setters SET user_id = NEW.id WHERE id = v_dm_setter_id;
  END IF;

  IF v_dm_setter_id IS NOT NULL THEN
    IF v_dm_is_manager THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'dm_setter_manager'::public.app_role) ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'dm_setter'::public.app_role) ON CONFLICT DO NOTHING;
    END IF;
  ELSIF v_closer_id IS NOT NULL OR v_b2b_closer_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'closer'::public.app_role) ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client'::public.app_role) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
