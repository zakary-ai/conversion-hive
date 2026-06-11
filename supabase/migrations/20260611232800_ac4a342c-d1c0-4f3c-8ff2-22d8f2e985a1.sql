CREATE TABLE public.module_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_notes TO authenticated;
GRANT ALL ON public.module_notes TO service_role;

ALTER TABLE public.module_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own module notes"
  ON public.module_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_module_notes_updated_at
  BEFORE UPDATE ON public.module_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();