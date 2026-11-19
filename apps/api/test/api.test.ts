// 통합 테스트: 실제 Postgres(로컬)에 마이그레이션을 적용한 DB로 API 전체 흐름을 검증한다.
// 실행: TEST_DATABASE_URL=postgresql://... npm -w @bond/api test
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/bond_auto';
process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.AUTO_INVEST_ENABLED = 'true';

import request from 'supertest';
import Decimal from 'decimal.js';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.factory';
import { closeDb, db } from '../src/db';
import { monthlyPlanScan } from '../src/jobs';
import { todayKST } from '@bond/investment-core';

let app: INestApplication;
let http: any;
const rnd = () => Math.random().toString(36).slice(2, 8);

async function newUser() {
  const email = `t-${rnd()}@example.com`;
  const r = await request(http).post('/api/v1/auth/signup').send({ email, password: 'password123' }).expect(201);
  return { email, token: r.body.token as string, auth: { Authorization: `Bearer ${r.body.token}` } };
}

async function readyUser(ticker = 'SHY', amount = '100.00', day = 10) {
  const u = await newUser();
  await request(http).post('/api/v1/broker/connections').set(u.auth).expect(201);
  await request(http).post('/api/v1/consents').set(u.auth).expect(201);
  const r = await request(http).post('/api/v1/investment-plans').set(u.auth)
    .send({ ticker, monthlyAmount: amount, scheduledDay: day, currency: 'USD', frequency: 'MONTHLY', orderUnit: 'WHOLE_SHARE', orderType: 'LIMIT', cashRollover: true, timezone: 'Asia/Seoul' })
    .expect(201);
  return { ...u, planId: r.body.state.plans[0].id as string };
}

async function reconcile(auth: any) {
  const s = (await request(http).get('/api/v1/state').set(auth).expect(200)).body.state;
  const ledgerSum = s.ledger.reduce((a: Decimal, l: any) => a.plus(l.amount), new Decimal(0));
  const deposits = s.cycles.reduce((a: Decimal, c: any) => a.plus(c.depositAmount), new Decimal(0));
  const spent = s.executions.reduce((a: Decimal, e: any) => a.plus(new Decimal(e.executionPrice).times(e.quantity)).plus(e.commission), new Decimal(0));
  const withdrawn = s.ledger.filter((l: any) => l.transactionType === 'WITHDRAW_ON_CANCEL').reduce((a: Decimal, l: any) => a.plus(l.amount), new Decimal(0));
  expect(ledgerSum.toFixed(2)).toBe(deposits.minus(spent).plus(withdrawn).toFixed(2));
  const execQty = s.executions.reduce((a: number, e: any) => a + e.quantity, 0);
  expect(s.holdings.reduce((a: number, h: any) => a + h.quantity, 0)).toBe(execQty);
  return s;
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  http = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

describe('인증', () => {
  it('가입·로그인·중복 가입·틀린 비밀번호', async () => {
    const u = await newUser();
    await request(http).post('/api/v1/auth/signup').send({ email: u.email, password: 'password123' }).expect(409);
    await request(http).post('/api/v1/auth/login').send({ email: u.email, password: 'wrong-pass' }).expect(401);
    const r = await request(http).post('/api/v1/auth/login').send({ email: u.email.toUpperCase(), password: 'password123' }).expect(200);
    expect(r.body.token).toBeTruthy();
    const me = await request(http).get('/api/v1/users/me').set({ Authorization: `Bearer ${r.body.token}` }).expect(200);
    expect(me.body.email).toBe(u.email);
    expect(me.body.flags.liveTradingEnabled).toBe(false);
  });

  it('토큰 없거나 위조면 401', async () => {
    await request(http).get('/api/v1/state').expect(401);
    await request(http).get('/api/v1/state').set({ Authorization: 'Bearer abc.def.ghi' }).expect(401);
  });

  it('짧은 비밀번호 400', async () => {
    await request(http).post('/api/v1/auth/signup').send({ email: `x-${rnd()}@example.com`, password: 'short' }).expect(400);
  });
});

describe('적립 흐름', () => {
  it('ETF 목록·상세(공개)', async () => {
    const l = await request(http).get('/api/v1/etfs').expect(200);
    expect(l.body.map((e: any) => e.ticker)).toEqual(['SGOV', 'SHY', 'IEF', 'TLT', 'BND']);
    const d = await request(http).get('/api/v1/etfs/tlt').expect(200);
    expect(d.body.history).toHaveLength(30);
    await request(http).get('/api/v1/etfs/XXX').expect(404);
  });

  it('계좌·동의 없이 적립 생성 불가, 잘못된 입력 400', async () => {
    const u = await newUser();
    const r = await request(http).post('/api/v1/investment-plans').set(u.auth).send({ ticker: 'SHY', monthlyAmount: '100', scheduledDay: 10 }).expect(400);
    expect(r.body.message).toContain('계좌');
    await request(http).post('/api/v1/broker/connections').set(u.auth).expect(201);
    await request(http).post('/api/v1/consents').set(u.auth).expect(201);
    await request(http).post('/api/v1/investment-plans').set(u.auth).send({ ticker: 'SHY', monthlyAmount: 'abc', scheduledDay: 10 }).expect(400);
    await request(http).post('/api/v1/investment-plans').set(u.auth).send({ ticker: 'SHY', monthlyAmount: '100', scheduledDay: 40 }).expect(400);
    await request(http).post('/api/v1/investment-plans').set(u.auth).send({ ticker: 'SHY', monthlyAmount: '20000', scheduledDay: 10 }).expect(400);
  });

  it('12개월 모의 실행 → 원장·보유 대조 일치, 정수 주문만', async () => {
    const u = await readyUser('SGOV');
    for (let i = 0; i < 12; i++) await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(201);
    const s = await reconcile(u.auth);
    expect(s.cycles).toHaveLength(12);
    expect(s.cycles[s.cycles.length - 1].cycleStatus).toBe('CARRIED_OVER'); // 첫 달 $100 < SGOV 1주
    expect(s.orders.every((o: any) => Number.isInteger(o.requestedQuantity) && o.requestedQuantity > 0)).toBe(true);
    const cyc = await request(http).get(`/api/v1/investment-plans/${u.planId}/cycles`).set(u.auth).expect(200);
    expect(cyc.body).toHaveLength(12);
    const port = await request(http).get('/api/v1/portfolio').set(u.auth).expect(200);
    expect(port.body.rows[0].ticker).toBe('SGOV');
  });

  it('같은 달 재실행은 중복 차단 (사이클·주문 증가 없음)', async () => {
    const u = await readyUser('SHY');
    await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(201);
    const r = await request(http).post(`/api/v1/simulation/rerun/${u.planId}`).set(u.auth).expect(201);
    expect(r.body.result.message).toContain('중복');
    const s = await reconcile(u.auth);
    expect(s.cycles).toHaveLength(1);
    expect(s.orders).toHaveLength(1);
  });

  it('동시에 10번 실행 요청 → 사이클은 연월마다 1건', async () => {
    const u = await readyUser('BND', '200.00');
    await Promise.all(Array.from({ length: 10 }, () => request(http).post('/api/v1/simulation/advance').set(u.auth)));
    const s = await reconcile(u.auth);
    const keys = s.cycles.map((c: any) => `${c.cycleYear}-${c.cycleMonth}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(s.orders.map((o: any) => o.idempotencyKey)).size).toBe(s.orders.length);
    const [{ n }] = await db().unsafe(`SELECT count(*)::int n FROM bond.investment_cycles WHERE investment_plan_id=$1`, [u.planId]);
    expect(n).toBe(s.cycles.length);
  });

  it('부분 체결·거부·잔액 부족 시나리오', async () => {
    const u = await readyUser('BND', '300.00');
    await request(http).patch('/api/v1/broker/scenario').set(u.auth).send({ scenario: 'PARTIAL_FILL' }).expect(200);
    await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(201);
    await request(http).patch('/api/v1/broker/scenario').set(u.auth).send({ scenario: 'REJECT' }).expect(200);
    await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(201);
    await request(http).patch('/api/v1/broker/scenario').set(u.auth).send({ scenario: 'LOW_FUNDS' }).expect(200);
    await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(201);
    const s = await reconcile(u.auth);
    expect(s.orders.map((o: any) => o.orderStatus)).toEqual(['INSUFFICIENT_FUNDS', 'REJECTED', 'PARTIALLY_FILLED']);
    const detail = await request(http).get(`/api/v1/orders/${s.orders[2].id}`).set(u.auth).expect(200);
    expect(detail.body.executions[0].quantity).toBe(s.orders[2].filledQuantity);
  });

  it('일시정지·재개·해지 (해지 시 대기 현금 반환 기록)', async () => {
    const u = await readyUser('TLT', '50.00');
    await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(201); // $50 < TLT → 이월
    await request(http).post(`/api/v1/investment-plans/${u.planId}/pause`).set(u.auth).expect(201);
    const r = await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(400);
    expect(r.body.message).toContain('없습니다');
    await request(http).post(`/api/v1/investment-plans/${u.planId}/resume`).set(u.auth).expect(201);
    await request(http).patch(`/api/v1/investment-plans/${u.planId}`).set(u.auth).send({ monthlyAmount: '150.00', scheduledDay: 31 }).expect(200);
    await request(http).post(`/api/v1/investment-plans/${u.planId}/cancel`).set(u.auth).expect(201);
    const s = await reconcile(u.auth);
    expect(s.plans[0].status).toBe('CANCELLED');
    expect(s.ledger.some((l: any) => l.transactionType === 'WITHDRAW_ON_CANCEL')).toBe(true);
  });
});

describe('보안·무결성', () => {
  it('다른 사용자의 주문·적립에 접근 불가', async () => {
    const a = await readyUser('SHY');
    await request(http).post('/api/v1/simulation/advance').set(a.auth).expect(201);
    const s = (await request(http).get('/api/v1/state').set(a.auth)).body.state;
    const b = await newUser();
    await request(http).get(`/api/v1/orders/${s.orders[0].id}`).set(b.auth).expect(404);
    await request(http).post(`/api/v1/investment-plans/${a.planId}/pause`).set(b.auth).expect(400);
    await request(http).get(`/api/v1/investment-plans/${a.planId}/cycles`).set(b.auth).expect(404);
  });

  it('원장·체결·감사 로그는 수정·삭제 불가', async () => {
    await expect(db().unsafe(`UPDATE bond.cash_ledger SET amount = 0`)).rejects.toThrow(/append-only/);
    await expect(db().unsafe(`DELETE FROM bond.order_executions`)).rejects.toThrow(/append-only/);
    await expect(db().unsafe(`DELETE FROM bond.audit_logs`)).rejects.toThrow(/append-only/);
  });

  it('DB 제약: 같은 계획·연월 사이클 직접 삽입도 거부', async () => {
    const u = await readyUser('SHY');
    await request(http).post('/api/v1/simulation/advance').set(u.auth).expect(201);
    const [c] = await db().unsafe(`SELECT * FROM bond.investment_cycles WHERE investment_plan_id=$1`, [u.planId]);
    await expect(db().unsafe(
      `INSERT INTO bond.investment_cycles (investment_plan_id, cycle_year, cycle_month, scheduled_date, deposit_amount, idempotency_key)
       VALUES ($1,$2,$3,$4,100,'other-key')`, [u.planId, c.cycle_year, c.cycle_month, c.scheduled_date])).rejects.toThrow(/duplicate key/);
  });
});

describe('스케줄러 (monthly-plan-scan)', () => {
  it('비밀키 없이 호출하면 401', async () => {
    await request(http).get('/api/v1/jobs/monthly-plan-scan').expect(401);
  });

  it('실제 날짜 기준: 오늘이 적립일인 계획을 동시에 2번 돌려도 1번만 실행', async () => {
    const day = Number(todayKST().slice(8, 10));
    const u = await readyUser('SHY', '100.00', day);
    const [r1, r2] = await Promise.all([monthlyPlanScan(), monthlyPlanScan()]);
    expect(r1).toBeTruthy();
    expect(r2).toBeTruthy();
    const [{ n }] = await db().unsafe(`SELECT count(*)::int n FROM bond.investment_cycles WHERE investment_plan_id=$1`, [u.planId]);
    expect(n).toBe(1);
    const res = await request(http).get('/api/v1/jobs/monthly-plan-scan').set({ Authorization: 'Bearer cron-test-secret' }).expect(200);
    expect(res.body.runDate).toBe(todayKST());
    const [{ m }] = await db().unsafe(`SELECT count(*)::int m FROM bond.investment_cycles WHERE investment_plan_id=$1`, [u.planId]);
    expect(m).toBe(1);
    await reconcile(u.auth);
  });
});
