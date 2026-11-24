-- S10: SYNTHETIC local-only Supabase restore fixture for CI.
-- Never import real customer, invoice, auth, or file data into CI.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'atelier_jl_restore_test' THEN
  RAISE EXCEPTION 'REFUSED: fixture only for atelier_jl_restore_test';
 END IF;
 IF to_regclass('public.garage_data') IS NOT NULL THEN
  RAISE EXCEPTION 'REFUSED: fixture must start in a blank database';
 END IF;
END $guard$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY
);
CREATE TABLE storage.objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bucket_id text NOT NULL,
 name text NOT NULL,
 owner_id text,
 UNIQUE (bucket_id,name)
);
CREATE TABLE public.garage_data(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garage_data ENABLE ROW LEVEL SECURITY;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO public.garage_data(user_id,data)
SELECT '00000000-0000-4000-8000-000000000001'::uuid,
 jsonb_build_object(
  'clients',(SELECT jsonb_agg(jsonb_build_object('id','CL-'||n))
              FROM generate_series(1,42) n),
  'workorders',(SELECT jsonb_agg(jsonb_build_object(
   'id','BT-'||n,
   'attachments',CASE WHEN n<=49 THEN
     jsonb_build_array(jsonb_build_object('path',
       'clients/fixture-'||lpad(n::text,3,'0')))
   ELSE '[]'::jsonb END
  )) FROM generate_series(1,88) n),
  'invoices',(SELECT jsonb_agg(jsonb_build_object('id','INV-'||n,
   'amount',CASE WHEN n=1 THEN 0 ELSE 12.34 END))
   FROM generate_series(1,87) n)
 );
INSERT INTO storage.objects(bucket_id,name,owner_id)
SELECT 'wo-files','clients/fixture-'||lpad(n::text,3,'0'),
 '00000000-0000-4000-8000-000000000001'
FROM generate_series(1,55) n;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.garage_data)<>1
  OR (SELECT count(*) FROM auth.users)<>1
  OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55
 THEN RAISE EXCEPTION 'Synthetic fixture incomplete'; END IF;
END $check$;
