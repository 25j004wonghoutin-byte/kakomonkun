-- Keep the already-applied scheduler migration immutable.
-- PostgreSQL regex repetition bounds stop at 255; length256 needs a separate check.
DO $fix$
DECLARE
  function_sql text;
  obsolete_guard constant text := 'signing_secret !~ ''^[a-zA-Z0-9_-]{32,256}$''';
  corrected_guard constant text := '(pg_catalog.char_length(signing_secret) NOT BETWEEN 32 AND 256 OR signing_secret !~ ''^[a-zA-Z0-9_-]+$'')';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO STRICT function_sql
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
  WHERE n.nspname='mock_exam_private' AND p.proname='dispatch_tick'
    AND p.pronargs=0 AND p.prosecdef AND r.rolname='postgres'
    AND p.proconfig=ARRAY['search_path=pg_catalog'];
  IF (pg_catalog.length(function_sql)-pg_catalog.length(pg_catalog.replace(function_sql,obsolete_guard,'')))
    <> pg_catalog.length(obsolete_guard) THEN
    RAISE EXCEPTION 'Unexpected scheduler definition; secret-length fix stopped' USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(function_sql,obsolete_guard,corrected_guard);
END
$fix$;
REVOKE ALL ON FUNCTION mock_exam_private.dispatch_tick() FROM PUBLIC, anon, authenticated;
