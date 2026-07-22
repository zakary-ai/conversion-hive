
-- Clean up empty outbound message rows that are polluting threads
DELETE FROM public.ob_messages
WHERE COALESCE(NULLIF(body_html, ''), NULLIF(body_text, '')) IS NULL;

-- Per-setter conversation tags
CREATE TABLE public.ob_conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(setter_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_conversation_tags TO authenticated;
GRANT ALL ON public.ob_conversation_tags TO service_role;
ALTER TABLE public.ob_conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setters manage own tags"
  ON public.ob_conversation_tags FOR ALL TO authenticated
  USING (setter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (setter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ob_conversation_tag_assignments (
  conversation_id UUID NOT NULL REFERENCES public.ob_conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.ob_conversation_tags(id) ON DELETE CASCADE,
  setter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_conversation_tag_assignments TO authenticated;
GRANT ALL ON public.ob_conversation_tag_assignments TO service_role;
ALTER TABLE public.ob_conversation_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setters manage own tag assignments"
  ON public.ob_conversation_tag_assignments FOR ALL TO authenticated
  USING (setter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (setter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX ob_tag_assignments_conv_idx ON public.ob_conversation_tag_assignments(conversation_id);
CREATE INDEX ob_tag_assignments_tag_idx ON public.ob_conversation_tag_assignments(tag_id);
