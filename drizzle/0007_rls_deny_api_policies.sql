-- RLS with no policies is a deny-all, but Security Advisor still flags it.
-- An explicit rejection policy makes that intent visible and clears the lint.
DO $$
DECLARE
  rel record;
  has_api_roles boolean;
BEGIN
  has_api_roles :=
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');

  FOR rel IN
    SELECT quote_ident(schemaname) AS schema_name, quote_ident(tablename) AS table_name
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s.%s ENABLE ROW LEVEL SECURITY', rel.schema_name, rel.table_name);
    EXECUTE format('DROP POLICY IF EXISTS no_api_access ON %s.%s', rel.schema_name, rel.table_name);
    IF has_api_roles THEN
      EXECUTE format(
        'CREATE POLICY no_api_access ON %s.%s FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        rel.schema_name,
        rel.table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY no_api_access ON %s.%s FOR ALL USING (false) WITH CHECK (false)',
        rel.schema_name,
        rel.table_name
      );
    END IF;
  END LOOP;
END $$;
