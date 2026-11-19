// 사양서 4장(DB) · 5.4(주문 상태)를 앱 안의 타입으로 옮긴 것.
// 금액·가격은 모두 문자열(Decimal 직렬화)로 보관한다 — 부동소수점 금지.

export type Money = string;

export type EtfCategory = 'SHORT_TERM' | 'INTERMEDIATE' | 'LONG_TERM' | 'AGGREGATE';

export interface EtfProduct {
  id: string;
  ticker: string;
  name: string;
  assetCategory: EtfCategory;
  exchangeCode: string;
  currency: 'USD';
  expenseRatio: string;
  duration: string; // 평균 듀레이션(년) – 설명용
  isActive: boolean;
  summary: string;
}

export interface User {
  id: string;
  email: string;
  countryCode: string;
  timezone: string;
  status: 'ACTIVE';
  createdAt: string;
}

export type ConsentType = 'RISK_DISCLOSURE' | 'AUTO_ORDER';
export interface UserConsent {
  consentType: ConsentType;
  version: string;
  acceptedAt: string;
}

export interface BrokerConnection {
  id: string;
  brokerCode: 'IBKR';
  externalAccountId: string;
  environment: 'PAPER' | 'LIVE';
  connectionStatus: 'CONNECTED' | 'DISCONNECTED';
  createdAt: string;
}

export type PlanStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface InvestmentPlan {
  id: string;
  userId: string;
  brokerConnectionId: string;
  etfId: string;
  ticker: string;
  monthlyAmount: Money;
  currency: 'USD';
  frequency: 'MONTHLY';
  scheduledDay: number; // 1~31
  orderUnit: 'WHOLE_SHARE';
  orderType: 'LIMIT';
  cashRollover: boolean;
  timezone: string;
  status: PlanStatus;
  nextScheduledDate: string | null; // YYYY-MM-DD (사용자 시간대 기준)
  createdAt: string;
  updatedAt: string;
}

export type CycleStatus =
  | 'SCHEDULED'
  | 'VALIDATING'
  | 'ORDERED'
  | 'COMPLETED'
  | 'CARRIED_OVER' // 0주 → 현금 이월
  | 'INSUFFICIENT_FUNDS'
  | 'MARKET_CLOSED'
  | 'FAILED';

export interface InvestmentCycle {
  id: string;
  investmentPlanId: string;
  cycleYear: number;
  cycleMonth: number;
  scheduledDate: string;
  executionDate: string | null;
  depositAmount: Money;
  previousCash: Money;
  availableCash: Money;
  executedQuantity: number;
  cycleStatus: CycleStatus;
  idempotencyKey: string; // UNIQUE
  note?: string;
  createdAt: string;
}

export type LedgerType =
  | 'DEPOSIT' // 월 적립금 (+)
  | 'ORDER_RESERVE' // 주문 예약 (-)
  | 'RESERVE_RELEASE' // 예약 해제 (+)
  | 'BUY_FILL' // 체결 금액 (-)
  | 'COMMISSION' // 수수료 (-)
  | 'WITHDRAW_ON_CANCEL'; // 해지 시 잔액 반환 (-)

export interface CashLedgerEntry {
  id: string;
  userId: string;
  investmentPlanId: string;
  cycleId: string | null;
  transactionType: LedgerType;
  amount: Money; // 부호 포함
  currency: 'USD';
  referenceId: string | null;
  createdAt: string; // 가상 날짜 + 시각
}

export type OrderStatus =
  | 'SCHEDULED'
  | 'VALIDATING'
  | 'SUBMITTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'INSUFFICIENT_FUNDS'
  | 'MARKET_CLOSED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'FAILED';

export interface InvestmentOrder {
  id: string;
  cycleId: string;
  planId: string;
  userId: string;
  ticker: string;
  brokerOrderId: string | null;
  idempotencyKey: string; // UNIQUE
  side: 'BUY';
  orderType: 'LIMIT';
  requestedQuantity: number;
  limitPrice: Money;
  reservedAmount: Money;
  filledQuantity: number;
  averageFillPrice: Money | null;
  orderStatus: OrderStatus;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  message?: string;
}

export interface OrderExecution {
  id: string;
  orderId: string;
  brokerExecutionId: string; // UNIQUE
  quantity: number;
  executionPrice: Money;
  commission: Money;
  executedAt: string;
}

export interface Holding {
  etfId: string;
  ticker: string;
  quantity: number;
  averagePrice: Money;
  updatedAt: string;
}

export interface DividendEvent {
  id: string;
  ticker: string;
  amount: Money;
  currency: 'USD';
  paymentDate: string;
  sharesHeld: number;
}

export type NotificationType = 'ORDER_FILLED' | 'ORDER_SUBMITTED' | 'CARRY_OVER' | 'ERROR' | 'INFO' | 'DIVIDEND';
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  timestamp: string;
}

export interface MarketQuote {
  bidPrice: string;
  askPrice: string;
  lastPrice: string;
  timestamp: string;
}
