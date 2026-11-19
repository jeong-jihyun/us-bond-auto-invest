// 환경 변수 → 설정. 실거래 스위치는 이 버전에서 켤 수 없다.
const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : v === 'true');

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  cronSecret: process.env.CRON_SECRET ?? '',
  autoInvestEnabled: bool(process.env.AUTO_INVEST_ENABLED, false),
  liveTradingEnabled: bool(process.env.LIVE_TRADING_ENABLED, false),
  brokerProvider: process.env.BROKER_PROVIDER ?? 'MOCK',
  ibkrEnv: process.env.IBKR_ENV ?? 'PAPER',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
};

export function assertConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  if (!config.jwtSecret || config.jwtSecret.length < 16) throw new Error('JWT_SECRET (16+ chars) is required');
  if (config.liveTradingEnabled) throw new Error('LIVE_TRADING_ENABLED=true is not supported in this build (mock broker only)');
}
