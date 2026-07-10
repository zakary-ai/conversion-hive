ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_role_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_role_check CHECK (role = ANY (ARRAY['setter'::text, 'closer'::text, 'manual'::text, 'dm_setter'::text, 'dm_manager'::text, 'closer_b2c'::text]));
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS deal_name text;