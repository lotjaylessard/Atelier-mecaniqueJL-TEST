-- S08 TEST: converted_bt_id stores BT NUMBER, not internal workorder id.
-- Read-only integrity assertion on quote-to-workorder cross links.
DO $audit$
DECLARE missing_count integer; checked_count integer;
BEGIN
WITH converted AS (
 SELECT q.id,q.quote_number,q.converted_bt_id,d.data
 FROM public.garage_quotes q
 JOIN public.garage_data d ON d.user_id=q.user_id AND d.garage_id=q.garage_id
 WHERE q.converted_bt_id IS NOT NULL
), matched AS (
 SELECT c.id,
 EXISTS(
   SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.data->'workorders')='array' THEN c.data->'workorders' ELSE '[]'::jsonb END) w
   WHERE w->>'number'=c.converted_bt_id::text
     AND w->>'sourceQuoteId'=c.id::text
     AND w->>'sourceQuoteNumber'=c.quote_number
 ) AS valid_link
 FROM converted c
)
SELECT count(*),count(*) FILTER(WHERE NOT valid_link) INTO checked_count,missing_count FROM matched;
IF missing_count>0 THEN
 RAISE EXCEPTION '% of % converted quote-workorder links invalid',missing_count,checked_count;
END IF;
RAISE NOTICE 'S08 verified % converted quote-to-BT-number cross-links',checked_count;
END $audit$;