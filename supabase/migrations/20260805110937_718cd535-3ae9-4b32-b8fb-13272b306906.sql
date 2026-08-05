-- 1. Personal booking slug for B2B setters
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS b2b_booking_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_b2b_booking_slug_uidx
  ON public.profiles (b2b_booking_slug) WHERE b2b_booking_slug IS NOT NULL;

-- Backfill for existing b2b setters: slugified name (or email local part) + short random suffix
UPDATE public.profiles p
SET b2b_booking_slug = (
  regexp_replace(
    lower(coalesce(nullif(btrim(p.full_name), ''), split_part(coalesce(p.email,'setter'), '@', 1))),
    '[^a-z0-9]+', '-', 'g'
  ) || '-' || substr(md5(p.user_id::text), 1, 4)
)
WHERE p.b2b_booking_slug IS NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id AND ur.role = 'b2b_setter'::public.app_role
  );

-- strip any leading/trailing dashes left by slugification
UPDATE public.profiles
SET b2b_booking_slug = btrim(b2b_booking_slug, '-')
WHERE b2b_booking_slug IS NOT NULL;

-- 2. New call outcome for "sent information email"
ALTER TYPE public.b2b_call_outcome ADD VALUE IF NOT EXISTS 'info_emailed';