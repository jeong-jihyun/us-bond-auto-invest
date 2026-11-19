// 사용자 1명의 데이터를 DB ↔ AppData(엔진이 쓰는 모양)로 옮긴다.
// 흐름: 트랜잭션 시작 → 사용자 잠금 → 불러오기 → 엔진/액션 적용 → 바뀐 것만 저장 → 커밋
// 중복 실행은 (1) 사용자 잠금 (2) idempotency_key UNIQUE (3) 체결 ID UNIQUE 로 3중 차단한다.
import { AppData, ETF_SEED, todayKST, etfByTicker } from '@bond/investment-core';
import { config } from './config';
import { db, Tx } from './db';

const KST = (col: string, as: string) => `to_char(${col} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS') AS ${as}`;

/** 엔진 시각 문자열 → timestamptz 입력값 (오프셋 없으면 한국 시각) */
export function toTs(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.length === 10 ? `${s}T00:00:00` : s;
  return /([+-]\d{2}:\d{2}|Z)$/.test(v) ? v : `${v}+09:00`;
}

let etfIdCache: Map<string, string> | null = null; // ticker → uuid
export async function etfUuidMap(tx: Tx | ReturnType<typeof db>) {
  if (!etfIdCache) {
    const rows = await tx.unsafe(`SELECT id, ticker FROM bond.etf_products`);
    etfIdCache = new Map(rows.map((r: any) => [r.ticker, r.id]));
  }
  return etfIdCache;
}

export class NotFoundUser extends Error {}

export async function loadState(tx: Tx, userId: string): Promise<AppData> {
  const [u] = await tx.unsafe(
    `SELECT id, email, country_code, timezone, status, mfa_enabled, auto_invest_enabled, sim_date::text AS sim_date,
            dividend_months, to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS created
       FROM bond.users WHERE id = $1`, [userId]);
  if (!u) throw new NotFoundUser();
  const today = u.sim_date ?? todayKST();

  const [consents, bcs, broker, plans, cycles, ledger, orders, executions, holdings, dividends, notifications, auditRows] = await Promise.all([
    tx.unsafe(`SELECT consent_type, version, ${KST('accepted_at', 'accepted_at')} FROM bond.user_consents WHERE user_id=$1`, [userId]),
    tx.unsafe(`SELECT id, external_account_id, environment, connection_status, ${KST('created_at', 'created_at')}
                 FROM bond.broker_connections WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]),
    tx.unsafe(`SELECT account_id, available_funds::text, scenario, state FROM bond.mock_broker_accounts WHERE user_id=$1`, [userId]),
    tx.unsafe(`SELECT p.*, e.ticker, p.monthly_amount::text AS monthly_amount_s, p.next_scheduled_date::text AS next_s,
                      ${KST('p.created_at', 'created_s')}, ${KST('p.updated_at', 'updated_s')}
                 FROM bond.investment_plans p JOIN bond.etf_products e ON e.id = p.etf_id
                WHERE p.user_id=$1 ORDER BY p.created_at DESC`, [userId]),
    tx.unsafe(`SELECT c.*, c.scheduled_date::text AS sched_s, c.execution_date::text AS exec_s,
                      c.deposit_amount::text AS dep_s, c.previous_cash::text AS prev_s, c.available_cash::text AS avail_s,
                      ${KST('c.created_at', 'created_s')}
                 FROM bond.investment_cycles c JOIN bond.investment_plans p ON p.id = c.investment_plan_id
                WHERE p.user_id=$1 ORDER BY c.scheduled_date DESC, c.created_at DESC`, [userId]),
    tx.unsafe(`SELECT id, investment_plan_id, cycle_id, transaction_type, amount::text AS amount, currency, reference_id,
                      ${KST('created_at', 'created_s')}
                 FROM bond.cash_ledger WHERE user_id=$1 ORDER BY seq ASC`, [userId]),
    tx.unsafe(`SELECT o.*, o.limit_price::text AS limit_s, o.reserved_amount::text AS reserved_s, o.average_fill_price::text AS avg_s,
                      ${KST('o.submitted_at', 'submitted_s')}, ${KST('o.completed_at', 'completed_s')}, ${KST('o.created_at', 'created_s')}
                 FROM bond.investment_orders o WHERE o.user_id=$1 ORDER BY o.created_at DESC`, [userId]),
    tx.unsafe(`SELECT x.id, x.order_id, x.broker_execution_id, x.quantity, x.execution_price::text AS price_s, x.commission::text AS comm_s,
                      ${KST('x.executed_at', 'executed_s')}
                 FROM bond.order_executions x JOIN bond.investment_orders o ON o.id = x.order_id
                WHERE o.user_id=$1 ORDER BY x.executed_at ASC`, [userId]),
    tx.unsafe(`SELECT h.quantity, h.average_price::text AS avg_s, e.ticker, h.updated_at::date::text AS updated_s
                 FROM bond.holdings h JOIN bond.etf_products e ON e.id = h.etf_id WHERE h.user_id=$1`, [userId]),
    tx.unsafe(`SELECT d.id, e.ticker, d.amount::text AS amount, d.shares_held, d.payment_date::text AS pay_s
                 FROM bond.dividend_events d JOIN bond.etf_products e ON e.id = d.etf_id
                WHERE d.user_id=$1 ORDER BY d.payment_date DESC, d.created_at DESC`, [userId]),
    tx.unsafe(`SELECT id, type, title, content, ${KST('read_at', 'read_s')}, ${KST('created_at', 'created_s')}
                 FROM bond.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 150`, [userId]),
    tx.unsafe(`SELECT id, actor, action, resource, detail, ${KST('timestamp', 'ts')}
                 FROM bond.audit_logs WHERE user_id=$1 ORDER BY timestamp DESC LIMIT 60`, [userId]),
  ]);

  const bc = bcs[0];
  const b = broker[0];
  return {
    user: { id: u.id, email: u.email, countryCode: u.country_code, timezone: u.timezone, status: 'ACTIVE', createdAt: u.created },
    consents: consents.map((c: any) => ({ consentType: c.consent_type, version: c.version, acceptedAt: c.accepted_at })),
    brokerConnection: bc
      ? { id: bc.id, brokerCode: 'IBKR', externalAccountId: bc.external_account_id, environment: bc.environment,
          connectionStatus: bc.connection_status, createdAt: bc.created_at }
      : null,
    plans: plans.map((p: any) => ({
      id: p.id, userId: p.user_id, brokerConnectionId: p.broker_connection_id, etfId: etfByTicker(p.ticker).id, ticker: p.ticker,
      monthlyAmount: p.monthly_amount_s, currency: 'USD', frequency: 'MONTHLY', scheduledDay: p.scheduled_day,
      orderUnit: 'WHOLE_SHARE', orderType: 'LIMIT', cashRollover: p.cash_rollover, timezone: p.timezone, status: p.status,
      nextScheduledDate: p.next_s, createdAt: p.created_s, updatedAt: p.updated_s,
    })),
    cycles: cycles.map((c: any) => ({
      id: c.id, investmentPlanId: c.investment_plan_id, cycleYear: c.cycle_year, cycleMonth: c.cycle_month,
      scheduledDate: c.sched_s, executionDate: c.exec_s, depositAmount: c.dep_s, previousCash: c.prev_s, availableCash: c.avail_s,
      executedQuantity: c.executed_quantity, cycleStatus: c.cycle_status, idempotencyKey: c.idempotency_key,
      note: c.note ?? undefined, createdAt: c.created_s,
    })),
    ledger: ledger.map((l: any) => ({
      id: l.id, userId, investmentPlanId: l.investment_plan_id, cycleId: l.cycle_id, transactionType: l.transaction_type,
      amount: l.amount, currency: 'USD', referenceId: l.reference_id, createdAt: l.created_s,
    })),
    orders: orders.map((o: any) => ({
      id: o.id, cycleId: o.cycle_id, planId: o.investment_plan_id, userId, ticker: o.ticker, brokerOrderId: o.broker_order_id,
      idempotencyKey: o.idempotency_key, side: 'BUY', orderType: 'LIMIT', requestedQuantity: o.requested_quantity,
      limitPrice: o.limit_s, reservedAmount: o.reserved_s, filledQuantity: o.filled_quantity, averageFillPrice: o.avg_s,
      orderStatus: o.order_status, submittedAt: o.submitted_s, completedAt: o.completed_s, createdAt: o.created_s,
      message: o.message ?? undefined,
    })),
    executions: executions.map((x: any) => ({
      id: x.id, orderId: x.order_id, brokerExecutionId: x.broker_execution_id, quantity: x.quantity,
      executionPrice: x.price_s, commission: x.comm_s, executedAt: x.executed_s,
    })),
    holdings: holdings.map((h: any) => ({
      etfId: etfByTicker(h.ticker).id, ticker: h.ticker, quantity: h.quantity, averagePrice: h.avg_s, updatedAt: h.updated_s,
    })),
    dividends: dividends.map((d: any) => ({
      id: d.id, ticker: d.ticker, amount: d.amount, currency: 'USD', paymentDate: d.pay_s, sharesHeld: d.shares_held,
    })),
    dividendMonths: u.dividend_months ?? [],
    notifications: notifications.map((n: any) => ({
      id: n.id, type: n.type, title: n.title, content: n.content, createdAt: n.created_s, readAt: n.read_s,
    })),
    audit: auditRows.map((a: any) => ({
      id: a.id, actor: a.actor, action: a.action, resource: a.resource, detail: a.detail ?? '', timestamp: a.ts,
    })),
    today,
    broker: b
      ? { accountId: b.account_id, availableFunds: b.available_funds, scenario: b.scenario,
          orders: b.state?.orders ?? {}, positions: b.state?.positions ?? {}, seq: b.state?.seq ?? 1000 }
      : null,
    flags: { autoInvestEnabled: config.autoInvestEnabled && u.auto_invest_enabled, liveTradingEnabled: false },
    settings: { countryCode: u.country_code, currency: 'USD', timezone: u.timezone, mfaEnabled: u.mfa_enabled },
  } as AppData;
}

const byId = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/** before와 after를 비교해 새로 생긴 행은 INSERT, 바뀐 행은 UPDATE. 원장·체결·감사는 INSERT만 */
export async function saveState(tx: Tx, before: AppData, after: AppData) {
  const userId = after.user!.id;
  const etf = await etfUuidMap(tx);
  const etfUuid = (ticker: string) => {
    const id = etf.get(ticker);
    if (!id) throw new Error(`unknown ETF ${ticker}`);
    return id;
  };

  // users
  const userCols = {
    country_code: after.settings.countryCode, timezone: after.settings.timezone, mfa_enabled: after.settings.mfaEnabled,
    dividend_months: after.dividendMonths,
  };
  const beforeUserCols = {
    country_code: before.settings.countryCode, timezone: before.settings.timezone, mfa_enabled: before.settings.mfaEnabled,
    dividend_months: before.dividendMonths,
  };
  if (changed(userCols, beforeUserCols) || after.today !== before.today || after.flags.autoInvestEnabled !== before.flags.autoInvestEnabled) {
    await tx.unsafe(
      `UPDATE bond.users SET country_code=$2, timezone=$3, mfa_enabled=$4, dividend_months=$5,
              sim_date = CASE WHEN $6::date IS DISTINCT FROM sim_date AND $7 THEN $6::date ELSE sim_date END,
              auto_invest_enabled = CASE WHEN $8 THEN $9 ELSE auto_invest_enabled END
        WHERE id=$1`,
      [userId, userCols.country_code, userCols.timezone, userCols.mfa_enabled, userCols.dividend_months,
        after.today, after.today !== before.today,
        after.flags.autoInvestEnabled !== before.flags.autoInvestEnabled, after.flags.autoInvestEnabled],
    );
  }

  // consents
  for (const c of after.consents) {
    if (!before.consents.some((x) => x.consentType === c.consentType && x.version === c.version)) {
      await tx.unsafe(
        `INSERT INTO bond.user_consents (user_id, consent_type, version, accepted_at) VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`, [userId, c.consentType, c.version, toTs(c.acceptedAt)]);
    }
  }

  // broker connection
  const bc = after.brokerConnection;
  if (bc && changed(bc, before.brokerConnection)) {
    await tx.unsafe(
      `INSERT INTO bond.broker_connections (id, user_id, broker_code, external_account_id, connection_status, environment, created_at)
       VALUES ($1,$2,'IBKR',$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET external_account_id=EXCLUDED.external_account_id, connection_status=EXCLUDED.connection_status`,
      [bc.id, userId, bc.externalAccountId, bc.connectionStatus, bc.environment, toTs(bc.createdAt)]);
  }

  // mock broker
  if (after.broker && changed(after.broker, before.broker)) {
    const { accountId, availableFunds, scenario, orders, positions, seq } = after.broker;
    await tx.unsafe(
      `INSERT INTO bond.mock_broker_accounts (user_id, account_id, available_funds, scenario, state, updated_at)
       VALUES ($1,$2,$3,$4,$5::text::jsonb,NOW())
       ON CONFLICT (user_id) DO UPDATE SET account_id=EXCLUDED.account_id, available_funds=EXCLUDED.available_funds,
         scenario=EXCLUDED.scenario, state=EXCLUDED.state, updated_at=NOW()`,
      [userId, accountId, availableFunds, scenario, JSON.stringify({ orders, positions, seq })]);
  }

  // plans
  const bp = byId(before.plans);
  for (const p of after.plans) {
    const old = bp.get(p.id);
    if (!old) {
      await tx.unsafe(
        `INSERT INTO bond.investment_plans (id, user_id, broker_connection_id, etf_id, monthly_amount, scheduled_day, cash_rollover,
            timezone, status, next_scheduled_date, next_execution_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,$13)`,
        [p.id, userId, p.brokerConnectionId, etfUuid(p.ticker), p.monthlyAmount, p.scheduledDay, p.cashRollover, p.timezone,
          p.status, p.nextScheduledDate, toTs(p.nextScheduledDate), toTs(p.createdAt), toTs(p.updatedAt)]);
    } else if (changed(p, old)) {
      await tx.unsafe(
        `UPDATE bond.investment_plans SET monthly_amount=$2, scheduled_day=$3, status=$4, next_scheduled_date=$5::date,
            next_execution_at=$6, updated_at=$7 WHERE id=$1 AND user_id=$8`,
        [p.id, p.monthlyAmount, p.scheduledDay, p.status, p.nextScheduledDate, toTs(p.nextScheduledDate), toTs(p.updatedAt), userId]);
    }
  }

  // cycles (INSERT만 — 같은 연월이면 UNIQUE 위반으로 트랜잭션 전체가 취소된다)
  const bc2 = byId(before.cycles);
  for (const c of [...after.cycles].reverse()) {
    if (bc2.has(c.id)) continue;
    await tx.unsafe(
      `INSERT INTO bond.investment_cycles (id, investment_plan_id, cycle_year, cycle_month, scheduled_date, execution_date,
          deposit_amount, previous_cash, available_cash, executed_quantity, cycle_status, idempotency_key, note, created_at)
       VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [c.id, c.investmentPlanId, c.cycleYear, c.cycleMonth, c.scheduledDate, c.executionDate, c.depositAmount, c.previousCash,
        c.availableCash, c.executedQuantity, c.cycleStatus, c.idempotencyKey, c.note ?? null, toTs(c.createdAt)]);
  }

  // orders (주문 의도 먼저 기록 → 이후 상태 갱신)
  const bo = byId(before.orders);
  for (const o of [...after.orders].reverse()) {
    const old = bo.get(o.id);
    if (!old) {
      await tx.unsafe(
        `INSERT INTO bond.investment_orders (id, cycle_id, investment_plan_id, user_id, ticker, broker_order_id, idempotency_key,
            requested_quantity, limit_price, reserved_amount, filled_quantity, average_fill_price, order_status, message,
            submitted_at, completed_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [o.id, o.cycleId, o.planId, userId, o.ticker, o.brokerOrderId, o.idempotencyKey, o.requestedQuantity, o.limitPrice,
          o.reservedAmount, o.filledQuantity, o.averageFillPrice, o.orderStatus, o.message ?? null, toTs(o.submittedAt),
          toTs(o.completedAt), toTs(o.createdAt)]);
    } else if (changed(o, old)) {
      await tx.unsafe(
        `UPDATE bond.investment_orders SET broker_order_id=$2, filled_quantity=$3, average_fill_price=$4, order_status=$5,
            message=$6, submitted_at=$7, completed_at=$8 WHERE id=$1 AND user_id=$9`,
        [o.id, o.brokerOrderId, o.filledQuantity, o.averageFillPrice, o.orderStatus, o.message ?? null, toTs(o.submittedAt),
          toTs(o.completedAt), userId]);
    }
  }

  // executions (체결 ID UNIQUE)
  const bx = byId(before.executions);
  for (const x of after.executions) {
    if (bx.has(x.id)) continue;
    await tx.unsafe(
      `INSERT INTO bond.order_executions (id, order_id, broker_execution_id, quantity, execution_price, commission, executed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [x.id, x.orderId, x.brokerExecutionId, x.quantity, x.executionPrice, x.commission, toTs(x.executedAt)]);
  }

  // ledger (append-only)
  const bl = byId(before.ledger);
  for (const l of after.ledger) {
    if (bl.has(l.id)) continue;
    await tx.unsafe(
      `INSERT INTO bond.cash_ledger (id, user_id, investment_plan_id, cycle_id, transaction_type, amount, currency, reference_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'USD',$7,$8)`,
      [l.id, userId, l.investmentPlanId, l.cycleId, l.transactionType, l.amount, l.referenceId, toTs(l.createdAt)]);
  }

  // holdings
  for (const h of after.holdings) {
    const old = before.holdings.find((x) => x.ticker === h.ticker);
    if (old && !changed(old, h)) continue;
    await tx.unsafe(
      `INSERT INTO bond.holdings (user_id, etf_id, quantity, average_price, updated_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, etf_id) DO UPDATE SET quantity=EXCLUDED.quantity, average_price=EXCLUDED.average_price, updated_at=EXCLUDED.updated_at`,
      [userId, etfUuid(h.ticker), h.quantity, h.averagePrice, toTs(h.updatedAt)]);
  }

  // dividends
  const bd = byId(before.dividends);
  for (const d of after.dividends) {
    if (bd.has(d.id)) continue;
    await tx.unsafe(
      `INSERT INTO bond.dividend_events (id, user_id, etf_id, amount, shares_held, payment_date) VALUES ($1,$2,$3,$4,$5,$6::date)`,
      [d.id, userId, etfUuid(d.ticker), d.amount, d.sharesHeld, d.paymentDate]);
  }

  // notifications
  const bn = byId(before.notifications);
  for (const n of [...after.notifications].reverse()) {
    const old = bn.get(n.id);
    if (!old) {
      await tx.unsafe(
        `INSERT INTO bond.notifications (id, user_id, type, title, content, read_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [n.id, userId, n.type, n.title.slice(0, 150), n.content.slice(0, 500), toTs(n.readAt), toTs(n.createdAt)]);
    } else if (old.readAt !== n.readAt) {
      await tx.unsafe(`UPDATE bond.notifications SET read_at=$2 WHERE id=$1 AND user_id=$3`, [n.id, toTs(n.readAt), userId]);
    }
  }

  // audit (append-only)
  const ba = byId(before.audit);
  for (const a of [...after.audit].reverse()) {
    if (ba.has(a.id)) continue;
    await tx.unsafe(
      `INSERT INTO bond.audit_logs (id, user_id, actor, action, resource, detail, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.id, userId, a.actor, a.action, a.resource.slice(0, 150), (a.detail ?? '').slice(0, 500), toTs(a.timestamp)]);
  }
}

/**
 * 사용자 단위 작업: 같은 사용자에 대한 요청·스케줄러가 동시에 와도 한 번에 하나만 실행된다.
 * fn이 오류 문자열을 돌려주거나 예외를 던지면 아무것도 저장하지 않는다(롤백).
 */
export async function withUser<T>(userId: string, fn: (d: AppData) => Promise<T> | T) {
  return db().begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, [userId]);
    const before = await loadState(tx, userId);
    const after: AppData = JSON.parse(JSON.stringify(before));
    const result = await fn(after);
    if (typeof result === 'string') throw new ActionError(result);
    if (result && typeof result === 'object' && 'error' in (result as any) && (result as any).error) {
      throw new ActionError((result as any).error);
    }
    await saveState(tx, before, after);
    return { result, state: after };
  });
}

export class ActionError extends Error {}

export const ETF_TICKERS = ETF_SEED.map((e) => e.ticker);
