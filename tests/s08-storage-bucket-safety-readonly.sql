-- S08 TEST: read-only Storage quota/safety posture audit.
-- No bucket settings, file bytes, or business data are modified.
DO $audit$
DECLARE
 b record;
 no_owner integer;
 no_size integer;
 invalid_size integer;
 cnt integer;
BEGIN
 SELECT id,public,file_size_limit,allowed_mime_types INTO b
 FROM storage.buckets WHERE id='wo-files';
 IF b.id IS NULL OR b.public IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'wo-files bucket missing or public';
 END IF;
 SELECT count(*),
   count(*) FILTER(WHERE owner_id IS NULL OR btrim(owner_id)=''),
   count(*) FILTER(WHERE coalesce(metadata->>'size','') !~ '^[0-9]+$'),
   count(*) FILTER(WHERE coalesce(metadata->>'size','') ~ '^[0-9]+$'
                          AND (metadata->>'size')::numeric<=0)
 INTO cnt,no_owner,no_size,invalid_size
 FROM storage.objects WHERE bucket_id='wo-files';
 IF no_owner>0 OR no_size>0 OR invalid_size>0 THEN
   RAISE EXCEPTION 'Storage metadata incomplete: % no owner, % no size, % zero-size of % files',
     no_owner,no_size,invalid_size,cnt;
 END IF;
 IF b.file_size_limit IS NULL THEN
   RAISE NOTICE 'S08 recommendation: Storage bucket has no bucket-specific file size limit';
 END IF;
 IF b.allowed_mime_types IS NULL THEN
   RAISE NOTICE 'S08 recommendation: Storage bucket has no allowed MIME type list';
 END IF;
 RAISE NOTICE 'S08 private Storage metadata verified for % files',cnt;
END $audit$;