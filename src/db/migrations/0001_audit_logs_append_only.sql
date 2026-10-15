-- جدول audit_logs باید append-only باشد (هیچ UPDATE یا DELETE مجاز نیست).
-- اعمال: psql "$DATABASE_URL" -f src/db/migrations/0001_audit_logs_append_only.sql

CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'جدول audit_logs فقط افزودنی (append-only) است';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
