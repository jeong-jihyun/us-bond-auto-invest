-- 사양서 4.4 Migration 003 — 투자계획
CREATE TABLE bond.investment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  broker_connection_id UUID NOT NULL REFERENCES bond.broker_connections(id),
  etf_id UUID NOT NULL REFERENCES bond.etf_products(id),
  monthly_amount NUMERIC(18,2) NOT NULL CHECK (monthly_amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  scheduled_day SMALLINT NOT NULL CHECK (scheduled_day BETWEEN 1 AND 31),
  order_unit VARCHAR(20) NOT NULL DEFAULT 'WHOLE_SHARE',
  order_type VARCHAR(20) NOT NULL DEFAULT 'LIMIT',
  cash_rollover BOOLEAN NOT NULL DEFAULT TRUE,
  timezone VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  next_scheduled_date DATE,            -- 사용자 시간대 기준 다음 예정일
  next_execution_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plans_schedule ON bond.investment_plans(status, next_execution_at);
CREATE INDEX idx_plans_user ON bond.investment_plans(user_id);
