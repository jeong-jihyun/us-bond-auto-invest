import Decimal from 'decimal.js';

/**
 * 사양서 7.3 정수 주식 계산.
 * availableCash - reserve 로 살 수 있는 정수 주식 수와 남는 현금을 돌려준다.
 * 음수·0 가격/현금은 0주.
 */
export function calculateWholeShares(availableCash: Decimal.Value, estimatedPrice: Decimal.Value, reserveAmount: Decimal.Value = 0) {
  const cash = new Decimal(availableCash);
  const p = new Decimal(estimatedPrice);
  const reserve = new Decimal(reserveAmount);
  const investable = cash.minus(reserve);

  if (cash.lte(0) || investable.lte(0) || p.lte(0)) {
    return { quantity: 0, remainingCash: Decimal.max(cash, 0) };
  }
  const quantity = investable.dividedToIntegerBy(p);
  const remainingCash = cash.minus(quantity.times(p));
  return { quantity: quantity.toNumber(), remainingCash };
}

/** IBKR Fixed 요금 근사: 주당 $0.005, 최소 $1, 주문금액의 1% 상한 — 모의용 */
export function estimateCommission(quantity: number, unitPrice: Decimal.Value) {
  if (quantity <= 0) return new Decimal(0);
  const raw = new Decimal(quantity).times('0.005');
  const cap = new Decimal(quantity).times(unitPrice).times('0.01');
  return Decimal.min(Decimal.max(raw, 1), Decimal.max(cap, 1)).toDecimalPlaces(2, Decimal.ROUND_UP);
}

/**
 * 수수료까지 감안한 최종 수량: 수수료 때문에 1주가 넘치면 한 주씩 줄인다.
 */
export function sizeOrder(availableCash: Decimal.Value, limitPrice: Decimal.Value) {
  const cash = new Decimal(availableCash);
  let { quantity } = calculateWholeShares(cash, limitPrice, 0);
  while (quantity > 0) {
    const commission = estimateCommission(quantity, limitPrice);
    const cost = new Decimal(quantity).times(limitPrice).plus(commission);
    if (cost.lte(cash)) return { quantity, commission, cost };
    quantity -= 1;
  }
  return { quantity: 0, commission: new Decimal(0), cost: new Decimal(0) };
}
