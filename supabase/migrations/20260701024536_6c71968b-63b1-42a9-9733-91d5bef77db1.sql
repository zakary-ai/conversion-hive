
CREATE TABLE public.closer_availability_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line text NOT NULL CHECK (line IN ('b2b','b2c')),
  weekly jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closer_user_id, line)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_availability_declarations TO authenticated;
GRANT ALL ON public.closer_availability_declarations TO service_role;

ALTER TABLE public.closer_availability_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closers view own declaration"
  ON public.closer_availability_declarations FOR SELECT
  TO authenticated
  USING (closer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closers upsert own declaration"
  ON public.closer_availability_declarations FOR INSERT
  TO authenticated
  WITH CHECK (closer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closers update own declaration"
  ON public.closer_availability_declarations FOR UPDATE
  TO authenticated
  USING (closer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (closer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete declaration"
  ON public.closer_availability_declarations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_closer_availability_declarations_updated_at
  BEFORE UPDATE ON public.closer_availability_declarations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
