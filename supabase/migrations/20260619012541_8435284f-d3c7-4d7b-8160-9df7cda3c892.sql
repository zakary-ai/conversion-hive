ALTER TYPE public.application_credit ADD VALUE IF NOT EXISTS 'Below 600' BEFORE '600-650';
ALTER TABLE public.applications ALTER COLUMN why_remote_sales DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN open_to_invest DROP NOT NULL;