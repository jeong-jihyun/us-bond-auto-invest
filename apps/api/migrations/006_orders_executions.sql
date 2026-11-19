-- 사양서 4.7 Migration 006 — 주문 및 체결
CREATE TABLE bond.investment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES bond.investment_cycles(id),
  investment_plan_id UUID NOT NULL REFERENCES bond.investment_plans(id),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  ticker VARCHAR(20) NOT NULL,
  broker_order_id VARCHAR(100) UNIQUE,
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  side VARCHAR(10) NOT NULL DEFAULT 'BUY',
  order_type VARCHAR(20) NOT NULL DEFAULT 'LIMIT',
  requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
  limit_price NUMERIC(18,6),
  reserved_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  filled_quantity INTEGER NOT NULL DEFAULT 0,
  average_fill_price NUMERIC(18,6),
  order_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  message VARCHAR(300),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_user ON bond.investment_orders(user_id, created_at DESC);

CREATE TABLE bond.order_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES bond.investment_orders(id),
  broker_execution_id VARCHAR(120) NOT NULL UNIQUE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  execution_price NUMERIC(18,6) NOT NULL,
  commission NUMERIC(18,6) NOT NULL DEFAULT 0,
  executed_at TIMESTAMPTZ NOT NULL
);
CREATE TRIGGER order_executions_append_only BEFORE UPDATE OR DELETE ON bond.order_executions
  FOR EACH ROW EXECUTE FUNCTION bond.forbid_change();
