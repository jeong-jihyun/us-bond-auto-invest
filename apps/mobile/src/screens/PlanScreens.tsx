// M-005 적립 설정 · M-007 적립 관리
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Decimal from 'decimal.js';
import { useApp, validateAmountDay } from '../store/useApp';
import { Button, Card, Chip, Empty, Field, Help, Icon, KV, Row, Screen, SectionTitle, T, Tip } from '../components/ui';
import { ETF_SEED, RISK_LEVEL } from '../core/etfs';
import { mockQuote } from '../broker/mockBroker';
import { sizeOrder } from '../core/calc';
import { firstScheduledDate, fmtDate, nextTradingDay } from '../core/calendar';
import { planCash } from '../core/engine';
import { roundUpToTick, usd } from '../core/money';
import { C, CYCLE_STATUS_UI, S } from '../theme';

const DAYS = [1, 5, 10, 15, 20, 25, 28, 31];

export function PlanFormScreen({ ticker: initTicker, planId }: { ticker?: string; planId?: string }) {
  const data = useApp((s) => s.data);
  const { go, back, createPlan, updatePlan, acceptConsents, showToast } = useApp.getState();
  const editing = planId ? data.plans.find((p) => p.id === planId) : undefined;
  const [ticker, setTicker] = useState(editing?.ticker ?? initTicker ?? 'SGOV');
  const [amount, setAmount] = useState(editing ? new Decimal(editing.monthlyAmount).toString() : '100');
  const [day, setDay] = useState(editing?.scheduledDay ?? 10);
  const [agreeRisk, setAgreeRisk] = useState(data.consents.length >= 2);
  const [agreeAuto, setAgreeAuto] = useState(data.consents.length >= 2);
  const [err, setErr] = useState<string | null>(null);

  const connected = data.brokerConnection?.connectionStatus === 'CONNECTED';
  const consented = data.consents.length >= 2;
  const amountErr = validateAmountDay(amount || '0', day);
  const first = firstScheduledDate(data.today, day);
  const q = mockQuote(ticker, data.today);
  const limit = roundUpToTick(new Decimal(q.askPrice).times('1.001'));
  const preview = !amountErr ? sizeOrder(amount, limit) : null;
  const dup = !editing && data.plans.some((p) => p.ticker === ticker && p.status !== 'CANCELLED');

  const submit = () => {
    if (!editing && !consented) {
      if (!agreeRisk || !agreeAuto) return setErr('두 가지 동의가 모두 필요합니다');
      acceptConsents();
    }
    const e = editing ? updatePlan(editing.id, { amount, day }) : createPlan({ ticker, amount, day });
    if (e) return setErr(e);
    showToast(editing ? '적립 설정을 바꿨습니다' : `${ticker} 적립을 시작했습니다`);
    editing ? back() : go('plans');
  };

  return (
    <Screen title={editing ? `${editing.ticker} 적립 수정` : '적립 설정'} back>
      {!connected ? (
        <Card>
          <Tip kind="danger" text="IBKR 계좌가 연결되어야 적립을 만들 수 있습니다." />
          <Button title="계좌 연결하러 가기" icon="link" onPress={() => go('broker')} />
        </Card>
      ) : (
        <Row style={{ justifyContent: 'flex-start', gap: 6, marginBottom: S.md }}>
          <Icon name="checkmark-circle" color={C.ok} size={18} />
          <Text style={T.sub}>계좌 {data.brokerConnection!.externalAccountId} · IBKR 모의(PAPER)</Text>
        </Row>
      )}

      {!editing ? (
        <>
          <Help title="1. ETF 선택" text="처음이라면 변동이 작은 SGOV·SHY를 추천합니다. TLT는 금리에 크게 흔들립니다." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.lg }}>
            {ETF_SEED.map((e) => {
              const on = e.ticker === ticker;
              return (
                <Pressable key={e.ticker} onPress={() => setTicker(e.ticker)} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.white }}>
                  <Text style={{ fontWeight: '800', color: on ? C.primary : C.text }}>{e.ticker}</Text>
                  <Text style={{ fontSize: 11, color: C.sub }}>위험 {RISK_LEVEL[e.ticker].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Help title={editing ? '월 적립금' : '2. 월 적립금 (USD)'} text="정수 주만 삽니다. 1주 가격보다 적으면 그 달은 사지 않고 다음 달로 넘겨 합칩니다." />
      <Field label="" value={amount} onChange={(v) => { setAmount(v.replace(/[^0-9.]/g, '')); setErr(null); }} keyboard="decimal-pad" prefix="$" error={amount ? (amountErr && !amountErr.includes('날짜') ? amountErr : null) : '금액을 입력하세요'} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: S.lg }}>
        {['100', '200', '300', '500'].map((v) => (
          <Pressable key={v} onPress={() => setAmount(v)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: amount === v ? C.navy : C.white, borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: amount === v ? C.white : C.text, fontWeight: '700' }}>${v}</Text>
          </Pressable>
        ))}
      </View>

      <Help title={editing ? '실행일' : '3. 매월 실행일'} text="미국 휴장일·주말이면 다음 거래일에 실행합니다. 31일을 고르면 30일까지 있는 달은 말일에 실행합니다." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.sm }}>
        {DAYS.map((d) => (
          <Pressable key={d} onPress={() => setDay(d)} style={{ width: 62, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: day === d ? C.primary : C.line, backgroundColor: day === d ? C.primarySoft : C.white }}>
            <Text style={{ fontWeight: '800', color: day === d ? C.primary : C.text }}>{d === 31 ? '말일' : `${d}일`}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[T.sub, { marginBottom: S.lg }]}>
        첫 실행: {fmtDate(first)}{nextTradingDay(first) !== first ? ` → 주말·휴장이라 ${fmtDate(nextTradingDay(first))}` : ''}
      </Text>

      {preview ? (
        <Card style={{ backgroundColor: C.bg }}>
          <Text style={[T.h3, { marginBottom: 4 }]}>지금 가격이면</Text>
          <KV k={`${ticker} 지정가(매도호가+0.1%)`} v={usd(limit)} />
          <KV k="첫 달 매수" v={`${preview.quantity}주`} bold vColor={preview.quantity === 0 ? C.warn : C.ok} />
          <KV k="수수료(예상)" v={usd(preview.commission)} />
          <KV k="다음 달로 이월" v={usd(new Decimal(amount).minus(preview.cost))} />
          {preview.quantity === 0 ? <Tip kind="warn" text={`$${amount}로는 1주(${usd(limit)}+수수료)를 못 삽니다. 이번 달은 이월, 다음 달 합쳐서 삽니다.`} /> : null}
        </Card>
      ) : null}
      {dup ? <Tip kind="warn" text={`${ticker} 적립이 이미 있습니다. 금액을 바꾸려면 적립 관리에서 수정하세요.`} /> : null}

      {!editing && !consented ? (
        <Card>
          <Text style={[T.h3, { marginBottom: S.sm }]}>4. 동의 (적립 시작 전 필수)</Text>
          {[
            [agreeRisk, setAgreeRisk, '위험 고지 확인: 채권 ETF도 가격 하락·금리·환율 위험이 있고 원금을 보장하지 않습니다'],
            [agreeAuto, setAgreeAuto, '자동주문 동의: 매월 실행일에 서버가 정수 주 지정가 매수 주문을 냅니다'],
          ].map(([v, setV, label]: any) => (
            <Pressable key={label} onPress={() => setV(!v)} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8 }}>
              <Icon name={v ? 'checkbox' : 'square-outline'} color={v ? C.primary : C.faint} size={22} />
              <Text style={[T.body, { flex: 1, fontSize: 14, lineHeight: 20 }]}>{label}</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {err ? <Tip kind="danger" text={err} /> : null}
      <Button
        title={editing ? '저장' : '적립 시작'}
        icon={editing ? 'save' : 'rocket'}
        onPress={submit}
        disabled={!connected || !!amountErr || dup || (!editing && !consented && (!agreeRisk || !agreeAuto))}
      />
    </Screen>
  );
}

const PLAN_STATUS: Record<string, [string, string, string]> = {
  ACTIVE: ['진행 중', C.ok, C.okSoft],
  PAUSED: ['일시정지', C.warn, C.warnSoft],
  CANCELLED: ['해지', C.sub, C.bg],
};

export function PlansScreen() {
  const data = useApp((s) => s.data);
  const go = useApp((s) => s.go);
  const plans = [...data.plans].sort((a, b) => (a.status === 'CANCELLED' ? 1 : 0) - (b.status === 'CANCELLED' ? 1 : 0));
  return (
    <Screen title="적립 관리" right={<Button small kind="light" title="추가" icon="add" onPress={() => go('planForm')} />}>
      {plans.length === 0 ? (
        <Empty icon="calendar-outline" text="아직 적립이 없습니다" action={<Button title="첫 적립 만들기" icon="add-circle" onPress={() => go('planForm')} />} />
      ) : null}
      {plans.map((p) => {
        const [label, fg, bg] = PLAN_STATUS[p.status];
        const cycles = data.cycles.filter((c) => c.investmentPlanId === p.id);
        const shares = cycles.reduce((a, c) => a + c.executedQuantity, 0);
        return (
          <Card key={p.id} onPress={() => go('planDetail', { planId: p.id })} style={p.status === 'CANCELLED' ? { opacity: 0.6 } : undefined}>
            <Row>
              <Row style={{ gap: 8 }}>
                <Text style={T.h2}>{p.ticker}</Text>
                <Chip label={label} fg={fg} bg={bg} />
              </Row>
              <Text style={T.h3}>{usd(p.monthlyAmount)}<Text style={T.sub}>/월</Text></Text>
            </Row>
            <Row style={{ marginTop: S.sm }}>
              <Text style={T.sub}>매월 {p.scheduledDay === 31 ? '말일' : `${p.scheduledDay}일`} · {cycles.length}회 실행 · {shares}주</Text>
              <Text style={T.sub}>대기 {usd(planCash(data, p.id))}</Text>
            </Row>
            {p.status === 'ACTIVE' && p.nextScheduledDate ? <Text style={[T.tiny, { marginTop: 4 }]}>다음 실행 {fmtDate(p.nextScheduledDate)}</Text> : null}
          </Card>
        );
      })}
    </Screen>
  );
}

export function PlanDetailScreen({ planId }: { planId: string }) {
  const data = useApp((s) => s.data);
  const { go, pausePlan, resumePlan, cancelPlan, rerunLastMonth, showToast } = useApp.getState();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const p = data.plans.find((x) => x.id === planId);
  if (!p) return <Screen title="적립" back><Empty icon="alert-circle" text="적립을 찾을 수 없습니다" /></Screen>;
  const cycles = data.cycles.filter((c) => c.investmentPlanId === p.id);
  const [label, fg, bg] = PLAN_STATUS[p.status];
  const cash = planCash(data, p.id);

  return (
    <Screen title={`${p.ticker} 적립`} back>
      <Card>
        <Row style={{ marginBottom: S.sm }}>
          <Chip label={label} fg={fg} bg={bg} />
          <Text style={T.tiny}>주문단위 정수주 · 지정가 · 현금 이월</Text>
        </Row>
        <KV k="월 적립금" v={usd(p.monthlyAmount)} bold />
        <KV k="실행일" v={`매월 ${p.scheduledDay === 31 ? '말일' : `${p.scheduledDay}일`} (${p.timezone})`} />
        <KV k="다음 실행" v={p.status === 'ACTIVE' ? fmtDate(p.nextScheduledDate) : '-'} />
        <KV k="대기 중 현금(이월)" v={usd(cash)} />
      </Card>

      {p.status !== 'CANCELLED' ? (
        <View style={{ gap: S.sm }}>
          <Row style={{ gap: S.sm }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="수정" icon="create-outline" onPress={() => go('planForm', { planId: p.id })} /></View>
            <View style={{ flex: 1 }}>
              {p.status === 'ACTIVE'
                ? <Button kind="ghost" title="일시정지" icon="pause" onPress={() => { pausePlan(p.id); showToast('일시정지했습니다'); }} />
                : <Button title="재개" icon="play" onPress={() => { resumePlan(p.id); showToast('다시 시작합니다'); }} />}
            </View>
          </Row>
          <Button
            kind="danger"
            icon="close-circle"
            title={confirmCancel ? `한 번 더 누르면 해지 (대기 현금 ${usd(cash)} 반환)` : '해지'}
            onPress={() => { if (!confirmCancel) return setConfirmCancel(true); cancelPlan(p.id); showToast('해지했습니다'); }}
          />
        </View>
      ) : <Tip text="해지된 적립입니다. 기록은 그대로 남습니다." />}

      <SectionTitle>월간 실행 이력</SectionTitle>
      {cycles.length === 0 ? <Card><Text style={T.sub}>아직 실행된 달이 없습니다. 홈에서 '다음 적립 실행'을 눌러 보세요.</Text></Card> : null}
      {cycles.map((c) => {
        const ui = CYCLE_STATUS_UI[c.cycleStatus];
        return (
          <Card key={c.id}>
            <Row>
              <Text style={T.h3}>{c.cycleYear}년 {c.cycleMonth}월</Text>
              <Chip label={ui.label} fg={ui.fg} bg={ui.bg} />
            </Row>
            <Text style={[T.sub, { marginTop: 4 }]}>
              이월 {usd(c.previousCash)} + 적립 {usd(c.depositAmount)} → {c.executedQuantity}주 · 남은 {usd(c.availableCash)}
            </Text>
            <Text style={T.tiny}>실행 {fmtDate(c.executionDate)}{c.note ? ` · ${c.note}` : ''}</Text>
          </Card>
        );
      })}
      {cycles.length > 0 ? (
        <Button small kind="ghost" icon="shield-checkmark-outline" title="같은 달 다시 실행 (중복 방지 확인)" onPress={() => rerunLastMonth(p.id)} />
      ) : null}
    </Screen>
  );
}
