// M-012 설정 · 더보기
import React, { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Help, Icon, KV, ListItem, Row, Screen, Segmented, SectionTitle, T, Tip } from '../components/ui';
import { fmtDate } from '../core/calendar';
import { C, S } from '../theme';
import { MockScenario } from '../broker/mockBroker';

const COUNTRIES = [
  { code: 'KR', label: '대한민국', tz: 'Asia/Seoul' },
  { code: 'US', label: '미국', tz: 'America/New_York' },
  { code: 'JP', label: '일본', tz: 'Asia/Tokyo' },
  { code: 'SG', label: '싱가포르', tz: 'Asia/Singapore' },
];

export function MoreScreen() {
  const data = useApp((s) => s.data);
  const go = useApp((s) => s.go);
  const unread = data.notifications.filter((n) => !n.readAt).length;
  return (
    <Screen title="더보기">
      <Card>
        <Row style={{ justifyContent: 'flex-start', gap: S.md }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="person" color={C.primary} />
          </View>
          <View>
            <Text style={T.h3}>{data.user?.email}</Text>
            <Text style={T.sub}>{data.settings.countryCode} · {data.settings.timezone} · USD</Text>
          </View>
        </Row>
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <ListItem icon="pie-chart-outline" title="포트폴리오" sub="보유 수량 · 평균가 · 손익" onPress={() => go('portfolio')} />
        <ListItem icon="wallet-outline" title="현금 원장" sub="적립금 · 이월 · 주문 차감" onPress={() => go('ledger')} />
        <ListItem icon="notifications-outline" title="알림" sub="매수 결과 · 오류" onPress={() => go('alerts')} right={unread ? <Chip label={`${unread}`} fg={C.white} bg={C.up} /> : undefined} />
        <ListItem icon="link-outline" title="계좌 연결" sub={data.brokerConnection?.connectionStatus === 'CONNECTED' ? `IBKR ${data.brokerConnection.externalAccountId}` : '연결 안 됨'} onPress={() => go('broker')} />
        <ListItem icon="settings-outline" title="설정" sub="국가 · 시간대 · 보안 · 모의 테스트" onPress={() => go('settings')} />
      </Card>
      <Text style={[T.tiny, { textAlign: 'center' }]}>US Bond Auto Invest · mobile 1.0.0 (모의 환경)</Text>
    </Screen>
  );
}

export function SettingsScreen() {
  const data = useApp((s) => s.data);
  const { updateSettings, setAutoInvest, setScenario, signOut, resetAll, showToast } = useApp.getState();
  const [confirmReset, setConfirmReset] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const scenario = data.broker?.scenario ?? 'NORMAL';

  return (
    <Screen title="설정" back>
      <SectionTitle>국가 · 시간대</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COUNTRIES.map((c) => {
            const on = data.settings.countryCode === c.code;
            return (
              <Pressable key={c.code} onPress={() => { updateSettings({ countryCode: c.code, timezone: c.tz }); showToast(`${c.label} · ${c.tz}`); }}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.white }}>
                <Text style={{ fontWeight: '700', color: on ? C.primary : C.text }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <KV k="시간대" v={data.settings.timezone} />
        <KV k="기준 통화" v="USD (고정)" />
        <Text style={T.tiny}>국가를 바꿔도 이미 만든 적립의 시간대는 그대로입니다. 국가별 거래 자격은 실제 서비스에서 별도 확인합니다.</Text>
      </Card>

      <SectionTitle>보안</SectionTitle>
      <Card>
        <KV k="2단계 인증 (MFA)" v={<Switch value={data.settings.mfaEnabled} onValueChange={(v) => updateSettings({ mfaEnabled: v })} />} />
        <KV k="계좌 비밀번호 저장" v="저장 안 함" />
      </Card>

      <SectionTitle>거래 스위치</SectionTitle>
      <Card>
        <KV k="AUTO_INVEST_ENABLED (모의)" v={<Switch value={data.flags.autoInvestEnabled} onValueChange={setAutoInvest} />} />
        <KV k="LIVE_TRADING_ENABLED" v={<Row style={{ gap: 4 }}><Icon name="lock-closed" size={14} color={C.faint} /><Text style={T.sub}>false</Text></Row>} />
        <KV k="BROKER · IBKR_ENV" v="IBKR · PAPER(모의)" />
      </Card>

      <SectionTitle>모의 테스트</SectionTitle>
      <Card>
        <Help title="브로커 응답 시나리오" text="다음 실행에서 브로커가 어떻게 응답할지 고릅니다. 부분 체결·거부·잔액 부족 화면을 직접 확인할 수 있습니다." />
        <Segmented<MockScenario>
          options={[{ label: '정상', value: 'NORMAL' }, { label: '부분체결', value: 'PARTIAL_FILL' }, { label: '거부', value: 'REJECT' }, { label: '잔액부족', value: 'LOW_FUNDS' }]}
          value={scenario}
          onChange={(v) => { setScenario(v); showToast('다음 실행부터 적용'); }}
        />
        {!data.broker ? <Text style={T.tiny}>계좌 연결 후 사용할 수 있습니다.</Text> : null}
        <KV k="가상 오늘 날짜" v={fmtDate(data.today)} />
      </Card>
      {scenario !== 'NORMAL' ? <Tip kind="warn" text="테스트 시나리오가 켜져 있습니다. 확인 후 '정상'으로 돌려 두세요." /> : null}

      <SectionTitle right={<Pressable onPress={() => setShowAudit(!showAudit)}><Text style={{ color: C.primary, fontWeight: '700' }}>{showAudit ? '접기' : '보기'}</Text></Pressable>}>감사 로그</SectionTitle>
      {showAudit ? (
        <Card>
          {data.audit.slice(0, 40).map((a) => (
            <View key={a.id} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.bg }}>
              <Text style={[T.body, { fontSize: 13, fontWeight: '700' }]}>{a.action}</Text>
              <Text style={T.tiny} numberOfLines={1}>{a.timestamp.slice(0, 10)} · {a.detail || a.resource}</Text>
            </View>
          ))}
          {data.audit.length === 0 ? <Text style={T.sub}>기록 없음</Text> : null}
        </Card>
      ) : <Text style={[T.sub, { marginBottom: S.md }]}>주문·설정 변경 {data.audit.length}건 기록됨</Text>}

      <View style={{ gap: S.sm, marginTop: S.md }}>
        <Button kind="ghost" title="로그아웃" icon="log-out-outline" onPress={signOut} />
        <Button kind="danger" icon="trash-outline" title={confirmReset ? '한 번 더 누르면 모든 모의 데이터 삭제' : '모의 데이터 초기화'}
          onPress={() => { if (!confirmReset) return setConfirmReset(true); resetAll(); }} />
      </View>
    </Screen>
  );
}
