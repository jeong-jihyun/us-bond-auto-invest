-- 사양서 4.3 Migration 002 — 사용자 및 브로커 연결 (+ 로그인·설정 컬럼)
CREATE TABLE bond.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  country_code CHAR(2) NOT NULL,
  timezone VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_invest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sim_date DATE,                       -- 모의 시간(가상 오늘). NULL이면 실제 날짜 사용
  dividend_months TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bond.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  consent_type VARCHAR(40) NOT NULL,
  version VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, consent_type, version)
);

CREATE TABLE bond.broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  broker_code VARCHAR(30) NOT NULL DEFAULT 'IBKR',
  external_account_id VARCHAR(100),
  connection_status VARCHAR(30) NOT NULL,
  environment VARCHAR(20) NOT NULL DEFAULT 'PAPER',
  encrypted_credentials BYTEA,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_broker_user ON bond.broker_connections(user_id);
