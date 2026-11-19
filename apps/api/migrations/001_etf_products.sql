-- 사양서 4.2 Migration 001 — ETF 상품 (bond 스키마)
CREATE SCHEMA IF NOT EXISTS bond;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE bond.etf_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  asset_category VARCHAR(40) NOT NULL,
  exchange_code VARCHAR(30),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  expense_ratio NUMERIC(12,8),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO bond.etf_products (ticker, name, asset_category, exchange_code, expense_ratio) VALUES
  ('SGOV', 'iShares 0-3 Month Treasury Bond ETF', 'SHORT_TERM', 'NYSE Arca', 0.0009),
  ('SHY',  'iShares 1-3 Year Treasury Bond ETF',  'SHORT_TERM', 'NASDAQ', 0.0015),
  ('IEF',  'iShares 7-10 Year Treasury Bond ETF', 'INTERMEDIATE', 'NASDAQ', 0.0015),
  ('TLT',  'iShares 20+ Year Treasury Bond ETF',  'LONG_TERM', 'NASDAQ', 0.0015),
  ('BND',  'Vanguard Total Bond Market ETF',      'AGGREGATE', 'NASDAQ', 0.0003);

CREATE TABLE bond.etf_market_prices (
  id BIGSERIAL PRIMARY KEY,
  etf_id UUID NOT NULL REFERENCES bond.etf_products(id),
  bid NUMERIC(18,6) NOT NULL,
  ask NUMERIC(18,6) NOT NULL,
  last NUMERIC(18,6) NOT NULL,
  price_date DATE NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'MOCK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (etf_id, price_date, source)
);
