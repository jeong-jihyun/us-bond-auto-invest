import Decimal from 'decimal.js';
import { BrokerAdapter, BrokerExecution } from './adapter';
import { etfByTicker } from '../core/etfs';
import { diffDays, isUsTradingDay } from '../core/calendar';
import { estimateCommission } from '../core/calc';

/** 테스트용 시나리오 — 설정 화면에서 바꿔 상태별 화면을 확인한다 */
export type MockScenario = 'NORMAL' | 'PARTIAL_FILL' | 'REJECT' | 'LOW_FUNDS';

interface MockOrder {
  brokerOrderId: string;
  idempotencyKey: string;
  ticker: string;
  quantity: number;
  limitPrice: string;
  status: 'Submitted' | 'Filled' | 'PartiallyFilled' | 'Cancelled' | 'Rejected';
  filledQuantity: number;
  averagePrice: string;
  executions: BrokerExecution[];
  placedOn: string;
}

export interface MockBrokerState {
  accountId: string;
  availableFunds: string;
  orders: Record<string, MockOrder>;
  positions: Record<string, { quantity: number; avgCost: string }>;
  seq: number;
  scenario: MockScenario;
}

export const initialMockBrokerState = (accountId: string): MockBrokerState => ({
  accountId,
  availableFunds: '10000.00',
  orders: {},
  positions: {},
  seq: 1000,
  scenario: 'NORMAL',
});

/** 날짜별로 항상 같은 값이 나오는 모의 시세 (실제 시세 아님) */
export function mockQuote(ticker: string, date: string) {
  const etf = etfByTicker(ticker);
  const t = diffDays('2026-01-01', date);
  const seed = ticker.charCodeAt(0) + ticker.charCodeAt(1) * 3;
  const wave = Math.sin(t / 23 + seed) + 0.6 * Math.sin(t / 7.3 + seed * 2) + 0.3 * Math.sin(t / 61);
  const drift = etf.assetCategory === 'SHORT_TERM' ? t * 0.00002 : 0; // 단기채는 분배 재투자분만큼 완만히 상승
  const last = new Decimal(etf.basePrice).times(1 + etf.volatility * wave + drift).toDecimalPlaces(2);
  const bid = last.minus('0.01');
  const ask = last.plus('0.01');
  return { bidPrice: bid.toFixed(2), askPrice: ask.toFixed(2), lastPrice: last.toFixed(2), timestamp: `${date}T15:30:00-05:00` };
}

/**
 * Paper Trading 대신 쓰는 모의 브로커. 인터페이스는 실제 IBKR 어댑터와 같다.
 * 상태는 직렬화해 앱에 저장되므로 앱을 다시 열어도 주문·잔고가 유지된다.
 */
export class MockBrokerAdapter implements BrokerAdapter {
  constructor(public state: MockBrokerState, public today: string) {}

  async connect(accountId: string) {
    return accountId === this.state.accountId;
  }

  async getAccountBalance(_accountId: string) {
    // LOW_FUNDS 시나리오: 계좌에 $50만 있는 것처럼 응답
    const funds = this.state.scenario === 'LOW_FUNDS' ? Decimal.min(this.state.availableFunds, 50).toFixed(2) : this.state.availableFunds;
    return { availableFunds: funds, currency: 'USD' };
  }

  async getMarketPrice(ticker: string) {
    return mockQuote(ticker, this.today);
  }

  async placeLimitOrder(input: { accountId: string; ticker: string; quantity: number; limitPrice: string; idempotencyKey: string }) {
    // 멱등성: 같은 키로 다시 오면 새 주문을 만들지 않고 기존 주문을 돌려준다 (타임아웃 재시도 대비)
    const existing = Object.values(this.state.orders).find((o) => o.idempotencyKey === input.idempotencyKey);
    if (existing) return { brokerOrderId: existing.brokerOrderId, status: existing.status };

    const id = `MOCK-${this.state.accountId}-${++this.state.seq}`;
    const order: MockOrder = {
      brokerOrderId: id,
      idempotencyKey: input.idempotencyKey,
      ticker: input.ticker,
      quantity: input.quantity,
      limitPrice: input.limitPrice,
      status: 'Submitted',
      filledQuantity: 0,
      averagePrice: '0',
      executions: [],
      placedOn: this.today,
    };
    const cost = new Decimal(input.quantity).times(input.limitPrice);
    if (this.state.scenario === 'REJECT' || !isUsTradingDay(this.today) || cost.gt(this.state.availableFunds)) {
      order.status = 'Rejected';
    }
    this.state.orders[id] = order;
    return { brokerOrderId: id, status: order.status };
  }

  /** 상태 조회 시점에 체결을 진행시킨다 (실제로는 체결 이벤트 수신) */
  async getOrderStatus(brokerOrderId: string) {
    const o = this.state.orders[brokerOrderId];
    if (!o) throw new Error('ORDER_NOT_FOUND');
    if (o.status === 'Submitted') this.fill(o);
    return { status: o.status, filledQuantity: o.filledQuantity, averagePrice: o.averagePrice };
  }

  async getExecutions(brokerOrderId: string) {
    return this.state.orders[brokerOrderId]?.executions ?? [];
  }

  async getPositions(_accountId: string) {
    return Object.entries(this.state.positions).map(([ticker, p]) => ({ ticker, ...p }));
  }

  async cancelOrder(brokerOrderId: string) {
    const o = this.state.orders[brokerOrderId];
    if (!o) return false;
    if (o.status === 'Submitted') o.status = 'Cancelled';
    return true;
  }

  private fill(o: MockOrder) {
    const q = mockQuote(o.ticker, this.today);
    // 지정가 이하에서만 체결
    const fillPrice = Decimal.min(q.askPrice, o.limitPrice);
    const qty =
      this.state.scenario === 'PARTIAL_FILL' && o.quantity >= 2 ? Math.floor(o.quantity / 2) : o.quantity;
    const commission = estimateCommission(qty, fillPrice);
    const exec: BrokerExecution = {
      executionId: `${o.brokerOrderId}-E1`,
      quantity: qty,
      price: fillPrice.toFixed(2),
      commission: commission.toFixed(2),
      executedAt: `${this.today}T15:31:00-05:00`,
    };
    o.executions.push(exec);
    o.filledQuantity = qty;
    o.averagePrice = fillPrice.toFixed(2);
    o.status = qty === o.quantity ? 'Filled' : 'PartiallyFilled';

    this.state.availableFunds = new Decimal(this.state.availableFunds).minus(fillPrice.times(qty)).minus(commission).toFixed(2);
    const pos = this.state.positions[o.ticker] ?? { quantity: 0, avgCost: '0' };
    const newQty = pos.quantity + qty;
    const avg = new Decimal(pos.avgCost).times(pos.quantity).plus(fillPrice.times(qty)).dividedBy(newQty);
    this.state.positions[o.ticker] = { quantity: newQty, avgCost: avg.toDecimalPlaces(6).toString() };
  }
}

/** IBKR 주문 상태 → 앱 주문 상태 (ibkr.mapper.ts 역할) */
export function mapBrokerStatus(s: string, filled: number, requested: number) {
  switch (s) {
    case 'Filled':
      return 'FILLED' as const;
    case 'PartiallyFilled':
      return 'PARTIALLY_FILLED' as const;
    case 'Cancelled':
      return filled > 0 && filled < requested ? ('PARTIALLY_FILLED' as const) : ('CANCELLED' as const);
    case 'Rejected':
      return 'REJECTED' as const;
    default:
      return 'SUBMITTED' as const;
  }
}
