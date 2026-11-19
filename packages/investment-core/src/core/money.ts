import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const D = (v: Decimal.Value) => new Decimal(v);

/** 금액 직렬화: 소수 2자리 문자열 */
export const money = (v: Decimal.Value) => new Decimal(v).toFixed(2);
/** 가격 직렬화: 소수 6자리까지 (DB NUMERIC(18,6)) */
export const price = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(6).toString();

export const sum = (values: Decimal.Value[]) => values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));

/** 화면 표시용 $1,234.56 */
export function usd(v: Decimal.Value, opts: { sign?: boolean } = {}) {
  const d = new Decimal(v);
  const abs = d.abs().toFixed(2);
  const [i, f] = abs.split('.');
  const withComma = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = d.isNeg() ? '-' : opts.sign && d.gt(0) ? '+' : '';
  return `${sign}$${withComma}.${f}`;
}

export function pct(v: Decimal.Value, opts: { sign?: boolean } = { sign: true }) {
  const d = new Decimal(v);
  const sign = d.isNeg() ? '' : opts.sign && d.gt(0) ? '+' : '';
  return `${sign}${d.toFixed(2)}%`;
}

/** 최소 가격 단위(tick)로 올림 — 매수 지정가는 위로 맞춰야 체결 가능성이 유지된다 */
export function roundUpToTick(p: Decimal.Value, tick: Decimal.Value = '0.01') {
  const t = new Decimal(tick);
  return new Decimal(p).dividedBy(t).ceil().times(t);
}
