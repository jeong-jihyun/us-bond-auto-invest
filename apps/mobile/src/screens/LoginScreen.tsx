// M-001 로그인
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store/useApp';
import { Button, Card, Field, Icon, Segmented, T, Tip } from '../components/ui';
import { C, S } from '../theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useApp((s) => s.signIn);
  const lastEmail = useApp((s) => s.data.user?.email);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (pw.length < 6) return setErr('비밀번호는 6자 이상');
    setErr(signIn(email, mode));
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
          <Segmented options={[{ label: '로그인', value: 'login' }, { label: '회원가입', value: 'signup' }]} value={mode} onChange={setMode} />
          <Field label="이메일" value={email} onChange={setEmail} placeholder={lastEmail ?? 'you@example.com'} keyboard="email-address" />
          <Field label="비밀번호" value={pw} onChange={setPw} placeholder="6자 이상" secure error={err} />
          <Button title={mode === 'login' ? '로그인' : '가입하고 시작'} onPress={submit} />
        </Card>
        <Tip kind="warn" text="모의 환경입니다. 실제 돈과 실제 주문이 움직이지 않습니다." />
        {lastEmail ? <Text style={[T.tiny, { textAlign: 'center' }]}>최근 계정: {lastEmail} (같은 이메일로 로그인하면 기록 유지)</Text> : null}
      </View>
    </View>
  );
}
