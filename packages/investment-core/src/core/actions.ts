// 앱(체험 모드)과 서버(API)가 똑같이 쓰는 상태 변경 함수.
// 모두 AppData를 직접 바꾼다. 서버는 DB 트랜잭션 안에서 불러온 AppData에 적용한 뒤 저장한다.
import Decimal from 'decimal.js';
import { AppData, audit, initialNextDate, newId, nextDueDate, planCash, processCycle, runDuePlans, CycleResult } from './engine';
import { etfByTicker } from './etfs';
import { D, money } from './money';
import { parseDate, scheduledDateFor } from './calendar';
import { initialMockBrokerState, MockScenario } from '../broker/mockBroker';

export const MONTHLY_LIMIT = 10000;
export const CONSENT_VERSION = '2026-11';

export function todayKST(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export const emptyData = (today = todayKST()): AppData => ({
  user: null,
  consents: [],
  brokerConnection: null,
  plans: [],
  cycles: [],
  ledger: [],
  orders: [],
  executions: [],
  holdings: [],
  dividends: [],
  dividendMonths: [],
  notifications: [],
  audit: [],
  today,
  broker: null,
  flags: { autoInvestEnabled: true, liveTradingEnabled: false },
  settings: { countryCode: 'KR', currency: 'USD', timezone: 'Asia/Seoul', mfaEnabled: false },
});

export function validateAmountDay(amount: string, day: number) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(amount).trim())) return '금액은 숫자로, 소수 둘째 자리까지 입력하세요';
  const a = D(amount);
  if (a.lt(1)) return '월 적립금은 $1 이상이어야 합니다';
  if (a.gt(MONTHLY_LIMIT)) return `월 한도는 $${MONTHLY_LIMIT.toLocaleString()} 입니다`;
  if (!Number.isInteger(day) || day < 1 || day > 31) return '날짜는 1~31일 중에서 고르세요';
  return null;
}

export function connectBroker(d: AppData, accountId?: string) {
  const acct = accountId ?? `DU${Math.floor(1000000 + Math.random() * 8999999)}`;
  d.brokerConnection = {
    id: d.brokerConnection?.id ?? newId('bc'), brokerCode: 'IBKR', externalAccountId: acct, environment: 'PAPER',
    connectionStatus: 'CONNECTED', createdAt: d.today,
  };
  if (!d.broker) d.broker = initialMockBrokerState(acct);
  else d.broker.accountId = acct;
  audit(d, 'BROKER_CONNECTED', 'broker_connections', `IBKR PAPER ${acct}`);
  return null;
}

export function disconnectBroker(d: AppData) {
  if (d.plans.some((p) => p.status === 'ACTIVE')) return '진행 중인 적립을 먼저 일시정지하거나 해지하세요';
  if (d.brokerConnection) d.brokerConnection.connectionStatus = 'DISCONNECTED';
  audit(d, 'BROKER_DISCONNECTED', 'broker_connections', '');
  return null;
}

export function acceptConsents(d: AppData) {
  d.consents = [
    { consentType: 'RISK_DISCLOSURE', version: CONSENT_VERSION, acceptedAt: d.today },
    { consentType: 'AUTO_ORDER', version: CONSENT_VERSION, acceptedAt: d.today },
  ];
  audit(d, 'CONSENT_ACCEPTED', 'user_consents', CONSENT_VERSION);
  return null;
}

export function createPlan(d: AppData, input: { ticker: string; amount: string; day: number }) {
  if (!d.user) return '로그인이 필요합니다';
  if (!d.brokerConnection || d.brokerConnection.connectionStatus !== 'CONNECTED') return '먼저 IBKR 계좌를 연결하세요';
  if (d.consents.length < 2) return '위험 고지와 자동주문 동의가 필요합니다';
  const err = validateAmountDay(input.amount, input.day);
  if (err) return err;
  const etf = etfByTicker(input.ticker);
  if (!etf || !etf.isActive) return '거래할 수 없는 ETF입니다';
  if (d.plans.some((p) => p.ticker === input.ticker && p.status !== 'CANCELLED')) return `${input.ticker} 적립이 이미 있습니다`;
  const plan = {
    id: newId('pln'), userId: d.user.id, brokerConnectionId: d.brokerConnection.id, etfId: etf.id, ticker: etf.ticker,
    monthlyAmount: money(input.amount), currency: 'USD' as const, frequency: 'MONTHLY' as const, scheduledDay: input.day,
    orderUnit: 'WHOLE_SHARE' as const, orderType: 'LIMIT' as const, cashRollover: true, timezone: d.settings.timezone,
    status: 'ACTIVE' as const, nextScheduledDate: initialNextDate(d.today, input.day), createdAt: d.today, updatedAt: d.today,
  };
  d.plans.unshift(plan);
  audit(d, 'PLAN_CREATED', plan.id, `${plan.ticker} $${plan.monthlyAmount} 매월 ${input.day}일`);
  d.notifications.unshift({
    id: newId('ntf'), type: 'INFO', title: `${plan.ticker} 적립 시작`,
    content: `매월 ${input.day}일 $${plan.monthlyAmount}. 첫 실행 ${plan.nextScheduledDate}`, createdAt: `${d.today}T09:00:00`, readAt: null,
  });
  return null;
}

const findPlan = (d: AppData, id: string) => d.plans.find((x) => x.id === id);

export function updatePlan(d: AppData, id: string, input: { amount: string; day: number }) {
  const p = findPlan(d, id);
  if (!p) return '적립을 찾을 수 없습니다';
  if (p.status === 'CANCELLED') return '해지된 적립은 바꿀 수 없습니다';
  const err = validateAmountDay(input.amount, input.day);
  if (err) return err;
  const before = `$${p.monthlyAmount} ${p.scheduledDay}일`;
  p.monthlyAmount = money(input.amount);
  if (p.scheduledDay !== input.day) {
    p.scheduledDay = input.day;
    if (p.nextScheduledDate) {
      const { y, m } = parseDate(p.nextScheduledDate);
      const cand = scheduledDateFor(y, m, input.day);
      p.nextScheduledDate = cand >= d.today ? cand : initialNextDate(d.today, input.day);
    }
  }
  p.updatedAt = d.today;
  audit(d, 'PLAN_UPDATED', id, `${before} → $${p.monthlyAmount} ${input.day}일`);
  return null;
}

export function pausePlan(d: AppData, id: string) {
  const p = findPlan(d, id);
  if (!p) return '적립을 찾을 수 없습니다';
  if (p.status !== 'ACTIVE') return '진행 중인 적립만 일시정지할 수 있습니다';
  p.status = 'PAUSED';
  p.updatedAt = d.today;
  audit(d, 'PLAN_PAUSED', id, p.ticker);
  return null;
}

export function resumePlan(d: AppData, id: string) {
  const p = findPlan(d, id);
  if (!p) return '적립을 찾을 수 없습니다';
  if (p.status !== 'PAUSED') return '일시정지된 적립만 재개할 수 있습니다';
  p.status = 'ACTIVE';
  p.nextScheduledDate = initialNextDate(d.today, p.scheduledDay);
  p.updatedAt = d.today;
  audit(d, 'PLAN_RESUMED', id, `다음 ${p.nextScheduledDate}`);
  return null;
}

export function cancelPlan(d: AppData, id: string) {
  const p = findPlan(d, id);
  if (!p) return '적립을 찾을 수 없습니다';
  if (p.status === 'CANCELLED') return null;
  const rest = planCash(d, id);
  if (rest.gt(0)) {
    d.ledger.push({
      id: newId('led'), userId: p.userId, investmentPlanId: id, cycleId: null, transactionType: 'WITHDRAW_ON_CANCEL',
      amount: money(rest.neg()), currency: 'USD', referenceId: 'CANCEL', createdAt: `${d.today}T09:00:00`,
    });
  }
  p.status = 'CANCELLED';
  p.nextScheduledDate = null;
  p.updatedAt = d.today;
  audit(d, 'PLAN_CANCELLED', id, `잔액 $${rest.toFixed(2)} 반환`);
  return null;
}

/** 가상 시간을 다음 적립일로 옮기고 그날까지 도래한 적립을 실행 (모의 환경 전용) */
export async function runNextDue(d: AppData): Promise<{ error: string | null; results: CycleResult[] }> {
  const next = nextDueDate(d);
  if (!next) return { error: '실행할 적립이 없습니다', results: [] };
  if (!d.flags.autoInvestEnabled) return { error: '자동매수가 꺼져 있습니다', results: [] };
  if (!d.brokerConnection || d.brokerConnection.connectionStatus !== 'CONNECTED') return { error: '계좌 연결이 필요합니다', results: [] };
  if (next > d.today) d.today = next;
  const results = await runDuePlans(d, d.today);
  return { error: null, results };
}

/** 가장 최근 실행된 달을 다시 실행 → 중복 차단 확인용 */
export async function rerunLastMonth(d: AppData, planId: string) {
  const plan = findPlan(d, planId);
  const last = d.cycles.find((c) => c.investmentPlanId === planId);
  if (!plan || !last) return { error: '아직 실행된 달이 없습니다', message: '' };
  const r = await processCycle(d, plan, last.scheduledDate);
  return { error: null, message: r.message };
}

export function setScenario(d: AppData, s: MockScenario) {
  if (!['NORMAL', 'PARTIAL_FILL', 'REJECT', 'LOW_FUNDS'].includes(s)) return '알 수 없는 시나리오';
  if (!d.broker) return '계좌 연결 후 사용할 수 있습니다';
  d.broker.scenario = s;
  audit(d, 'MOCK_SCENARIO_CHANGED', 'broker', s);
  return null;
}

export function setAutoInvest(d: AppData, v: boolean) {
  d.flags.autoInvestEnabled = v;
  audit(d, 'FLAG_CHANGED', 'AUTO_INVEST_ENABLED', String(v));
  return null;
}

export function addPaperFunds(d: AppData, amount: Decimal.Value = 1000) {
  if (!d.broker) return '계좌 연결 후 사용할 수 있습니다';
  d.broker.availableFunds = D(d.broker.availableFunds).plus(amount).toFixed(2);
  audit(d, 'PAPER_FUNDS_ADDED', 'broker', `+$${D(amount).toFixed(2)}`);
  return null;
}

export function updateSettings(d: AppData, p: Partial<AppData['settings']>) {
  const allowed: Partial<AppData['settings']> = {};
  if (p.countryCode) allowed.countryCode = String(p.countryCode).slice(0, 2).toUpperCase();
  if (p.timezone) allowed.timezone = String(p.timezone).slice(0, 60);
  if (typeof p.mfaEnabled === 'boolean') allowed.mfaEnabled = p.mfaEnabled;
  d.settings = { ...d.settings, ...allowed };
  if (d.user) {
    d.user.timezone = d.settings.timezone;
    d.user.countryCode = d.settings.countryCode;
  }
  audit(d, 'SETTINGS_UPDATED', 'users', JSON.stringify(allowed));
  return null;
}

export function markRead(d: AppData, id?: string) {
  d.notifications.forEach((n) => {
    if (!id || n.id === id) n.readAt = n.readAt ?? d.today;
  });
  return null;
}
