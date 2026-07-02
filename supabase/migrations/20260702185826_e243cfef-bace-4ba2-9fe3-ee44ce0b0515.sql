
DROP POLICY IF EXISTS "dm-uploads self write" ON storage.objects;
DROP POLICY IF EXISTS "dm-uploads self read" ON storage.objects;

CREATE POLICY "dm-uploads self write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dm-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "dm-uploads self read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dm-uploads' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
