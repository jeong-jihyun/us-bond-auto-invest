-- 4.1 표의 나머지 테이블: 분배금, 거래일, 알림, 감사 로그
CREATE TABLE bond.dividend_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  etf_id UUID NOT NULL REFERENCES bond.etf_products(id),
  amount NUMERIC(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  shares_held INTEGER NOT NULL,
  payment_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dividends_user ON bond.dividend_events(user_id, payment_date DESC);

CREATE TABLE bond.trading_calendars (
  market VARCHAR(10) NOT NULL,
  trading_date DATE NOT NULL,
  is_open BOOLEAN NOT NULL,
  note VARCHAR(60),
  PRIMARY KEY (market, trading_date)
);
INSERT INTO bond.trading_calendars (market, trading_date, is_open, note)
SELECT 'US', d::date, FALSE, 'NYSE holiday' FROM unnest(ARRAY[
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
  '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25'
]) AS d;

CREATE TABLE bond.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bond.users(id),
  type VARCHAR(30) NOT NULL,
  title VARCHAR(150) NOT NULL,
  content VARCHAR(500) NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON bond.notifications(user_id, created_at DESC);

CREATE TABLE bond.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES bond.users(id),
  actor VARCHAR(255) NOT NULL,
  action VARCHAR(60) NOT NULL,
  resource VARCHAR(150) NOT NULL,
  before JSONB,
  after JSONB,
  detail VARCHAR(500),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_user ON bond.audit_logs(user_id, timestamp DESC);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON bond.audit_logs
  FOR EACH ROW EXECUTE FUNCTION bond.forbid_change();
