// M-001 로그인
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store/useApp';
import { Button, Card, Field, Icon, Segmented, T, Tip } from '../components/ui';
import { C, S } from '../theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useApp((s) => s.signIn);
  const busy = useApp((s) => s.busy);
  const [kind, setKind] = useState<'login' | 'signup'>('signup');
  const [local, setLocal] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setErr(await signIn(email, pw, kind, local ? 'local' : 'server'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: C.navy, paddingTop: insets.top + 40, paddingBottom: 36, paddingHorizontal: S.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: S.lg }}>
          <Icon name="trending-up" color={C.white} size={28} />
        </View>
        <Text style={T.heroBig}>US Bond{'\n'}Auto Invest</Text>
        <Text style={[T.heroSub, { marginTop: 8, fontSize: 15 }]}>미국 채권 ETF, 매달 자동으로 정수 주 적립</Text>
      </View>
      <View style={{ padding: S.lg, marginTop: -18 }}>
        <Card>
          <Segmented options={[{ label: '회원가입', value: 'signup' }, { label: '로그인', value: 'login' }]} value={kind} onChange={setKind} />
          <Field label="이메일" value={email} onChange={setEmail} placeholder="you@example.com" keyboard="email-address" />
          <Field label="비밀번호" value={pw} onChange={setPw} placeholder="8자 이상" secure error={err} />
          <Button title={busy ? '연결 중…' : kind === 'login' ? '로그인' : '가입하고 시작'} onPress={submit} disabled={busy} />
          <Pressable onPress={() => setLocal(!local)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: S.md }}>
            <Icon name={local ? 'checkbox' : 'square-outline'} color={local ? C.primary : C.faint} size={20} />
            <Text style={T.sub}>서버 없이 체험 (이 기기에만 저장)</Text>
          </Pressable>
        </Card>
        <Tip kind="warn" text="모의 환경입니다. 실제 돈과 실제 주문이 움직이지 않습니다." />
        <Text style={[T.tiny, { textAlign: 'center' }]}>
          {local ? '체험 모드: 기록이 이 기기에만 남습니다' : '서버 모드: 기록이 서버에 저장되고 매일 아침 자동 실행됩니다'}
        </Text>
      </View>
    </View>
  );
}
