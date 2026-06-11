
CREATE TYPE public.application_status AS ENUM ('New','No Answer','Follow Up','Booked','Not Interested');
CREATE TYPE public.application_invest AS ENUM ('Yes','No','Maybe');
CREATE TYPE public.application_credit AS ENUM ('600-650','650-700','700-750','750-800','800-850');

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  why_remote_sales text NOT NULL,
  current_monthly_income text NOT NULL,
  desired_monthly_income text NOT NULL,
  open_to_invest public.application_invest NOT NULL,
  credit_score_range public.application_credit NOT NULL,
  status public.application_status NOT NULL DEFAULT 'New',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT full_name_len CHECK (char_length(full_name) BETWEEN 1 AND 200),
  CONSTRAINT phone_len CHECK (char_length(phone) BETWEEN 4 AND 40),
  CONSTRAINT why_len CHECK (char_length(why_remote_sales) BETWEEN 1 AND 2000),
  CONSTRAINT curinc_len CHECK (char_length(current_monthly_income) BETWEEN 1 AND 60),
  CONSTRAINT desinc_len CHECK (char_length(desired_monthly_income) BETWEEN 1 AND 60),
  CONSTRAINT notes_len CHECK (admin_notes IS NULL OR char_length(admin_notes) <= 5000)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT INSERT ON public.applications TO anon;
GRANT ALL ON public.applications TO service_role;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit an application"
  ON public.applications FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'New' AND admin_notes IS NULL);

CREATE POLICY "Admins can view applications"
  ON public.applications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update applications"
  ON public.applications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete applications"
  ON public.applications FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX applications_created_at_idx ON public.applications (created_at DESC);
CREATE INDEX applications_status_idx ON public.applications (status);
