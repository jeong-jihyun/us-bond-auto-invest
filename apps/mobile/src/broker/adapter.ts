// 사양서 6.2 Broker Adapter 인터페이스 (그대로) + 체결 조회 1개 추가.
// 실제 IBKR 어댑터는 서버(apps/api)에서 같은 인터페이스로 구현한다.

export interface BrokerExecution {
  executionId: string;
  quantity: number;
  price: string;
  commission: string;
  executedAt: string;
}

export interface BrokerAdapter {
  connect(accountId: string): Promise<boolean>;

  getAccountBalance(accountId: string): Promise<{
    availableFunds: string;
    currency: string;
  }>;

  getMarketPrice(ticker: string): Promise<{
    bidPrice: string;
    askPrice: string;
    lastPrice: string;
    timestamp: string;
  }>;

  placeLimitOrder(input: {
    accountId: string;
    ticker: string;
    quantity: number;
    limitPrice: string;
    idempotencyKey: string;
  }): Promise<{
    brokerOrderId: string;
    status: string;
  }>;

  getOrderStatus(brokerOrderId: string): Promise<{
    status: string;
    filledQuantity: number;
    averagePrice: string;
  }>;

  getPositions(accountId: string): Promise<unknown[]>;

  cancelOrder(brokerOrderId: string): Promise<boolean>;

  /** 체결 내역 (execution id 단위) — 중복 반영 방지에 사용 */
  getExecutions(brokerOrderId: string): Promise<BrokerExecution[]>;
}
