-- Preparation only: no job, secret value or outbound request is created here.
-- Apply separately after environment/backup/permission review.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('vault.decrypted_secrets') IS NULL
    OR pg_catalog.to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'Mock scheduler prerequisites are unavailable' USING ERRCODE='55000';
  END IF;
  -- Refuse rather than changing permissions on other users of Vault.
  IF pg_catalog.has_schema_privilege('anon','vault','USAGE')
    OR pg_catalog.has_schema_privilege('authenticated','vault','USAGE')
    OR pg_catalog.has_table_privilege('anon','vault.decrypted_secrets','SELECT')
    OR pg_catalog.has_table_privilege('authenticated','vault.decrypted_secrets','SELECT') THEN
    RAISE EXCEPTION 'Mock scheduler requires private Vault access' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
    WHERE n.nspname='mock_exam_private' AND r.rolname<>'postgres') THEN
    RAISE EXCEPTION 'Mock scheduler schema owner is unexpected' USING ERRCODE='42501';
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS mock_exam_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA mock_exam_private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA mock_exam_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Only this named, postgres-owned job's finished history; never business rows.
CREATE OR REPLACE FUNCTION mock_exam_private.cleanup_run_details()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM cron.job_run_details d
  USING cron.job j
  WHERE d.jobid=j.jobid
    AND j.jobname='kakomonkun-monthly-mock-tick'
    AND j.username='postgres'
    AND j.database=pg_catalog.current_database()
    AND j.command='select mock_exam_private.dispatch_tick();'
    AND d.end_time < pg_catalog.clock_timestamp() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$function$;
ALTER FUNCTION mock_exam_private.cleanup_run_details() OWNER TO postgres;
REVOKE ALL ON FUNCTION mock_exam_private.cleanup_run_details() FROM PUBLIC, anon, authenticated;

-- No arguments: callers cannot choose arbitrary targets or payloads to sign.
CREATE OR REPLACE FUNCTION mock_exam_private.dispatch_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  tick_url text;
  project_ref text;
  environment_name text;
  signing_secret text;
  settings_count integer;
  fixed_path constant text := '/api/internal/mock-exams/tick';
  fixed_body constant jsonb := '{"action":"tick"}'::jsonb;
  unix_seconds text;
  request_nonce text;
  canonical text;
  signature_hex text;
BEGIN
  SELECT count(*)::integer,
    max(s.decrypted_secret) FILTER (WHERE s.name='mock_exam_tick_url'),
    max(s.decrypted_secret) FILTER (WHERE s.name='mock_exam_project_ref'),
    max(s.decrypted_secret) FILTER (WHERE s.name='mock_exam_environment'),
    max(s.decrypted_secret) FILTER (WHERE s.name='mock_exam_job_secret')
  INTO settings_count,tick_url,project_ref,environment_name,signing_secret
  FROM vault.decrypted_secrets s
  WHERE s.name IN ('mock_exam_tick_url','mock_exam_project_ref','mock_exam_environment','mock_exam_job_secret');

  IF settings_count<>4 OR signing_secret IS NULL OR signing_secret !~ '^[a-zA-Z0-9_-]{32,256}$'
    OR tick_url IS NULL OR tick_url !~ '^https://[a-z0-9][a-z0-9.-]*[a-z0-9]/api/internal/mock-exams/tick$'
    OR tick_url ~ '^https://(localhost|[0-9.]+|[^/]+\.local)/'
    OR project_ref IS NULL OR environment_name IS NULL
    OR NOT ((project_ref='grzylombpqmidltnbwhx' AND environment_name='test')
         OR (project_ref='ckgoikdjhtklhbzdgxxs' AND environment_name='production')) THEN
    RAISE EXCEPTION 'Mock scheduler settings are missing or invalid' USING ERRCODE='22023';
  END IF;

  PERFORM mock_exam_private.cleanup_run_details();
  unix_seconds := floor(extract(epoch FROM pg_catalog.clock_timestamp()))::bigint::text;
  request_nonce := pg_catalog.gen_random_uuid()::text;
  -- pg_net encodes body::text as UTF-8; hash exactly those bytes, not compact JSON.
  canonical := pg_catalog.concat_ws(E'\n','POST',fixed_path,project_ref,environment_name,unix_seconds,request_nonce,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(fixed_body::text,'UTF8'),'sha256'),'hex'));
  signature_hex := pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(canonical,'UTF8'),
    pg_catalog.convert_to(signing_secret,'UTF8'),'sha256'),'hex');

  RETURN net.http_post(
    url := tick_url, body := fixed_body, params := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object(
      'content-type','application/json','x-mock-time',unix_seconds,'x-mock-nonce',request_nonce,
      'x-mock-project',project_ref,'x-mock-environment',environment_name,'x-mock-signature',signature_hex),
    timeout_milliseconds := 55000
  );
END
$function$;
ALTER FUNCTION mock_exam_private.dispatch_tick() OWNER TO postgres;
REVOKE ALL ON FUNCTION mock_exam_private.dispatch_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA mock_exam_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mock_exam_private FROM PUBLIC, anon, authenticated;
