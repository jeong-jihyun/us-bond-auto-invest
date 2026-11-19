import React, { ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S, ORDER_STATUS_UI } from '../theme';
import { useApp } from '../store/useApp';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const Icon = ({ name, size = 20, color = C.text }: { name: IconName; size?: number; color?: string }) => (
  <Ionicons name={name} size={size} color={color} />
);

/** 모든 화면 공통 틀: 남색 헤더 + 스크롤 본문 */
export function Screen({ title, children, back, right, hero }: { title: string; children: ReactNode; back?: boolean; right?: ReactNode; hero?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const goBack = useApp((s) => s.back);
  const unread = useApp((s) => s.data.notifications.filter((n) => !n.readAt).length);
  const go = useApp((s) => s.go);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.header, { paddingTop: insets.top + 10 }]}>
        <View style={st.headerRow}>
          {back ? (
            <Pressable onPress={goBack} hitSlop={12} style={st.iconBtn} accessibilityLabel="뒤로">
              <Icon name="chevron-back" color={C.white} size={24} />
            </Pressable>
          ) : null}
          <Text style={st.headerTitle} numberOfLines={1}>{title}</Text>
          {right ?? (
            <Pressable onPress={() => go('alerts')} hitSlop={12} style={st.iconBtn} accessibilityLabel="알림">
              <Icon name="notifications-outline" color={C.white} size={22} />
              {unread > 0 ? <View style={st.badge}><Text style={st.badgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
            </Pressable>
          )}
        </View>
        {hero}
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export const Card = ({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) =>
  onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [st.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>
  ) : (
    <View style={[st.card, style]}>{children}</View>
  );

export const SectionTitle = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <View style={[st.row, { marginTop: S.lg, marginBottom: S.sm }]}>
    <Text style={st.section}>{children}</Text>
    {right}
  </View>
);

export function Button({ title, onPress, kind = 'primary', icon, disabled, small }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'light'; icon?: IconName; disabled?: boolean; small?: boolean;
}) {
  const bg = kind === 'primary' ? C.primary : kind === 'danger' ? C.dangerSoft : kind === 'light' ? 'rgba(255,255,255,0.16)' : C.white;
  const fg = kind === 'primary' ? C.white : kind === 'danger' ? C.danger : kind === 'light' ? C.white : C.primary;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        st.btn, small && st.btnSmall, { backgroundColor: bg, borderColor: kind === 'ghost' ? C.line : bg },
        disabled && { opacity: 0.4 }, pressed && !disabled && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
    >
      {icon ? <Icon name={icon} color={fg} size={small ? 16 : 18} /> : null}
      <Text style={[st.btnText, small && { fontSize: F.small }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export const Chip = ({ label, fg = C.sub, bg = C.bg }: { label: string; fg?: string; bg?: string }) => (
  <View style={[st.chip, { backgroundColor: bg }]}><Text style={[st.chipText, { color: fg }]}>{label}</Text></View>
);

export const OrderBadge = ({ status }: { status: string }) => {
  const ui = ORDER_STATUS_UI[status] ?? { label: status, fg: C.sub, bg: C.bg };
  return <Chip label={ui.label} fg={ui.fg} bg={ui.bg} />;
};

export const Row = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => <View style={[st.row, style]}>{children}</View>;

export const KV = ({ k, v, vColor, bold }: { k: string; v: ReactNode; vColor?: string; bold?: boolean }) => (
  <View style={st.kv}>
    <Text style={st.k}>{k}</Text>
    {typeof v === 'string' ? <Text style={[st.v, vColor ? { color: vColor } : null, bold && { fontWeight: '800' }]}>{v}</Text> : v}
  </View>
);

/** 짧은 안내/경고 상자 */
export const Tip = ({ text, kind = 'info', icon }: { text: string; kind?: 'info' | 'warn' | 'danger' | 'ok'; icon?: IconName }) => {
  const m = {
    info: [C.primarySoft, C.primary, 'information-circle'],
    warn: [C.warnSoft, C.warn, 'alert-circle'],
    danger: [C.dangerSoft, C.danger, 'warning'],
    ok: [C.okSoft, C.ok, 'checkmark-circle'],
  }[kind] as [string, string, IconName];
  return (
    <View style={[st.tip, { backgroundColor: m[0] }]}>
      <Icon name={icon ?? m[2]} color={m[1]} size={18} />
      <Text style={[st.tipText, { color: m[1] }]}>{text}</Text>
    </View>
  );
};

/** ? 아이콘을 누르면 펼쳐지는 도움말 */
export function Help({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={st.helpBtn} hitSlop={8}>
        <Text style={st.helpTitle}>{title}</Text>
        <Icon name={open ? 'help-circle' : 'help-circle-outline'} color={C.faint} size={16} />
      </Pressable>
      {open ? <Text style={st.helpText}>{text}</Text> : null}
    </View>
  );
}

export const Field = ({ label, value, onChange, placeholder, keyboard, prefix, secure, error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: 'default' | 'decimal-pad' | 'email-address';
  prefix?: string; secure?: boolean; error?: string | null;
}) => (
  <View style={{ marginBottom: S.md }}>
    <Text style={st.label}>{label}</Text>
    <View style={[st.inputWrap, error ? { borderColor: C.danger } : null]}>
      {prefix ? <Text style={st.prefix}>{prefix}</Text> : null}
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.faint}
        keyboardType={keyboard ?? 'default'} secureTextEntry={secure} autoCapitalize="none" style={st.input}
      />
    </View>
    {error ? <Text style={st.err}>{error}</Text> : null}
  </View>
);

export function Segmented<T extends string>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={st.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[st.segItem, on && st.segOn]}>
            <Text style={[st.segText, on && { color: C.navy, fontWeight: '700' }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Empty = ({ icon, text, action }: { icon: IconName; text: string; action?: ReactNode }) => (
  <View style={st.empty}>
    <Icon name={icon} size={36} color={C.faint} />
    <Text style={st.emptyText}>{text}</Text>
    {action}
  </View>
);

export const Divider = () => <View style={{ height: 1, backgroundColor: C.line, marginVertical: S.sm }} />;

export function ListItem({ icon, title, sub, right, onPress }: { icon?: IconName; title: string; sub?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.li, pressed && onPress && { backgroundColor: C.bg }]}>
      {icon ? <View style={st.liIcon}><Icon name={icon} color={C.primary} size={18} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={st.liTitle}>{title}</Text>
        {sub ? <Text style={st.liSub}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" color={C.faint} size={18} /> : null)}
    </Pressable>
  );
}

export const T = {
  big: { fontSize: F.h1, fontWeight: '800' as const, color: C.text },
  h2: { fontSize: F.h2, fontWeight: '800' as const, color: C.text },
  h3: { fontSize: F.h3, fontWeight: '700' as const, color: C.text },
  body: { fontSize: F.body, color: C.text },
  sub: { fontSize: F.small, color: C.sub },
  tiny: { fontSize: F.tiny, color: C.faint },
  heroBig: { fontSize: 30, fontWeight: '800' as const, color: C.white },
  heroSub: { fontSize: F.small, color: 'rgba(255,255,255,0.72)' },
};

export const st = StyleSheet.create({
  header: { backgroundColor: C.navy, paddingHorizontal: S.lg, paddingBottom: S.lg, borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  headerTitle: { flex: 1, color: C.white, fontSize: F.h3, fontWeight: '800' },
  iconBtn: { padding: 4, marginRight: 4 },
  badge: { position: 'absolute', top: -2, right: -4, backgroundColor: C.up, borderRadius: 9, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: C.white, fontSize: 10, fontWeight: '800' },
  card: {
    backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, borderWidth: 1, borderColor: C.line,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' } as any) : { elevation: 1 }),
  },
  section: { fontSize: F.h3, fontWeight: '800', color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: S.lg, borderRadius: R.md, borderWidth: 1 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: S.md },
  btnText: { fontSize: F.body, fontWeight: '700' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  chipText: { fontSize: F.tiny, fontWeight: '700' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  k: { fontSize: F.small, color: C.sub },
  v: { fontSize: F.body, color: C.text, fontWeight: '600' },
  tip: { flexDirection: 'row', gap: 8, padding: S.md, borderRadius: R.md, marginBottom: S.md, alignItems: 'flex-start' },
  tipText: { flex: 1, fontSize: F.small, lineHeight: 19, fontWeight: '600' },
  helpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  helpTitle: { fontSize: F.small, color: C.sub, fontWeight: '700' },
  helpText: { fontSize: F.small, color: C.sub, lineHeight: 19, backgroundColor: C.bg, padding: S.sm, borderRadius: R.sm, marginBottom: S.sm },
  label: { fontSize: F.small, color: C.sub, fontWeight: '700', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: R.md, backgroundColor: C.white, paddingHorizontal: S.md },
  prefix: { fontSize: F.h3, color: C.sub, marginRight: 4 },
  input: { flex: 1, fontSize: F.h3, paddingVertical: 12, color: C.text, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  err: { color: C.danger, fontSize: F.small, marginTop: 4 },
  seg: { flexDirection: 'row', backgroundColor: '#E6EAF1', borderRadius: R.md, padding: 3, marginBottom: S.md },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: R.sm },
  segOn: { backgroundColor: C.white },
  segText: { fontSize: F.small, color: C.sub },
  empty: { alignItems: 'center', padding: S.xl, gap: S.sm },
  emptyText: { color: C.sub, fontSize: F.body, textAlign: 'center' },
  li: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: S.md },
  liIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  liTitle: { fontSize: F.body, fontWeight: '700', color: C.text },
  liSub: { fontSize: F.small, color: C.sub, marginTop: 2 },
});
