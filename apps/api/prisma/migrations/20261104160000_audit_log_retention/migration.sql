-- Audit log retention (owner answer q94, 2026-11-04; confirm in the legal review, q04).
-- audit_logs stays append-only: UPDATE is always rejected. DELETE is allowed only for the daily
-- retention job, which sets the transaction-local flag `gugu.audit_retention = 'on'`, and only for
-- rows older than 12 months (the floor of AUDIT_RETENTION_MONTHS; the job's default is 24). Any
-- other DELETE, including one with the flag on a younger row, still fails.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('gugu.audit_retention', true) = 'on'
     AND OLD."created_at" < now() - interval '12 months' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- CreateIndex (batched purge scans by age)
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
