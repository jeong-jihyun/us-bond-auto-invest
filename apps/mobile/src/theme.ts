// 디자인 시스템 v1 — 모든 화면이 이 토큰만 쓴다.
export const C = {
  navy: '#0B2545', // 히어로·헤더
  navy2: '#13315C',
  primary: '#1D4ED8', // 주요 버튼·링크
  primarySoft: '#E8EEFD',
  bg: '#F3F5F9',
  card: '#FFFFFF',
  line: '#E5E8EF',
  text: '#0F172A',
  sub: '#5B6475',
  faint: '#98A1B2',
  up: '#D92D20', // 이익(국내 관례: 빨강)
  down: '#1F6FEB', // 손실(파랑)
  ok: '#0E9F6E',
  okSoft: '#E3F7EF',
  warn: '#B54708',
  warnSoft: '#FEF3E2',
  danger: '#C4320A',
  dangerSoft: '#FDECEC',
  white: '#FFFFFF',
};

export const R = { sm: 8, md: 12, lg: 16, xl: 22 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const F = { h1: 26, h2: 20, h3: 17, body: 15, small: 13, tiny: 11 };

// 주문 상태 → 색/라벨. "주문 접수"를 "매수 완료"로 표시하지 않는다.
export const ORDER_STATUS_UI: Record<string, { label: string; fg: string; bg: string }> = {
  SCHEDULED: { label: '실행 예정', fg: C.sub, bg: C.bg },
  VALIDATING: { label: '주문 전 검증', fg: C.sub, bg: C.bg },
  SUBMITTED: { label: '주문 접수 · 미체결', fg: C.primary, bg: C.primarySoft },
  PARTIALLY_FILLED: { label: '부분 체결', fg: C.warn, bg: C.warnSoft },
  FILLED: { label: '매수 완료', fg: C.ok, bg: C.okSoft },
  INSUFFICIENT_FUNDS: { label: '잔액 부족', fg: C.danger, bg: C.dangerSoft },
  MARKET_CLOSED: { label: '휴장', fg: C.warn, bg: C.warnSoft },
  REJECTED: { label: '거부됨', fg: C.danger, bg: C.dangerSoft },
  CANCELLED: { label: '취소', fg: C.sub, bg: C.bg },
  FAILED: { label: '실패', fg: C.danger, bg: C.dangerSoft },
};

export const CYCLE_STATUS_UI: Record<string, { label: string; fg: string; bg: string }> = {
  SCHEDULED: { label: '예정', fg: C.sub, bg: C.bg },
  VALIDATING: { label: '검증 중', fg: C.sub, bg: C.bg },
  ORDERED: { label: '주문함', fg: C.primary, bg: C.primarySoft },
  COMPLETED: { label: '매수함', fg: C.ok, bg: C.okSoft },
  CARRIED_OVER: { label: '0주·이월', fg: C.warn, bg: C.warnSoft },
  INSUFFICIENT_FUNDS: { label: '잔액 부족', fg: C.danger, bg: C.dangerSoft },
  MARKET_CLOSED: { label: '휴장', fg: C.warn, bg: C.warnSoft },
  FAILED: { label: '실패', fg: C.danger, bg: C.dangerSoft },
};

export const LEDGER_UI: Record<string, string> = {
  DEPOSIT: '월 적립금',
  ORDER_RESERVE: '주문 예약',
  RESERVE_RELEASE: '예약 해제',
  BUY_FILL: '체결 금액',
  COMMISSION: '수수료',
  WITHDRAW_ON_CANCEL: '해지 반환',
};
