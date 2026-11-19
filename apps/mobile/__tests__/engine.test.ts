import Decimal from 'decimal.js';
import { AppData, planCash, processCycle, runDuePlans } from '../src/core/engine';
import { initialMockBrokerState } from '../src/broker/mockBroker';
import { InvestmentPlan } from '../src/core/types';

function setup(ticker = 'SHY', amount = '100.00', day = 10): { data: AppData; plan: InvestmentPlan } {
  const data: AppData = {
    user: { id: 'u1', email: 'a@b.c', countryCode: 'KR', timezone: 'Asia/Seoul', status: 'ACTIVE', createdAt: '' },
    consents: [], brokerConnection: { id: 'bc1', brokerCode: 'IBKR', externalAccountId: 'DU1', environment: 'PAPER', connectionStatus: 'CONNECTED', createdAt: '' },
    plans: [], cycles: [], ledger: [], orders: [], executions: [], holdings: [], dividends: [], dividendMonths: [],
    notifications: [], audit: [], today: '2026-11-19', broker: initialMockBrokerState('DU1'),
    flags: { autoInvestEnabled: true, liveTradingEnabled: false },
    settings: { countryCode: 'KR', currency: 'USD', timezone: 'Asia/Seoul', mfaEnabled: false },
  };
  const plan: InvestmentPlan = {
    id: 'p1', userId: 'u1', brokerConnectionId: 'bc1', etfId: 'x', ticker, monthlyAmount: amount, currency: 'USD',
    frequency: 'MONTHLY', scheduledDay: day, orderUnit: 'WHOLE_SHARE', orderType: 'LIMIT', cashRollover: true,
    timezone: 'Asia/Seoul', status: 'ACTIVE', nextScheduledDate: '2026-12-10', createdAt: '', updatedAt: '',
  };
  data.plans.push(plan);
  return { data, plan };
}

const reconcile = (data: AppData, planId: string) => {
  // 원장 합계 = 적립 - 체결금액 - 수수료
  const deposits = data.cycles.filter((c) => c.investmentPlanId === planId).reduce((a, c) => a.plus(c.depositAmount), new Decimal(0));
  const spent = data.executions.reduce((a, e) => a.plus(new Decimal(e.executionPrice).times(e.quantity)).plus(e.commission), new Decimal(0));
  expect(planCash(data, planId).toFixed(2)).toBe(deposits.minus(spent).toFixed(2));
  // 보유 수량 = 체결 수량 합
  const execQty = data.executions.reduce((a, e) => a + e.quantity, 0);
  expect(data.holdings.reduce((a, h) => a + h.quantity, 0)).toBe(execQty);
};

describe('자동매수 엔진', () => {
  it('같은 연월은 한 번만 실행 (사이클·주문 중복 0건)', async () => {
    const { data, plan } = setup();
    await processCycle(data, plan, '2026-12-10');
    const r = await processCycle(data, plan, '2026-12-10');
    expect(r.status).toBe('DUPLICATE');
    expect(data.cycles.length).toBe(1);
    expect(data.orders.length).toBe(1);
    expect(new Set(data.orders.map((o) => o.idempotencyKey)).size).toBe(data.orders.length);
  });

  it('12개월 실행 후 원장·보유 수량 대조 일치, 정수 주문만', async () => {
    const { data, plan } = setup('SGOV');
    await runDuePlans(data, '2027-11-30');
    expect(data.cycles.length).toBe(12);
    expect(data.orders.every((o) => Number.isInteger(o.requestedQuantity) && o.requestedQuantity > 0)).toBe(true);
    // SGOV ~$100: 첫 달 0주(이월), 이후 매달 거의 1주씩
    expect(data.cycles[data.cycles.length - 1].cycleStatus).toBe('CARRIED_OVER');
    reconcile(data, plan.id);
  });

  it('휴장일 예정이면 다음 거래일 실행', async () => {
    const { data, plan } = setup('SHY', '100.00', 26);
    await processCycle(data, plan, '2026-11-26'); // 추수감사절
    expect(data.cycles[0].executionDate).toBe('2026-11-27');
  });

  it('부분 체결: 체결분만 보유 반영, 나머지 예약 해제', async () => {
    const { data, plan } = setup('BND', '300.00');
    data.broker!.scenario = 'PARTIAL_FILL';
    await processCycle(data, plan, '2026-12-10');
    const o = data.orders[0];
    expect(o.orderStatus).toBe('PARTIALLY_FILLED');
    expect(o.filledQuantity).toBeLessThan(o.requestedQuantity);
    expect(data.holdings[0].quantity).toBe(o.filledQuantity);
    reconcile(data, plan.id);
  });

  it('거부: 예약 현금 해제 후 전액 이월', async () => {
    const { data, plan } = setup('SHY');
    data.broker!.scenario = 'REJECT';
    await processCycle(data, plan, '2026-12-10');
    expect(data.orders[0].orderStatus).toBe('REJECTED');
    expect(planCash(data, plan.id).toFixed(2)).toBe('100.00');
    expect(data.holdings.length).toBe(0);
  });

  it('계좌 잔액 부족: 주문 보류, 현금 이월', async () => {
    const { data, plan } = setup('SHY');
    data.broker!.scenario = 'LOW_FUNDS';
    await processCycle(data, plan, '2026-12-10');
    expect(data.orders[0].orderStatus).toBe('INSUFFICIENT_FUNDS');
    expect(data.cycles[0].cycleStatus).toBe('INSUFFICIENT_FUNDS');
    expect(planCash(data, plan.id).toFixed(2)).toBe('100.00');
  });

  it('자동매수 플래그가 꺼져 있으면 아무 것도 하지 않음', async () => {
    const { data } = setup();
    data.flags.autoInvestEnabled = false;
    const r = await runDuePlans(data, '2027-06-30');
    expect(r.length).toBe(0);
    expect(data.orders.length).toBe(0);
  });
});
