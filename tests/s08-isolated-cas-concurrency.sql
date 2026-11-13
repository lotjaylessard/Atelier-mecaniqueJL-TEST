-- S08 TEST: isolated compare-and-swap and rollback regression.
-- Uses TEMP table only. No garage_data rows or credentials are read.
-- Sequential stale-writer simulation; NOT a two-connection contention test.
BEGIN;
CREATE TEMP TABLE s08_cas_sandbox (
  garage_id text PRIMARY KEY,
  version bigint NOT NULL,
  data jsonb NOT NULL
) ON COMMIT DROP;
INSERT INTO s08_cas_sandbox VALUES
  ('isolated-garage',4,'{"notes":[]}'::jsonb),
  ('separate-garage',9,'{"notes":[]}'::jsonb);
DO $audit$
DECLARE
  first_writer integer;
  stale_writer integer;
  isolated_writer integer;
  rollback_writer integer;
  version_after bigint;
  payload_after jsonb;
BEGIN
  -- Two clients both read version 4. Only first update can pass CAS.
  UPDATE s08_cas_sandbox
  SET version=5,data='{"notes":["writer-A"]}'::jsonb
  WHERE garage_id='isolated-garage' AND version=4;
  GET DIAGNOSTICS first_writer=ROW_COUNT;
  UPDATE s08_cas_sandbox
  SET version=5,data='{"notes":["writer-B"]}'::jsonb
  WHERE garage_id='isolated-garage' AND version=4;
  GET DIAGNOSTICS stale_writer=ROW_COUNT;
  SELECT version,data INTO version_after,payload_after
  FROM s08_cas_sandbox WHERE garage_id='isolated-garage';
  IF first_writer<>1 OR stale_writer<>0 OR version_after<>5
    OR payload_after<>'{"notes":["writer-A"]}'::jsonb THEN
    RAISE EXCEPTION 'CAS lost-update regression';
  END IF;

  -- Independent garages have independent versions.
  UPDATE s08_cas_sandbox SET version=10,data='{"notes":["other-garage"]}'::jsonb
  WHERE garage_id='separate-garage' AND version=9;
  GET DIAGNOSTICS isolated_writer=ROW_COUNT;
  IF isolated_writer<>1 OR
    (SELECT version FROM s08_cas_sandbox WHERE garage_id='isolated-garage')<>5
  THEN RAISE EXCEPTION 'Isolation between garage IDs failed'; END IF;

  -- A failed logical transaction must undo its earlier temporary write.
  BEGIN
    UPDATE s08_cas_sandbox SET version=6
    WHERE garage_id='isolated-garage' AND version=5;
    GET DIAGNOSTICS rollback_writer=ROW_COUNT;
    IF rollback_writer<>1 THEN
      RAISE EXCEPTION 'Rollback setup failed';
    END IF;
    RAISE EXCEPTION 'EXPECTED_ROLLBACK_SENTINEL';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'EXPECTED_ROLLBACK_SENTINEL' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT version FROM s08_cas_sandbox
      WHERE garage_id='isolated-garage')<>5 THEN
    RAISE EXCEPTION 'Failed transaction retained partial version update';
  END IF;
  RAISE NOTICE 'S08 CAS, stale writer, independent row and rollback checks passed';
END $audit$;
ROLLBACK;
