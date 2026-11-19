-- 사양서 4.6 Migration 005 — 현금 원장 (append-only)
CREATE TABLE bond.cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  investment_plan_id UUID NOT NULL REFERENCES bond.investment_plans(id),
  cycle_id UUID REFERENCES bond.investment_cycles(id),
  transaction_type VARCHAR(30) NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  reference_id VARCHAR(150),
  seq BIGSERIAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_plan ON bond.cash_ledger(investment_plan_id, created_at);

-- 원장 수정·삭제 금지 (정정은 반대 기록으로)
CREATE OR REPLACE FUNCTION bond.forbid_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE TRIGGER cash_ledger_append_only BEFORE UPDATE OR DELETE ON bond.cash_ledger
  FOR EACH ROW EXECUTE FUNCTION bond.forbid_change();
