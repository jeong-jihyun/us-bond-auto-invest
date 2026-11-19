-- 모의 브로커 계좌 상태 (IBKR Paper 대체) + 작업 실행 기록
CREATE TABLE bond.mock_broker_accounts (
  user_id UUID PRIMARY KEY REFERENCES bond.users(id),
  account_id VARCHAR(30) NOT NULL,
  available_funds NUMERIC(18,2) NOT NULL,
  scenario VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 모의 주문·포지션
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bond.job_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(60) NOT NULL,
  run_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  users_processed INTEGER NOT NULL DEFAULT 0,
  cycles_created INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  detail JSONB
);

-- Supabase 공개 API(PostgREST)에 bond 스키마를 노출하지 않는다
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA bond FROM anon, authenticated;
  END IF;
END $$;
