-- Remove every policy that lets the public or logged-in users write to Storage.
-- The backend uploads and deletes photos with the service-role key, which
-- ignores these policies, so the app keeps working. Viewing is unaffected:
-- images are served through public bucket URLs.
-- Run in the Supabase SQL editor.

-- 1. Check: both buckets should say public = true (that's what serves image links).
SELECT id, public FROM storage.buckets;

-- 2. Drop all write policies (INSERT, UPDATE, DELETE, and ALL) on stored files.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- 3. Check: only SELECT (viewing) policies should remain.
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'storage' ORDER BY cmd;
