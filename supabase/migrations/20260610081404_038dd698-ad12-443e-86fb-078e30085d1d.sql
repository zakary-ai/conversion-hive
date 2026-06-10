
CREATE POLICY "Authenticated can read module videos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'module-videos');
CREATE POLICY "Admins can upload module videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'module-videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update module videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'module-videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete module videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'module-videos' AND public.has_role(auth.uid(), 'admin'));
