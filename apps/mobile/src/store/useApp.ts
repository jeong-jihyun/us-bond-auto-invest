import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppData, CycleResult, MockScenario, audit, emptyData, newId,
  acceptConsents as aConsents, addPaperFunds as aFunds, cancelPlan as aCancel, connectBroker as aConnect,
  createPlan as aCreate, disconnectBroker as aDisconnect, markRead as aRead, pausePlan as aPause, rerunLastMonth as aRerun,
  resumePlan as aResume, runNextDue as aRunNext, setAutoInvest as aAuto, setScenario as aScenario, updatePlan as aUpdate,
  updateSettings as aSettings,
} from '@bond/investment-core';

export { validateAmountDay, MONTHLY_LIMIT } from '@bond/investment-core';

export type RouteName =
  | 'home' | 'etfs' | 'plans' | 'orders' | 'more'
  | 'etfDetail' | 'planForm' | 'planDetail' | 'orderDetail'
  | 'broker' | 'portfolio' | 'ledger' | 'alerts' | 'settings';
export type Route = { name: RouteName; params?: Record<string, any> };
export const TABS: RouteName[] = ['home', 'etfs', 'plans', 'orders', 'more'];

/** 서버 주소. 빌드할 때 EXPO_PUBLIC_API_URL 로 바꿀 수 있다 */
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://us-bond-auto-invest-api.vercel.app/api/v1').replace(/\/$/, '');

/** server: 실제 서버(DB)에 저장 · local: 이 기기에만 저장하는 체험 모드 */
export type Mode = 'server' | 'local';

interface Store {
  data: AppData;
  mode: Mode;
  token: string | null;
  stack: Route[];
  tab: RouteName;
  toast: string | null;
  busy: boolean;
  lastRun: CycleResult[] | null;
  lastSync: string | null;

  go: (name: RouteName, params?: Record<string, any>) => void;
  back: () => void;
  setTab: (t: RouteName) => void;
  showToast: (m: string) => void;

  signIn: (email: string, password: string, kind: 'login' | 'signup', mode: Mode) => Promise<string | null>;
  signOut: () => void;
  refresh: () => Promise<void>;

  connectBroker: () => Promise<string | null>;
  disconnectBroker: () => Promise<string | null>;
  acceptConsents: () => Promise<string | null>;
  createPlan: (i: { ticker: string; amount: string; day: number }) => Promise<string | null>;
  updatePlan: (id: string, i: { amount: string; day: number }) => Promise<string | null>;
  pausePlan: (id: string) => Promise<string | null>;
  resumePlan: (id: string) => Promise<string | null>;
  cancelPlan: (id: string) => Promise<string | null>;
  runNextDue: () => Promise<void>;
  rerunLastMonth: (planId: string) => Promise<void>;
  setScenario: (s: MockScenario) => Promise<string | null>;
  setAutoInvest: (v: boolean) => Promise<string | null>;
  addPaperFunds: () => Promise<string | null>;
  updateSettings: (p: Partial<AppData['settings']>) => Promise<string | null>;
  markRead: (id?: string) => Promise<string | null>;
  resetAll: () => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function api(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}) {
  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요', 0);
  }
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(`서버 응답을 읽을 수 없습니다 (${res.status})`, res.status);
  }
  if (!res.ok) {
    const msg = Array.isArray(json.message) ? json.message[0] : json.message;
    // 서버가 준 한국어 문구는 그대로, 영어 기본 문구(Internal server error 등)는 쉬운 말로 바꾼다
    const korean = msg && !/^[\x00-\x7F]*$/.test(String(msg));
    const text = korean
      ? String(msg)
      : res.status === 503
        ? '서버 저장소(DB)에 잠시 연결할 수 없습니다. 잠시 후 다시 시도하세요'
        : res.status >= 500
          ? '서버에 일시적인 문제가 생겼습니다. 잠시 후 다시 시도하세요'
          : `요청을 처리하지 못했습니다 (${res.status})`;
    throw new ApiError(text, res.status);
  }
  return json;
}

export const useApp = create<Store>()(
  persist(
    (set, get) => {
      /** 체험 모드: 기기 안에서 바로 바꾼다 */
      const local = async (fn: (d: AppData) => unknown) => {
        const d = clone(get().data);
        const r = await fn(d);
        const err = typeof r === 'string' ? r : (r as any)?.error ?? null;
        if (err) return err as string;
        set({ data: d });
        return null;
      };

      /** 서버 모드: 서버가 DB에 저장하고 새 상태를 돌려준다. 실패하면 오류 문구(string) */
      const remote = async (path: string, method = 'POST', body?: unknown): Promise<any> => {
        if (get().busy) return '처리 중입니다. 잠시만 기다리세요';
        set({ busy: true });
        try {
          const r = await api(path, { method, body, token: get().token });
          if (r.state) set({ data: r.state, lastSync: new Date().toISOString() });
          return r;
        } catch (e: any) {
          if (e instanceof ApiError && e.status === 401) {
            set({ token: null, data: emptyData(), stack: [{ name: 'home' }], tab: 'home' });
          }
          return (e?.message as string) ?? '오류가 발생했습니다';
        } finally {
          set({ busy: false });
        }
      };

      /** 같은 동작을 모드에 따라 서버 또는 기기에서 실행 */
      const act = async (path: string, method: string, body: unknown, fn: (d: AppData) => unknown) => {
        if (get().mode === 'local') return local(fn);
        const r = await remote(path, method, body);
        return typeof r === 'string' ? r : null;
      };

      return {
        data: emptyData(),
        mode: 'server',
        token: null,
        stack: [{ name: 'home' }],
        tab: 'home',
        toast: null,
        busy: false,
        lastRun: null,
        lastSync: null,

        go: (name, params) => {
          if (TABS.includes(name)) return set({ tab: name, stack: [{ name, params }] });
          set({ stack: [...get().stack, { name, params }] });
        },
        back: () => {
          const s = get().stack;
          if (s.length > 1) set({ stack: s.slice(0, -1) });
        },
        setTab: (t) => set({ tab: t, stack: [{ name: t }] }),
        showToast: (m) => {
          set({ toast: m });
          setTimeout(() => get().toast === m && set({ toast: null }), 2800);
        },

        signIn: async (email, password, kind, mode) => {
          const e = email.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return '이메일 형식을 확인하세요';
          if (password.length < 8) return '비밀번호는 8자 이상';
          if (mode === 'local') {
            const cur = get().data;
            if (get().mode === 'local' && cur.user?.email === e) {
              set({ stack: [{ name: 'home' }], tab: 'home' });
              return null;
            }
            const d = emptyData();
            d.user = { id: newId('usr'), email: e, countryCode: 'KR', timezone: 'Asia/Seoul', status: 'ACTIVE', createdAt: d.today };
            audit(d, kind === 'signup' ? 'USER_SIGNUP' : 'USER_LOGIN', 'users', e);
            set({ mode: 'local', token: null, data: d, stack: [{ name: 'home' }], tab: 'home', lastRun: null });
            return null;
          }
          set({ busy: true });
          try {
            const r = await api(`/auth/${kind}`, { method: 'POST', body: { email: e, password } });
            const s = await api('/state', { token: r.token });
            set({ mode: 'server', token: r.token, data: s.state, stack: [{ name: 'home' }], tab: 'home', lastRun: null, lastSync: new Date().toISOString() });
            return null;
          } catch (err: any) {
            return err?.message ?? '로그인하지 못했습니다';
          } finally {
            set({ busy: false });
          }
        },
        signOut: () => set({ token: null, data: emptyData(), stack: [{ name: 'home' }], tab: 'home', lastRun: null }),

        /** 서버에서 최신 상태 받기 (매일 아침 자동 실행 결과 반영) */
        refresh: async () => {
          if (get().mode !== 'server' || !get().token || get().busy) return;
          try {
            const s = await api('/state', { token: get().token });
            set({ data: s.state, lastSync: new Date().toISOString() });
          } catch (e: any) {
            if (e instanceof ApiError && e.status === 401) {
              set({ token: null, data: emptyData() });
              get().showToast('다시 로그인하세요');
            }
          }
        },

        connectBroker: async () => {
          const err = await act('/broker/connections', 'POST', undefined, (d) => aConnect(d));
          get().showToast(err ?? 'IBKR 모의(Paper) 계좌가 연결되었습니다');
          return err;
        },
        disconnectBroker: () => act('/broker/connections/current', 'DELETE', undefined, (d) => aDisconnect(d)),
        acceptConsents: () => act('/consents', 'POST', undefined, (d) => aConsents(d)),
        createPlan: (i) =>
          act('/investment-plans', 'POST', {
            ticker: i.ticker, monthlyAmount: i.amount, scheduledDay: i.day, currency: 'USD', frequency: 'MONTHLY',
            orderUnit: 'WHOLE_SHARE', orderType: 'LIMIT', cashRollover: true, timezone: get().data.settings.timezone,
          }, (d) => aCreate(d, i)),
        updatePlan: (id, i) => act(`/investment-plans/${id}`, 'PATCH', { monthlyAmount: i.amount, scheduledDay: i.day }, (d) => aUpdate(d, id, i)),
        pausePlan: (id) => act(`/investment-plans/${id}/pause`, 'POST', undefined, (d) => aPause(d, id)),
        resumePlan: (id) => act(`/investment-plans/${id}/resume`, 'POST', undefined, (d) => aResume(d, id)),
        cancelPlan: (id) => act(`/investment-plans/${id}/cancel`, 'POST', undefined, (d) => aCancel(d, id)),

        runNextDue: async () => {
          if (get().mode === 'local') {
            const d = clone(get().data);
            const r = await aRunNext(d);
            if (r.error) return get().showToast(r.error);
            set({ data: d, lastRun: r.results });
            return;
          }
          const r = await remote('/simulation/advance');
          if (typeof r === 'string') return get().showToast(r);
          set({ lastRun: r.result?.results ?? [] });
        },
        rerunLastMonth: async (planId) => {
          if (get().mode === 'local') {
            const d = clone(get().data);
            const r = await aRerun(d, planId);
            if (r.error) return get().showToast(r.error);
            set({ data: d });
            return get().showToast(r.message);
          }
          const r = await remote(`/simulation/rerun/${planId}`);
          get().showToast(typeof r === 'string' ? r : r.result?.message ?? '완료');
        },
        setScenario: (s) => act('/broker/scenario', 'PATCH', { scenario: s }, (d) => aScenario(d, s)),
        setAutoInvest: (v) => act('/users/me', 'PATCH', { autoInvestEnabled: v }, (d) => aAuto(d, v)),
        addPaperFunds: async () => {
          const err = await act('/broker/paper-funds', 'POST', undefined, (d) => aFunds(d, 1000));
          get().showToast(err ?? '모의 계좌에 $1,000 추가');
          return err;
        },
        updateSettings: (p) => act('/users/me', 'PATCH', p, (d) => aSettings(d, p)),
        markRead: (id) => act('/notifications/read', 'POST', id ? { id } : {}, (d) => aRead(d, id)),
        resetAll: () => set({ data: emptyData(), token: null, stack: [{ name: 'home' }], tab: 'home', lastRun: null }),
      };
    },
    {
      name: 'us-bond-auto-invest-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ data: s.data, mode: s.mode, token: s.token, lastSync: s.lastSync }),
    },
  ),
);
