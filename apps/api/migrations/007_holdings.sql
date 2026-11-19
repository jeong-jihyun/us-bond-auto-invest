-- 사양서 4.8 Migration 007 — 보유 자산
CREATE TABLE bond.holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  etf_id UUID NOT NULL REFERENCES bond.etf_products(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  average_price NUMERIC(18,6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, etf_id)
);
