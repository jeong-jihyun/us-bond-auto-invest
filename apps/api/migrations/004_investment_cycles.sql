-- 사양서 4.5 Migration 004 — 월간 사이클 (연월당 1건: UNIQUE 2중 보호)
CREATE TABLE bond.investment_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_plan_id UUID NOT NULL REFERENCES bond.investment_plans(id),
  cycle_year SMALLINT NOT NULL,
  cycle_month SMALLINT NOT NULL CHECK (cycle_month BETWEEN 1 AND 12),
  scheduled_date DATE NOT NULL,
  execution_date DATE,
  deposit_amount NUMERIC(18,2) NOT NULL,
  previous_cash NUMERIC(18,2) NOT NULL DEFAULT 0,
  available_cash NUMERIC(18,2) NOT NULL DEFAULT 0,
  executed_quantity INTEGER NOT NULL DEFAULT 0,
  cycle_status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  note VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (investment_plan_id, cycle_year, cycle_month)
);
