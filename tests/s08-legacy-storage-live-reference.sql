-- S08 TEST: read-only regression for legacy cross-owner Storage exception.
-- User must have both immutable grant and CURRENT BT attachment reference.
DO $catalog$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='s08_private.can_read_legacy_file(text)'::regprocedure
    AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'Legacy reader security mode unexpected'; END IF;
 IF has_function_privilege('anon','s08_private.can_read_legacy_file(text)','EXECUTE')
    OR has_table_privilege('authenticated','s08_private.storage_legacy_grants','SELECT')
 THEN RAISE EXCEPTION 'Legacy Storage permissions too broad'; END IF;
END
$catalog$;
BEGIN READ ONLY;
SELECT set_config('request.jwt.claim.sub',(
 SELECT user_id::text FROM s08_private.storage_legacy_grants LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $audit$
DECLARE p text;
BEGIN
 SELECT name INTO p FROM storage.objects
 WHERE bucket_id='wo-files' AND split_part(name,'/',1)<>auth.uid()::text LIMIT 1;
 IF p IS NULL THEN RAISE EXCEPTION 'Legacy attachment unexpectedly inaccessible'; END IF;
 IF s08_private.can_read_legacy_file(p) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Current BT legacy reference incorrectly denied'; END IF;
 IF s08_private.can_read_legacy_file('audit/unreferenced-file')
 THEN RAISE EXCEPTION 'Nonexistent unreferenced file allowed'; END IF;
 RAISE NOTICE 'S08 legacy reference authorization checked';
END
$audit$;
ROLLBACK;