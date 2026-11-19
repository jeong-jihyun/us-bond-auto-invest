import { calculateWholeShares, sizeOrder } from '../src/core/calc';

describe('사양서 11.1 정수 주식 계산', () => {
  it.each([
    ['100', '50', 2],
    ['100', '100', 1],
    ['100', '105', 0],
    ['200', '105', 1],
    ['220', '105', 2],
  ])('현금 $%s, 가격 $%s → %i주', (cash, price, qty) => {
    expect(calculateWholeShares(cash, price, 0).quantity).toBe(qty);
  });

  it('음수·0 현금과 가격은 0주', () => {
    expect(calculateWholeShares('-10', '50').quantity).toBe(0);
    expect(calculateWholeShares('0', '50').quantity).toBe(0);
    expect(calculateWholeShares('100', '0').quantity).toBe(0);
    expect(calculateWholeShares('100', '-5').quantity).toBe(0);
  });

  it('항상 정수 수량만 반환', () => {
    for (let c = 1; c < 1000; c += 37) {
      const q = calculateWholeShares(String(c) + '.37', '13.13').quantity;
      expect(Number.isInteger(q)).toBe(true);
    }
  });

  it('예약금(reserve)을 빼고 계산', () => {
    expect(calculateWholeShares('100', '50', '1').quantity).toBe(1);
  });

  it('사양서 7.4 현금 이월 예시 (가격 $105 고정)', () => {
    let cash = 0;
    const expected = [[0, 100], [1, 95], [1, 90], [1, 85]];
    for (const [q, rest] of expected) {
      cash += 100;
      const r = calculateWholeShares(cash, 105);
      expect(r.quantity).toBe(q);
      expect(r.remainingCash.toNumber()).toBe(rest);
      cash = r.remainingCash.toNumber();
    }
  });

  it('수수료 때문에 넘치면 한 주 줄인다', () => {
    // $100, 가격 $50: 2주면 $100 + 수수료 $1 > $100 → 1주
    expect(sizeOrder('100', '50').quantity).toBe(1);
    expect(sizeOrder('101', '50').quantity).toBe(2);
  });
});
