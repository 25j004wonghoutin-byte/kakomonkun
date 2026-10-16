-- Apply only after verifying the explicit Supabase project and private bucket.
-- Restrict this new bucket even when existing PERMISSIVE policies are broad.
CREATE POLICY student_avatars_server_only
ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (bucket_id <> 'student-avatars')
WITH CHECK (bucket_id <> 'student-avatars');
