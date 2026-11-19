// M-006 계좌 연결 · M-009 포트폴리오 · M-010 현금 원장 · M-011 알림
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Empty, Icon, IconName, KV, Row, Screen, Segmented, SectionTitle, T, Tip } from '../components/ui';
import { planCash, portfolioSummary } from '@bond/investment-core';
import { fmtDate } from '@bond/investment-core';
import { D, pct, sum, usd } from '@bond/investment-core';
import { C, LEDGER_UI, S } from '../theme';

export function BrokerScreen() {
  const data = useApp((s) => s.data);
  const { connectBroker, disconnectBroker, addPaperFunds, showToast } = useApp.getState();
  const [err, setErr] = useState<string | null>(null);
  const bc = data.brokerConnection;
  const connected = bc?.connectionStatus === 'CONNECTED';
  return (
    <Screen title="계좌 연결" back>
      <Card>
        <Row style={{ justifyContent: 'flex-start', gap: S.md }}>
          <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.white, fontWeight: '900' }}>IB</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>Interactive Brokers</Text>
            <Text style={T.sub}>{connected ? `${bc!.externalAccountId} · 연결됨` : '연결 안 됨'}</Text>
          </View>
          <Chip label={connected ? '연결됨' : '미연결'} fg={connected ? C.ok : C.sub} bg={connected ? C.okSoft : C.bg} />
        </Row>
      </Card>

      <SectionTitle>거래 환경</SectionTitle>
      <Card>
        <KV k="Paper Trading (모의)" v={<Chip label="사용 중" fg={C.ok} bg={C.okSoft} />} />
        <KV k="실거래 (LIVE)" v={<Row style={{ gap: 4 }}><Icon name="lock-closed" size={14} color={C.faint} /><Text style={T.sub}>잠김</Text></Row>} />
        <Text style={[T.tiny, { marginTop: 4 }]}>실거래는 IBKR 제3자 서비스 승인·규제 검토 후 별도 스위치로만 켭니다.</Text>
      </Card>

      {connected ? (
        <>
          <SectionTitle>권한 · 잔고</SectionTitle>
          <Card>
            {([
              ['eye-outline', '계좌·잔고 조회'],
              ['pulse-outline', '시세 조회 (모의 시세)'],
              ['cart-outline', '지정가 매수 주문 (정수주)'],
            ] as [IconName, string][]).map(([ic, t]) => (
              <Row key={t} style={{ justifyContent: 'flex-start', gap: 8, paddingVertical: 5 }}>
                <Icon name="checkmark-circle" color={C.ok} size={18} /><Icon name={ic} color={C.sub} size={16} /><Text style={T.body}>{t}</Text>
              </Row>
            ))}
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: S.sm }} />
            <KV k="주문 가능 금액 (모의)" v={usd(data.broker?.availableFunds ?? 0)} bold />
            <Button small kind="ghost" icon="add" title="모의 계좌에 $1,000 넣기" onPress={addPaperFunds} />
          </Card>
          {err ? <Tip kind="danger" text={err} /> : null}
          <Button kind="danger" title="연결 해제" icon="unlink" onPress={async () => { const e = await disconnectBroker(); setErr(e); if (!e) showToast('연결을 해제했습니다'); }} />
        </>
      ) : (
        <>
          <Tip text="계좌 비밀번호는 앱에 저장하지 않습니다. 실제 서비스는 IBKR 승인 인증(OAuth)으로 연결합니다." icon="lock-closed" />
          <Button title="IBKR 모의 계좌 연결" icon="link" onPress={connectBroker} />
        </>
      )}
    </Screen>
  );
}

export function PortfolioScreen() {
  const data = useApp((s) => s.data);
  const sm = portfolioSummary(data);
  const pnlC = (v: any) => (D(v).gt(0) ? C.up : D(v).lt(0) ? C.down : C.sub);
  return (
    <Screen
      title="포트폴리오"
      back
      hero={
        <View style={{ marginTop: S.md }}>
          <Text style={T.heroSub}>보유 ETF 평가액</Text>
          <Text style={[T.heroBig, { marginTop: 4 }]}>{usd(sm.holdingsValue)}</Text>
          <Text style={T.heroSub}>매입금액 {usd(sm.holdingsCost)} · 받은 분배금 {usd(sm.dividends)}</Text>
        </View>
      }
    >
      {sm.rows.length === 0 ? <Empty icon="pie-chart-outline" text="보유 자산이 없습니다" /> : null}
      {sm.rows.map((r) => (
        <Card key={r.ticker}>
          <Row>
            <Text style={T.h2}>{r.ticker}</Text>
            <Text style={[T.h3, { color: pnlC(r.pnl) }]}>{usd(r.pnl, { sign: true })} ({pct(r.pnlPct)})</Text>
          </Row>
          <KV k="보유 수량" v={`${r.quantity}주`} />
          <KV k="평균 매입가 · 현재가" v={`${usd(r.averagePrice)} · ${usd(r.lastPrice)}`} />
          <KV k="평가액" v={usd(r.value)} bold />
        </Card>
      ))}
      <SectionTitle>분배금</SectionTitle>
      {data.dividends.length === 0 ? <Card><Text style={T.sub}>아직 받은 분배금이 없습니다 (보유 후 매달 입금, 모의).</Text></Card> : (
        <Card>
          {data.dividends.slice(0, 24).map((d) => (
            <KV key={d.id} k={`${fmtDate(d.paymentDate)} · ${d.ticker} ${d.sharesHeld}주`} v={usd(d.amount, { sign: true })} vColor={C.ok} />
          ))}
        </Card>
      )}
      <Text style={[T.tiny, { textAlign: 'center' }]}>분배금은 계좌 현금으로 들어가며 적립 원장과는 분리됩니다.</Text>
    </Screen>
  );
}

export function LedgerScreen() {
  const data = useApp((s) => s.data);
  const plans = data.plans;
  const [pid, setPid] = useState<string>('ALL');
  const rows = [...data.ledger].reverse().filter((l) => pid === 'ALL' || l.investmentPlanId === pid);
  const total = pid === 'ALL' ? sum(plans.map((p) => planCash(data, p.id))) : planCash(data, pid);
  return (
    <Screen
      title="현금 원장"
      back
      hero={
        <View style={{ marginTop: S.md }}>
          <Text style={T.heroSub}>대기 중 적립 현금 (원장 합계)</Text>
          <Text style={[T.heroBig, { marginTop: 4 }]}>{usd(total)}</Text>
          <Text style={T.heroSub}>기록은 지우지 않고 반대 기록으로만 정정합니다</Text>
        </View>
      }
    >
      {plans.length > 1 ? (
        <Segmented options={[{ label: '전체', value: 'ALL' }, ...plans.slice(0, 4).map((p) => ({ label: p.ticker, value: p.id }))]} value={pid} onChange={setPid} />
      ) : null}
      {rows.length === 0 ? <Empty icon="wallet-outline" text="아직 기록이 없습니다" /> : null}
      {rows.length > 0 ? (
        <Card>
          {rows.slice(0, 200).map((l) => {
            const plan = plans.find((p) => p.id === l.investmentPlanId);
            const neg = D(l.amount).isNeg();
            return (
              <Row key={l.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.bg }}>
                <View style={{ flex: 1 }}>
                  <Text style={[T.body, { fontWeight: '700' }]}>{LEDGER_UI[l.transactionType]} <Text style={T.sub}>{plan?.ticker}</Text></Text>
                  <Text style={T.tiny}>{fmtDate(l.createdAt)}</Text>
                </View>
                <Text style={{ fontWeight: '800', color: neg ? C.down : C.up }}>{usd(l.amount, { sign: true })}</Text>
              </Row>
            );
          })}
        </Card>
      ) : null}
      <Tip text="주문 예약(-) 후 체결되면 예약 해제(+)와 체결 금액(-)·수수료(-)가 함께 기록됩니다." />
    </Screen>
  );
}

const NT_ICON: Record<string, [IconName, string]> = {
  ORDER_FILLED: ['checkmark-circle', C.ok],
  ORDER_SUBMITTED: ['paper-plane', C.primary],
  CARRY_OVER: ['arrow-redo', C.warn],
  ERROR: ['warning', C.danger],
  INFO: ['information-circle', C.primary],
  DIVIDEND: ['cash', C.ok],
};

export function AlertsScreen() {
  const list = useApp((s) => s.data.notifications);
  const markRead = useApp((s) => s.markRead);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <Screen title="알림" back right={unread ? <Button small kind="light" title="모두 읽음" onPress={() => markRead()} /> : <View />}>
      {list.length === 0 ? <Empty icon="notifications-off-outline" text="알림이 없습니다" /> : null}
      {list.slice(0, 100).map((n) => {
        const [ic, col] = NT_ICON[n.type];
        return (
          <Pressable key={n.id} onPress={() => markRead(n.id)}>
            <Card style={!n.readAt ? { borderColor: C.primary } : undefined}>
              <Row style={{ alignItems: 'flex-start', gap: 10 }}>
                <Icon name={ic} color={col} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[T.body, { fontWeight: n.readAt ? '600' : '800' }]}>{n.title}</Text>
                  <Text style={[T.sub, { marginTop: 2 }]}>{n.content}</Text>
                  <Text style={[T.tiny, { marginTop: 4 }]}>{fmtDate(n.createdAt)}</Text>
                </View>
                {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.up, marginTop: 6 }} /> : null}
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
