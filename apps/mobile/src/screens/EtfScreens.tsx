// M-003 ETF 탐색 · M-004 ETF 상세
import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Decimal from 'decimal.js';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Icon, KV, Row, Screen, Segmented, SectionTitle, T, Tip, st } from '../components/ui';
import { CATEGORY_LABEL, ETF_SEED, RISK_LEVEL, etfByTicker } from '../core/etfs';
import { mockQuote } from '../broker/mockBroker';
import { calculateWholeShares } from '../core/calc';
import { addDays } from '../core/calendar';
import { pct, usd } from '../core/money';
import { C, S } from '../theme';

const riskColor = (lv: number) => (lv === 1 ? [C.ok, C.okSoft] : lv === 2 ? [C.warn, C.warnSoft] : [C.danger, C.dangerSoft]);

export function EtfListScreen() {
  const today = useApp((s) => s.data.today);
  const go = useApp((s) => s.go);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'ALL' | 'SHORT_TERM' | 'INTERMEDIATE' | 'LONG_TERM' | 'AGGREGATE'>('ALL');
  const list = ETF_SEED.filter(
    (e) => (cat === 'ALL' || e.assetCategory === cat) && (e.ticker + e.name).toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Screen
      title="ETF 탐색"
      hero={
        <View style={[st.inputWrap, { marginTop: S.md, backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'transparent' }]}>
          <Icon name="search" color="rgba(255,255,255,0.7)" size={18} />
          <TextInput value={q} onChangeText={setQ} placeholder="SGOV, TLT, Treasury…" placeholderTextColor="rgba(255,255,255,0.55)" style={[st.input, { color: C.white, fontSize: 15, marginLeft: 6 }]} autoCapitalize="characters" />
        </View>
      }
    >
      <Segmented
        options={[{ label: '전체', value: 'ALL' }, { label: '단기', value: 'SHORT_TERM' }, { label: '중기', value: 'INTERMEDIATE' }, { label: '장기', value: 'LONG_TERM' }, { label: '종합', value: 'AGGREGATE' }]}
        value={cat}
        onChange={setCat}
      />
      {list.length === 0 ? <Text style={[T.sub, { textAlign: 'center', marginTop: S.xl }]}>검색 결과가 없습니다</Text> : null}
      {list.map((e) => {
        const qt = mockQuote(e.ticker, today);
        const prev = mockQuote(e.ticker, addDays(today, -1));
        const chg = new Decimal(qt.lastPrice).minus(prev.lastPrice).dividedBy(prev.lastPrice).times(100);
        const n = calculateWholeShares(100, qt.askPrice).quantity;
        const risk = RISK_LEVEL[e.ticker];
        const [fg, bg] = riskColor(risk.level);
        return (
          <Card key={e.ticker} onPress={() => go('etfDetail', { ticker: e.ticker })}>
            <Row>
              <View style={{ flex: 1 }}>
                <Row style={{ justifyContent: 'flex-start', gap: 6 }}>
                  <Text style={T.h2}>{e.ticker}</Text>
                  <Chip label={CATEGORY_LABEL[e.assetCategory]} />
                  <Chip label={`위험 ${risk.label}`} fg={fg} bg={bg} />
                </Row>
                <Text style={[T.sub, { marginTop: 2 }]} numberOfLines={1}>{e.name}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={T.h3}>{usd(qt.lastPrice)}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: chg.gt(0) ? C.up : chg.lt(0) ? C.down : C.sub }}>{pct(chg)}</Text>
              </View>
            </Row>
            <Text style={[T.tiny, { marginTop: S.sm }]}>
              {n === 0 ? '월 $100이면 첫 달 0주 → 다음 달 합쳐서 매수' : `월 $100이면 매달 약 ${n}주`}
            </Text>
          </Card>
        );
      })}
      <Text style={[T.tiny, { textAlign: 'center' }]}>가격은 모의 시세입니다 (실제 시세 아님)</Text>
    </Screen>
  );
}

export function EtfDetailScreen({ ticker }: { ticker: string }) {
  const today = useApp((s) => s.data.today);
  const plans = useApp((s) => s.data.plans);
  const go = useApp((s) => s.go);
  const e = etfByTicker(ticker);
  const qt = mockQuote(ticker, today);
  const series = useMemo(() => Array.from({ length: 30 }, (_, i) => Number(mockQuote(ticker, addDays(today, i - 29)).lastPrice)), [ticker, today]);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const first = series[0];
  const chg30 = ((series[29] - first) / first) * 100;
  const risk = RISK_LEVEL[ticker];
  const [fg, bg] = riskColor(risk.level);
  const active = plans.find((p) => p.ticker === ticker && p.status !== 'CANCELLED');

  return (
    <Screen
      title={ticker}
      back
      hero={
        <View style={{ marginTop: S.md }}>
          <Text style={T.heroSub} numberOfLines={1}>{e.name}</Text>
          <Text style={[T.heroBig, { marginTop: 4 }]}>{usd(qt.lastPrice)}</Text>
          <Text style={T.heroSub}>매수호가 {usd(qt.bidPrice)} · 매도호가 {usd(qt.askPrice)} · 30일 {pct(chg30)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 56, gap: 2, marginTop: S.md }}>
            {series.map((v, i) => (
              <View key={i} style={{ flex: 1, height: 6 + ((v - min) / (max - min || 1)) * 50, backgroundColor: i === 29 ? C.white : 'rgba(255,255,255,0.35)', borderRadius: 2 }} />
            ))}
          </View>
        </View>
      }
    >
      <Card>
        <KV k="분류" v={`${CATEGORY_LABEL[e.assetCategory]} 채권`} />
        <KV k="위험 수준" v={<Chip label={risk.label} fg={fg} bg={bg} />} />
        <KV k="평균 듀레이션" v={`${e.duration}년`} />
        <KV k="총보수" v={`${new Decimal(e.expenseRatio).times(100).toFixed(2)}%`} />
        <KV k="거래소 · 통화" v={`${e.exchangeCode} · ${e.currency}`} />
        <KV k="월 $100 기준" v={calculateWholeShares(100, qt.askPrice).quantity === 0 ? '첫 달 0주(이월)' : `약 ${calculateWholeShares(100, qt.askPrice).quantity}주/월`} />
        <Text style={[T.sub, { marginTop: S.sm, lineHeight: 20 }]}>{e.summary}</Text>
      </Card>

      <SectionTitle>꼭 알아둘 위험</SectionTitle>
      <Card>
        {[
          ['trending-down', '금리가 오르면 가격이 내려갑니다 (듀레이션이 길수록 크게)'],
          ['cash-outline', '달러 자산 — 원화로 보면 환율에 따라 손익이 달라집니다'],
          ['pie-chart-outline', '분배금은 매달 달라질 수 있습니다'],
          ['shield-outline', '원금·수익을 보장하지 않습니다'],
        ].map(([ic, t]) => (
          <Row key={t} style={{ justifyContent: 'flex-start', gap: 8, paddingVertical: 5 }}>
            <Icon name={ic as any} color={C.warn} size={18} />
            <Text style={[T.body, { flex: 1, fontSize: 14 }]}>{t}</Text>
          </Row>
        ))}
      </Card>
      {risk.level === 3 ? <Tip kind="warn" text="장기채는 변동이 큽니다. 처음이라면 SGOV·SHY 같은 단기채로 시작해 보세요." /> : null}

      {active ? (
        <Button title={`이미 적립 중 · 관리하기`} kind="ghost" icon="calendar" onPress={() => go('planDetail', { planId: active.id })} />
      ) : (
        <Button title={`${ticker} 월 적립 설정`} icon="add-circle" onPress={() => go('planForm', { ticker })} />
      )}
    </Screen>
  );
}
