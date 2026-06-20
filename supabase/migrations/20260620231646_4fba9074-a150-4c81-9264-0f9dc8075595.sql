ALTER TABLE public.closers DROP COLUMN IF EXISTS zoom_user_email;
ALTER TABLE public.closers ADD COLUMN IF NOT EXISTS zoom_account_id text;
ALTER TABLE public.closers ADD COLUMN IF NOT EXISTS zoom_client_id text;
ALTER TABLE public.closers ADD COLUMN IF NOT EXISTS zoom_client_secret text;