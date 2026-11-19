// M-008 주문 내역 · 주문 상세
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Decimal from 'decimal.js';
import { useApp } from '../store/useApp';
import { Card, Empty, KV, OrderBadge, Row, Screen, Segmented, SectionTitle, T, Tip } from '../components/ui';
import { fmtDate } from '@bond/investment-core';
import { usd } from '@bond/investment-core';
import { S } from '../theme';

type F = 'ALL' | 'OPEN' | 'FILLED' | 'FAIL';
const GROUP: Record<F, string[]> = {
  ALL: [],
  OPEN: ['SUBMITTED', 'VALIDATING', 'SCHEDULED'],
  FILLED: ['FILLED', 'PARTIALLY_FILLED'],
  FAIL: ['REJECTED', 'INSUFFICIENT_FUNDS', 'MARKET_CLOSED', 'FAILED', 'CANCELLED'],
};

export function OrdersScreen() {
  const orders = useApp((s) => s.data.orders);
  const go = useApp((s) => s.go);
  const [f, setF] = useState<F>('ALL');
  const list = f === 'ALL' ? orders : orders.filter((o) => GROUP[f].includes(o.orderStatus));
  const count = (k: F) => (k === 'ALL' ? orders.length : orders.filter((o) => GROUP[k].includes(o.orderStatus)).length);
  return (
    <Screen title="주문 내역">
      <Segmented
        options={[
          { label: `전체 ${count('ALL')}`, value: 'ALL' },
          { label: `미체결 ${count('OPEN')}`, value: 'OPEN' },
          { label: `체결 ${count('FILLED')}`, value: 'FILLED' },
          { label: `실패 ${count('FAIL')}`, value: 'FAIL' },
        ]}
        value={f}
        onChange={setF}
      />
      {list.length === 0 ? <Empty icon="receipt-outline" text={orders.length ? '해당 상태의 주문이 없습니다' : '아직 주문이 없습니다.\n1주 미만 달은 주문 없이 이월됩니다.'} /> : null}
      {list.map((o) => (
        <Card key={o.id} onPress={() => go('orderDetail', { orderId: o.id })}>
          <Row>
            <Text style={T.h3}>{o.ticker} 매수 {o.requestedQuantity}주</Text>
            <OrderBadge status={o.orderStatus} />
          </Row>
          <Row style={{ marginTop: 6 }}>
            <Text style={T.sub}>{fmtDate(o.createdAt)} · 지정가 {usd(o.limitPrice)}</Text>
            <Text style={[T.sub, { fontWeight: '700' }]}>
              {o.filledQuantity > 0 ? `${o.filledQuantity}주 @${usd(o.averageFillPrice!)}` : '체결 없음'}
            </Text>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const data = useApp((s) => s.data);
  const o = data.orders.find((x) => x.id === orderId);
  if (!o) return <Screen title="주문" back><Empty icon="alert-circle" text="주문을 찾을 수 없습니다" /></Screen>;
  const execs = data.executions.filter((e) => e.orderId === o.id);
  const total = execs.reduce((a, e) => a.plus(new Decimal(e.executionPrice).times(e.quantity)).plus(e.commission), new Decimal(0));
  return (
    <Screen title={`${o.ticker} 주문 상세`} back>
      <Card>
        <Row style={{ marginBottom: S.sm }}>
          <Text style={T.h2}>{o.requestedQuantity}주 매수</Text>
          <OrderBadge status={o.orderStatus} />
        </Row>
        {o.message ? <Tip kind={o.orderStatus === 'PARTIALLY_FILLED' ? 'warn' : 'danger'} text={o.message} /> : null}
        <KV k="주문 유형" v="지정가 · 정수주" />
        <KV k="지정가" v={usd(o.limitPrice)} />
        <KV k="예약했던 금액" v={usd(o.reservedAmount)} />
        <KV k="체결 수량" v={`${o.filledQuantity} / ${o.requestedQuantity}주`} bold />
        <KV k="평균 체결가" v={o.averageFillPrice ? usd(o.averageFillPrice) : '-'} />
        <KV k="브로커 주문번호" v={o.brokerOrderId ?? '-'} />
        <KV k="제출 · 완료" v={`${o.submittedAt?.slice(5, 16).replace('T', ' ') ?? '-'} · ${o.completedAt?.slice(5, 16).replace('T', ' ') ?? '-'}`} />
        <Text style={[T.tiny, { marginTop: 6 }]} numberOfLines={1}>멱등성 키 {o.idempotencyKey}</Text>
      </Card>

      <SectionTitle>체결 내역</SectionTitle>
      {execs.length === 0 ? <Card><Text style={T.sub}>체결 없음 — 보유 수량에 반영되지 않았습니다.</Text></Card> : null}
      {execs.map((e) => (
        <Card key={e.id}>
          <Row><Text style={T.h3}>{e.quantity}주 @ {usd(e.executionPrice)}</Text><Text style={T.sub}>수수료 {usd(e.commission)}</Text></Row>
          <Text style={T.tiny}>{e.brokerExecutionId} · {e.executedAt.slice(0, 16).replace('T', ' ')}</Text>
        </Card>
      ))}
      {execs.length > 0 ? (
        <View style={{ alignItems: 'flex-end' }}><Text style={[T.body, { fontWeight: '800' }]}>총 결제 {usd(total)}</Text></View>
      ) : null}
    </Screen>
  );
}
