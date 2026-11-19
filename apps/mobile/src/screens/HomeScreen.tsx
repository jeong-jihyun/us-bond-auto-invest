// M-002 대시보드
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Icon, IconName, KV, Row, Screen, SectionTitle, T, Tip } from '../components/ui';
import { nextDueDate, portfolioSummary } from '../core/engine';
import { diffDays, fmtDate, nextTradingDay } from '../core/calendar';
import { pct, usd } from '../core/money';
import { C, CYCLE_STATUS_UI, S } from '../theme';

export default function HomeScreen() {
  const data = useApp((s) => s.data);
  const go = useApp((s) => s.go);
  const runNextDue = useApp((s) => s.runNextDue);
  const lastRun = useApp((s) => s.lastRun);
  const [busy, setBusy] = useState(false);

  const sum = portfolioSummary(data);
  const next = nextDueDate(data);
  const connected = data.brokerConnection?.connectionStatus === 'CONNECTED';
  const consented = data.consents.length >= 2;
  const hasPlan = data.plans.some((p) => p.status === 'ACTIVE');
  const ran = data.cycles.length > 0;
  const pnlColor = sum.pnl.gt(0) ? '#FF8A80' : sum.pnl.lt(0) ? '#8AB4FF' : C.white;

  const steps: { done: boolean; title: string; icon: IconName; onPress: () => void }[] = [
    { done: connected, title: 'IBKR 모의 계좌 연결', icon: 'link', onPress: () => go('broker') },
    { done: consented, title: '위험 고지·자동주문 동의', icon: 'document-text', onPress: () => go('planForm') },
    { done: hasPlan, title: '적립 설정 (월 $100)', icon: 'calendar', onPress: () => go('planForm') },
    { done: ran, title: '첫 적립 실행해 보기', icon: 'play', onPress: () => go('home') },
  ];
  const todo = steps.findIndex((s) => !s.done);

  const run = async () => {
    setBusy(true);
    await runNextDue();
    setBusy(false);
  };

  return (
    <Screen
      title="US Bond Auto Invest"
      hero={
        <View style={{ marginTop: S.lg }}>
          <Text style={T.heroSub}>총 평가액 (보유 ETF + 적립 현금)</Text>
          <Text style={[T.heroBig, { marginTop: 4 }]}>{usd(sum.evalTotal)}</Text>
          <Text style={{ color: pnlColor, fontWeight: '700', marginTop: 4 }}>
            {usd(sum.pnl, { sign: true })} ({pct(sum.pnlPct)}) · 원금 {usd(sum.principal)}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: S.lg, gap: S.sm }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: S.md }}>
              <Text style={T.heroSub}>다음 적립일</Text>
              <Text style={{ color: C.white, fontWeight: '800', marginTop: 2 }}>
                {next ? `${fmtDate(next)}` : '없음'}
              </Text>
              {next ? <Text style={T.heroSub}>D-{Math.max(0, diffDays(data.today, next))}{nextTradingDay(next) !== next ? ` · 실행 ${fmtDate(nextTradingDay(next)).slice(5)}` : ''}</Text> : null}
            </View>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: S.md }}>
              <Text style={T.heroSub}>대기 중 적립 현금</Text>
              <Text style={{ color: C.white, fontWeight: '800', marginTop: 2 }}>{usd(sum.planCashTotal)}</Text>
              <Text style={T.heroSub}>1주 미만은 이월</Text>
            </View>
          </View>
        </View>
      }
    >
      {todo >= 0 ? (
        <Card>
          <Text style={[T.h3, { marginBottom: S.sm }]}>지금 할 일</Text>
          {steps.map((s, i) => (
            <Pressable key={s.title} onPress={i === todo ? s.onPress : undefined} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, opacity: i > todo ? 0.45 : 1 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: s.done ? C.ok : i === todo ? C.primary : C.line }}>
                {s.done ? <Icon name="checkmark" color={C.white} size={16} /> : <Text style={{ color: C.white, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>}
              </View>
              <Text style={[T.body, { flex: 1, fontWeight: i === todo ? '800' : '500', textDecorationLine: s.done ? 'line-through' : 'none', color: s.done ? C.faint : C.text }]}>{s.title}</Text>
              {i === todo && i !== 3 ? <Chip label="지금" fg={C.white} bg={C.primary} /> : null}
            </Pressable>
          ))}
        </Card>
      ) : null}

      {!data.flags.autoInvestEnabled ? <Tip kind="warn" text="자동매수가 꺼져 있어 실행되지 않습니다. 설정에서 켜세요." /> : null}

      <Card style={{ borderColor: C.primary, borderWidth: 1.5 }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>모의 시간 이동</Text>
            <Text style={T.sub}>오늘(가상) {fmtDate(data.today)} → 다음 적립일로 넘겨 실제처럼 실행</Text>
          </View>
        </Row>
        <View style={{ marginTop: S.md }}>
          {busy ? <ActivityIndicator color={C.primary} /> : (
            <Button title={next ? `다음 적립 실행 (${fmtDate(next).slice(5)})` : '먼저 적립을 설정하세요'} icon="play-forward" onPress={run} disabled={!next || !connected} />
          )}
        </View>
        {lastRun && lastRun.length > 0 ? (
          <View style={{ marginTop: S.md }}>
            <Text style={[T.sub, { fontWeight: '700', marginBottom: 4 }]}>방금 실행 결과</Text>
            {lastRun.map((r, i) => {
              const ui = CYCLE_STATUS_UI[r.status] ?? { label: r.status, fg: C.sub, bg: C.bg };
              return (
                <Row key={i} style={{ paddingVertical: 4 }}>
                  <Text style={[T.body, { fontWeight: '700' }]}>{r.ticker}</Text>
                  <Text style={[T.sub, { flex: 1, marginHorizontal: 8 }]} numberOfLines={1}>{r.message}</Text>
                  <Chip label={ui.label} fg={ui.fg} bg={ui.bg} />
                </Row>
              );
            })}
          </View>
        ) : null}
      </Card>

      <SectionTitle right={<Pressable onPress={() => go('portfolio')}><Text style={{ color: C.primary, fontWeight: '700' }}>전체</Text></Pressable>}>보유 ETF</SectionTitle>
      <Card>
        {sum.rows.length === 0 ? (
          <Text style={T.sub}>아직 보유한 ETF가 없습니다.</Text>
        ) : (
          sum.rows.map((r) => (
            <KV key={r.ticker} k={`${r.ticker} · ${r.quantity}주`} v={
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{usd(r.value)}</Text>
                <Text style={{ fontSize: 12, color: r.pnl.gt(0) ? C.up : r.pnl.lt(0) ? C.down : C.sub }}>{usd(r.pnl, { sign: true })} ({pct(r.pnlPct)})</Text>
              </View>
            } />
          ))
        )}
      </Card>

      <SectionTitle>바로가기</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
        {([
          ['주문 내역', 'receipt-outline', 'orders'],
          ['현금 원장', 'wallet-outline', 'ledger'],
          ['적립 관리', 'calendar-outline', 'plans'],
          ['계좌 연결', 'link-outline', 'broker'],
        ] as const).map(([label, icon, to]) => (
          <Pressable key={label} onPress={() => go(to)} style={{ width: '48.5%', backgroundColor: C.white, borderRadius: 14, padding: S.md, borderWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={icon} color={C.primary} />
            <Text style={{ fontWeight: '700', color: C.text }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
