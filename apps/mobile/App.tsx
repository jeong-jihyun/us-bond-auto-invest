import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, RouteName, TABS } from './src/store/useApp';
import { C } from './src/theme';
import { Icon, IconName } from './src/components/ui';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { EtfDetailScreen, EtfListScreen } from './src/screens/EtfScreens';
import { PlanDetailScreen, PlanFormScreen, PlansScreen } from './src/screens/PlanScreens';
import { OrderDetailScreen, OrdersScreen } from './src/screens/OrderScreens';
import { AlertsScreen, BrokerScreen, LedgerScreen, PortfolioScreen } from './src/screens/AccountScreens';
import { MoreScreen, SettingsScreen } from './src/screens/SettingsScreens';

const TAB_UI: Record<string, [string, IconName, IconName]> = {
  home: ['홈', 'home', 'home-outline'],
  etfs: ['ETF', 'search', 'search-outline'],
  plans: ['적립', 'calendar', 'calendar-outline'],
  orders: ['주문', 'receipt', 'receipt-outline'],
  more: ['더보기', 'menu', 'menu-outline'],
};

function Router() {
  const stack = useApp((s) => s.stack);
  const r = stack[stack.length - 1];
  const p = r.params ?? {};
  switch (r.name) {
    case 'home': return <HomeScreen />;
    case 'etfs': return <EtfListScreen />;
    case 'etfDetail': return <EtfDetailScreen ticker={p.ticker} />;
    case 'plans': return <PlansScreen />;
    case 'planForm': return <PlanFormScreen key={JSON.stringify(p)} ticker={p.ticker} planId={p.planId} />;
    case 'planDetail': return <PlanDetailScreen planId={p.planId} />;
    case 'orders': return <OrdersScreen />;
    case 'orderDetail': return <OrderDetailScreen orderId={p.orderId} />;
    case 'more': return <MoreScreen />;
    case 'broker': return <BrokerScreen />;
    case 'portfolio': return <PortfolioScreen />;
    case 'ledger': return <LedgerScreen />;
    case 'alerts': return <AlertsScreen />;
    case 'settings': return <SettingsScreen />;
    default: return <HomeScreen />;
  }
}

function TabBar() {
  const insets = useSafeAreaInsets();
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8 }}>
      {TABS.map((t: RouteName) => {
        const on = tab === t;
        const [label, a, b] = TAB_UI[t];
        return (
          <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, alignItems: 'center', gap: 2 }} accessibilityRole="tab" accessibilityLabel={label}>
            <Icon name={on ? a : b} color={on ? C.navy : C.faint} size={22} />
            <Text style={{ fontSize: 11, color: on ? C.navy : C.faint, fontWeight: on ? '800' : '500' }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Toast() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 90, left: 20, right: 20, alignItems: 'center' }}>
      <View style={{ backgroundColor: 'rgba(15,23,42,0.92)', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 }}>
        <Text style={{ color: C.white, fontWeight: '700' }}>{toast}</Text>
      </View>
    </View>
  );
}

function BusyBar() {
  const busy = useApp((s) => s.busy);
  if (!busy) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: C.primary, opacity: 0.85 }} />
  );
}

function Shell() {
  const user = useApp((s) => s.data.user);
  const mode = useApp((s) => s.mode);
  const token = useApp((s) => s.token);
  const loggedIn = !!user && (mode === 'local' || !!token);
  const [ready, setReady] = useState(useApp.persist.hasHydrated());

  useEffect(() => {
    const unsub = useApp.persist.onFinishHydration(() => setReady(true));
    setReady(useApp.persist.hasHydrated());
    return unsub;
  }, []);

  // 앱을 열거나 다시 볼 때 서버 최신 상태 받기 (아침 자동 실행 결과 반영)
  useEffect(() => {
    if (!ready || !loggedIn) return;
    useApp.getState().refresh();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') useApp.getState().refresh();
    });
    return () => sub.remove();
  }, [ready, loggedIn]);

  // 안드로이드 뒤로가기 → 앱 내부 스택
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = useApp.getState();
      if (s.stack.length > 1) { s.back(); return true; }
      if (s.tab !== 'home') { s.setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.navy }}><ActivityIndicator color={C.white} /></View>;
  }
  return (
    <View style={{ flex: 1 }}>
      {loggedIn ? (<><View style={{ flex: 1 }}><Router /></View><TabBar /></>) : <LoginScreen />}
      <BusyBar />
      <Toast />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#DDE2EA' : C.bg, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 480, backgroundColor: C.bg, overflow: 'hidden' }}>
          <Shell />
        </View>
      </View>
    </SafeAreaProvider>
  );
}
