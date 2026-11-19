import Decimal from 'decimal.js';
import {
  AppNotification, AuditLog, BrokerConnection, CashLedgerEntry, DividendEvent, Holding, InvestmentCycle,
  InvestmentOrder, InvestmentPlan, LedgerType, OrderExecution, User, UserConsent,
} from './types';
import { D, money, roundUpToTick, sum } from './money';
import { sizeOrder } from './calc';
import { firstScheduledDate, isUsTradingDay, nextMonthScheduled, nextTradingDay, parseDate } from './calendar';
import { etfByTicker } from './etfs';
import { MockBrokerAdapter, MockBrokerState, mapBrokerStatus, mockQuote } from '../broker/mockBroker';

export interface Flags {
  autoInvestEnabled: boolean;
  liveTradingEnabled: false; // 이 앱에서는 항상 꺼짐
}

export interface AppData {
  user: User | null;
  consents: UserConsent[];
  brokerConnection: BrokerConnection | null;
  plans: InvestmentPlan[];
  cycles: InvestmentCycle[];
  ledger: CashLedgerEntry[];
  orders: InvestmentOrder[];
  executions: OrderExecution[];
  holdings: Holding[];
  dividends: DividendEvent[];
  dividendMonths: string[]; // 'YYYY-MM' (월 1회 지급 멱등성)
  notifications: AppNotification[];
  audit: AuditLog[];
  today: string; // 가상 날짜 (모의 시간)
  broker: MockBrokerState | null;
  flags: Flags;
  settings: { countryCode: string; currency: 'USD'; timezone: string; mfaEnabled: boolean };
}

/** UUID v4 (DB uuid 컬럼과 호환). 접두어 인자는 호출부 호환용으로만 남긴다. */
export const newId = (_prefix?: string) =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
const stamp = (date: string, hm = '09:00') => `${date}T${hm}:00`;

export function planCash(data: AppData, planId: string) {
  return sum(data.ledger.filter((l) => l.investmentPlanId === planId).map((l) => l.amount));
}

function ledger(data: AppData, plan: InvestmentPlan, type: LedgerType, amount: Decimal.Value, date: string, cycleId: string | null, ref: string | null) {
  data.ledger.push({
    id: newId('led'),
    userId: plan.userId,
    investmentPlanId: plan.id,
    cycleId,
    transactionType: type,
    amount: money(amount),
    currency: 'USD',
    referenceId: ref,
    createdAt: stamp(date, '09:30'),
  });
}

function notify(data: AppData, type: AppNotification['type'], title: string, content: string, date: string) {
  data.notifications.unshift({ id: newId('ntf'), type, title, content, createdAt: stamp(date, '10:00'), readAt: null });
}

export function audit(data: AppData, action: string, resource: string, detail: string) {
  data.audit.unshift({
    id: newId('aud'), actor: data.user?.email ?? 'system', action, resource, detail, timestamp: stamp(data.today, '00:00'),
  });
}

export const cycleKey = (planId: string, y: number, m: number) => `${planId}:${y}-${String(m).padStart(2, '0')}`;

/** 보유 자산 갱신 — 체결된 수량만 반영 */
function applyFill(data: AppData, ticker: string, qty: number, fillPrice: Decimal.Value, date: string) {
  const etf = etfByTicker(ticker);
  let h = data.holdings.find((x) => x.ticker === ticker);
  if (!h) {
    h = { etfId: etf.id, ticker, quantity: 0, averagePrice: '0', updatedAt: date };
    data.holdings.push(h);
  }
  const newQty = h.quantity + qty;
  const avg = D(h.averagePrice).times(h.quantity).plus(D(fillPrice).times(qty)).dividedBy(newQty);
  h.quantity = newQty;
  h.averagePrice = avg.toDecimalPlaces(6).toString();
  h.updatedAt = date;
}

/** 월 1회 분배금 (모의) — 계좌 현금으로 들어가며 적립 원장과는 분리 */
function payDividends(data: AppData, date: string) {
  const { y, m } = parseDate(date);
  const key = `${y}-${String(m).padStart(2, '0')}`;
  if (data.dividendMonths.includes(key) || !data.broker) return;
  data.dividendMonths.push(key);
  for (const h of data.holdings) {
    if (h.quantity <= 0) continue;
    const etf = etfByTicker(h.ticker);
    const px = mockQuote(h.ticker, date).lastPrice;
    const amt = D(px).times(h.quantity).times(etf.annualYield).dividedBy(12).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    if (amt.lte(0)) continue;
    data.dividends.unshift({ id: newId('div'), ticker: h.ticker, amount: money(amt), currency: 'USD', paymentDate: date, sharesHeld: h.quantity });
    data.broker.availableFunds = D(data.broker.availableFunds).plus(amt).toFixed(2);
    notify(data, 'DIVIDEND', `${h.ticker} 분배금 입금`, `${h.quantity}주 × 월 분배 → $${amt.toFixed(2)} (계좌 현금)`, date);
  }
}

export type CycleResult = { planId: string; ticker: string; status: string; quantity: number; message: string };

/**
 * 사양서 7.2 실행 순서를 한 사이클에 대해 수행한다.
 * 같은 계획·같은 연월은 idempotencyKey(UNIQUE)로 한 번만 처리된다.
 */
export async function processCycle(data: AppData, plan: InvestmentPlan, scheduledDate: string): Promise<CycleResult> {
  const { y, m } = parseDate(scheduledDate);
  const key = cycleKey(plan.id, y, m);

  // ② 중복 실행 차단
  if (data.cycles.some((c) => c.idempotencyKey === key)) {
    audit(data, 'CYCLE_DUPLICATE_BLOCKED', key, '이미 처리된 연월 — 새 사이클을 만들지 않음');
    return { planId: plan.id, ticker: plan.ticker, status: 'DUPLICATE', quantity: 0, message: '이미 실행된 달입니다 (중복 차단)' };
  }

  // ③ 미국 거래일 기준 실행일
  const execDate = nextTradingDay(scheduledDate);
  const broker = new MockBrokerAdapter(data.broker!, execDate);

  // ④ 이월 현금 + 당월 적립
  const previousCash = planCash(data, plan.id);
  const cycle: InvestmentCycle = {
    id: newId('cyc'),
    investmentPlanId: plan.id,
    cycleYear: y,
    cycleMonth: m,
    scheduledDate,
    executionDate: execDate,
    depositAmount: plan.monthlyAmount,
    previousCash: money(previousCash),
    availableCash: '0.00',
    executedQuantity: 0,
    cycleStatus: 'VALIDATING',
    idempotencyKey: key,
    createdAt: stamp(execDate),
  };
  if (execDate !== scheduledDate) cycle.note = `예정일 ${scheduledDate}은 미국 주말·휴장 → ${execDate} 실행`;
  data.cycles.unshift(cycle);
  ledger(data, plan, 'DEPOSIT', plan.monthlyAmount, execDate, cycle.id, key);
  const available = previousCash.plus(plan.monthlyAmount);
  cycle.availableCash = money(available);

  const finish = (status: InvestmentCycle['cycleStatus'], qty: number, message: string): CycleResult => {
    cycle.cycleStatus = status;
    cycle.executedQuantity = qty;
    cycle.availableCash = money(planCash(data, plan.id));
    plan.nextScheduledDate = nextMonthScheduled(scheduledDate, plan.scheduledDay);
    plan.updatedAt = stamp(execDate);
    return { planId: plan.id, ticker: plan.ticker, status, quantity: qty, message };
  };

  // ⑥ 가격 조회 및 지정가 (매도호가 + 0.1% 여유, tick 올림)
  const quote = await broker.getMarketPrice(plan.ticker);
  const limit = roundUpToTick(D(quote.askPrice).times('1.001'));

  // ⑦ 수수료 포함 정수 주식 수량
  const sized = sizeOrder(available, limit);
  if (sized.quantity === 0) {
    notify(data, 'CARRY_OVER', `${plan.ticker} 이번 달 0주 · 현금 이월`,
      `투자 가능 $${available.toFixed(2)} < 1주 $${limit.toFixed(2)}+수수료. 다음 달로 넘깁니다.`, execDate);
    return finish('CARRIED_OVER', 0, `1주 가격보다 적어 $${available.toFixed(2)} 이월`);
  }

  // ⑤ 계좌 주문 가능 금액 재확인 (제출 직전)
  const bal = await broker.getAccountBalance(data.brokerConnection!.externalAccountId);
  const orderKey = `${key}:BUY`;
  const order: InvestmentOrder = {
    id: newId('ord'),
    cycleId: cycle.id,
    planId: plan.id,
    userId: plan.userId,
    ticker: plan.ticker,
    brokerOrderId: null,
    idempotencyKey: orderKey,
    side: 'BUY',
    orderType: 'LIMIT',
    requestedQuantity: sized.quantity,
    limitPrice: limit.toFixed(2),
    reservedAmount: money(sized.cost),
    filledQuantity: 0,
    averageFillPrice: null,
    orderStatus: 'VALIDATING',
    submittedAt: null,
    completedAt: null,
    createdAt: stamp(execDate, '09:31'),
  };
  data.orders.unshift(order);

  if (D(bal.availableFunds).lt(sized.cost)) {
    order.orderStatus = 'INSUFFICIENT_FUNDS';
    order.completedAt = stamp(execDate, '09:31');
    order.message = `계좌 주문 가능 금액 $${bal.availableFunds} < 필요 $${sized.cost.toFixed(2)}`;
    notify(data, 'ERROR', `${plan.ticker} 매수 보류: 계좌 잔액 부족`, `${order.message}. 적립금은 이월됩니다.`, execDate);
    audit(data, 'ORDER_INSUFFICIENT_FUNDS', order.id, order.message);
    return finish('INSUFFICIENT_FUNDS', 0, '계좌 잔액 부족 — 이월');
  }

  // ⑧ 주문 의도 + 현금 예약 기록 후 제출
  ledger(data, plan, 'ORDER_RESERVE', sized.cost.neg(), execDate, cycle.id, orderKey);
  audit(data, 'ORDER_INTENT_CREATED', order.id, `${plan.ticker} ${sized.quantity}주 @${limit.toFixed(2)}`);

  // ⑨ 브로커 제출
  const placed = await broker.placeLimitOrder({
    accountId: data.brokerConnection!.externalAccountId,
    ticker: plan.ticker,
    quantity: sized.quantity,
    limitPrice: limit.toFixed(2),
    idempotencyKey: orderKey,
  });
  order.brokerOrderId = placed.brokerOrderId;
  order.submittedAt = stamp(execDate, '09:32');

  if (placed.status === 'Rejected') {
    const closed = !isUsTradingDay(execDate);
    order.orderStatus = closed ? 'MARKET_CLOSED' : 'REJECTED';
    order.completedAt = order.submittedAt;
    order.message = closed ? '거래소 휴장' : '브로커가 주문을 거부했습니다 (모의)';
    ledger(data, plan, 'RESERVE_RELEASE', sized.cost, execDate, cycle.id, orderKey);
    notify(data, 'ERROR', `${plan.ticker} 주문 거부`, `${order.message}. 예약 현금을 풀고 이월합니다.`, execDate);
    audit(data, 'ORDER_REJECTED', order.id, order.message);
    return finish('FAILED', 0, order.message);
  }
  order.orderStatus = 'SUBMITTED';
  notify(data, 'ORDER_SUBMITTED', `${plan.ticker} 주문 접수`, `${sized.quantity}주 지정가 $${limit.toFixed(2)} — 아직 체결 전입니다.`, execDate);
  audit(data, 'ORDER_SUBMITTED', order.id, placed.brokerOrderId);

  // ⑩ 체결·상태 동기화
  const st = await broker.getOrderStatus(placed.brokerOrderId);
  const execs = await broker.getExecutions(placed.brokerOrderId);
  ledger(data, plan, 'RESERVE_RELEASE', sized.cost, execDate, cycle.id, orderKey);
  let filled = 0;
  let filledValue = D(0);
  for (const e of execs) {
    if (data.executions.some((x) => x.brokerExecutionId === e.executionId)) continue; // UNIQUE: 중복 반영 방지
    data.executions.push({
      id: newId('exe'), orderId: order.id, brokerExecutionId: e.executionId, quantity: e.quantity,
      executionPrice: e.price, commission: e.commission, executedAt: e.executedAt,
    });
    ledger(data, plan, 'BUY_FILL', D(e.price).times(e.quantity).neg(), execDate, cycle.id, e.executionId);
    ledger(data, plan, 'COMMISSION', D(e.commission).neg(), execDate, cycle.id, e.executionId);
    applyFill(data, plan.ticker, e.quantity, e.price, execDate);
    filled += e.quantity;
    filledValue = filledValue.plus(D(e.price).times(e.quantity));
  }

  if (st.status === 'PartiallyFilled') {
    await broker.cancelOrder(placed.brokerOrderId); // 남은 수량은 장 마감 시 취소
  }
  order.filledQuantity = filled;
  order.averageFillPrice = filled > 0 ? filledValue.dividedBy(filled).toFixed(2) : null;
  order.orderStatus = mapBrokerStatus(st.status, filled, sized.quantity);
  order.completedAt = stamp(execDate, '15:31');
  if (order.orderStatus === 'PARTIALLY_FILLED') order.message = `${filled}/${sized.quantity}주 체결, 나머지 취소 · 예약금 해제`;

  // ⑪ 결과 알림
  notify(data, 'ORDER_FILLED', `${plan.ticker} ${filled}주 매수 완료`,
    `평균 $${order.averageFillPrice} · 남은 적립 현금 $${planCash(data, plan.id).toFixed(2)}`, execDate);
  audit(data, 'ORDER_FILLED', order.id, `${filled}주`);
  return finish('COMPLETED', filled, `${filled}주 체결`);
}

/** monthly-plan-scan: 오늘(가상)까지 도래한 모든 활성 계획 처리 */
export async function runDuePlans(data: AppData, upto: string) {
  const results: CycleResult[] = [];
  if (!data.flags.autoInvestEnabled || !data.broker || !data.brokerConnection) return results;
  // 날짜 순으로 처리해야 분배금·잔고 흐름이 맞는다
  for (let guard = 0; guard < 60; guard++) {
    const due = data.plans
      .filter((p) => p.status === 'ACTIVE' && p.nextScheduledDate && p.nextScheduledDate <= upto)
      .sort((a, b) => a.nextScheduledDate!.localeCompare(b.nextScheduledDate!));
    if (!due.length) break;
    const plan = due[0];
    payDividends(data, nextTradingDay(plan.nextScheduledDate!));
    results.push(await processCycle(data, plan, plan.nextScheduledDate!));
  }
  return results;
}

export function nextDueDate(data: AppData) {
  const dates = data.plans.filter((p) => p.status === 'ACTIVE' && p.nextScheduledDate).map((p) => p.nextScheduledDate!);
  return dates.sort()[0] ?? null;
}

export function initialNextDate(today: string, day: number) {
  return firstScheduledDate(today, day);
}

// ── 화면 계산용 요약 ──────────────────────────────
export function portfolioSummary(data: AppData) {
  const rows = data.holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const q = mockQuote(h.ticker, data.today);
      const cost = D(h.averagePrice).times(h.quantity);
      const value = D(q.lastPrice).times(h.quantity);
      return { ...h, lastPrice: q.lastPrice, cost, value, pnl: value.minus(cost), pnlPct: cost.gt(0) ? value.minus(cost).dividedBy(cost).times(100) : D(0) };
    });
  const holdingsValue = sum(rows.map((r) => r.value));
  const holdingsCost = sum(rows.map((r) => r.cost));
  const planCashTotal = sum(data.plans.filter((p) => p.status !== 'CANCELLED').map((p) => planCash(data, p.id)));
  const principal = sum(data.ledger.filter((l) => l.transactionType === 'DEPOSIT' || l.transactionType === 'WITHDRAW_ON_CANCEL').map((l) => l.amount));
  const dividends = sum(data.dividends.map((d) => d.amount));
  const evalTotal = holdingsValue.plus(planCashTotal);
  const pnl = evalTotal.minus(principal);
  return {
    rows, holdingsValue, holdingsCost, planCashTotal, principal, dividends, evalTotal, pnl,
    pnlPct: principal.gt(0) ? pnl.dividedBy(principal).times(100) : D(0),
  };
}
