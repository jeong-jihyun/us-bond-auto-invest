import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppData, audit, initialNextDate, newId, nextDueDate, planCash, processCycle, runDuePlans, CycleResult,
} from '../core/engine';
import { initialMockBrokerState, MockScenario } from '../broker/mockBroker';
import { etfByTicker } from '../core/etfs';
import { D, money } from '../core/money';
import { parseDate, scheduledDateFor } from '../core/calendar';

export type RouteName =
  | 'home' | 'etfs' | 'plans' | 'orders' | 'more'
  | 'etfDetail' | 'planForm' | 'planDetail' | 'orderDetail'
  | 'broker' | 'portfolio' | 'ledger' | 'alerts' | 'settings';
export type Route = { name: RouteName; params?: Record<string, any> };
export const TABS: RouteName[] = ['home', 'etfs', 'plans', 'orders', 'more'];

const todayKST = () => {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

const emptyData = (): AppData => ({
  user: null,
  consents: [],
  brokerConnection: null,
  plans: [],
  cycles: [],
  ledger: [],
  orders: [],
  executions: [],
  holdings: [],
  dividends: [],
  dividendMonths: [],
  notifications: [],
  audit: [],
  today: todayKST(),
  broker: null,
  // 모의 환경 전용으로 켜 둔다. 실거래 플래그는 항상 false.
  flags: { autoInvestEnabled: true, liveTradingEnabled: false },
  settings: { countryCode: 'KR', currency: 'USD', timezone: 'Asia/Seoul', mfaEnabled: false },
});

export const MONTHLY_LIMIT = 10000;
export const CONSENT_VERSION = '2026-11';

interface Store {
  data: AppData;
  stack: Route[];
  tab: RouteName;
  toast: string | null;
  lastRun: CycleResult[] | null;

  // navigation
  go: (name: RouteName, params?: Record<string, any>) => void;
  back: () => void;
  setTab: (t: RouteName) => void;
  showToast: (m: string) => void;

  // auth
  signIn: (email: string, mode: 'login' | 'signup') => string | null;
  signOut: () => void;

  // broker & consents
  connectBroker: () => void;
  disconnectBroker: () => string | null;
  acceptConsents: () => void;

  // plans
  createPlan: (i: { ticker: string; amount: string; day: number }) => string | null;
  updatePlan: (id: string, i: { amount: string; day: number }) => string | null;
  pausePlan: (id: string) => void;
  resumePlan: (id: string) => void;
  cancelPlan: (id: string) => void;

  // simulation
  runNextDue: () => Promise<void>;
  rerunLastMonth: (planId: string) => Promise<void>;
  setScenario: (s: MockScenario) => void;
  setAutoInvest: (v: boolean) => void;
  addPaperFunds: () => void;

  // misc
  updateSettings: (p: Partial<AppData['settings']>) => void;
  markRead: (id?: string) => void;
  resetAll: () => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const useApp = create<Store>()(
  persist(
    (set, get) => {
      const mutate = (fn: (d: AppData) => void) => {
        const d = clone(get().data);
        fn(d);
        set({ data: d });
      };

      return {
        data: emptyData(),
        stack: [{ name: 'home' }],
        tab: 'home',
        toast: null,
        lastRun: null,

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
          setTimeout(() => get().toast === m && set({ toast: null }), 2600);
        },

        signIn: (email, mode) => {
          const e = email.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return '이메일 형식을 확인하세요';
          const cur = get().data;
          if (cur.user && cur.user.email === e) {
            set({ stack: [{ name: 'home' }], tab: 'home' });
            return null;
          }
          // 다른 이메일이면 새 모의 계정으로 시작
          const d = emptyData();
          d.user = { id: newId('usr'), email: e, countryCode: 'KR', timezone: 'Asia/Seoul', status: 'ACTIVE', createdAt: d.today };
          audit(d, mode === 'signup' ? 'USER_SIGNUP' : 'USER_LOGIN', 'users', e);
          set({ data: d, stack: [{ name: 'home' }], tab: 'home' });
          return null;
        },
        signOut: () => mutate((d) => { d.user = null; }),

        connectBroker: () => {
          mutate((d) => {
            const acct = `DU${Math.floor(1000000 + Math.random() * 8999999)}`;
            d.brokerConnection = {
              id: newId('bc'), brokerCode: 'IBKR', externalAccountId: acct, environment: 'PAPER',
              connectionStatus: 'CONNECTED', createdAt: d.today,
            };
            if (!d.broker) d.broker = initialMockBrokerState(acct);
            else d.broker.accountId = acct;
            audit(d, 'BROKER_CONNECTED', 'broker_connections', `IBKR PAPER ${acct}`);
          });
          get().showToast('IBKR 모의(Paper) 계좌가 연결되었습니다');
        },
        disconnectBroker: () => {
          if (get().data.plans.some((p) => p.status === 'ACTIVE')) return '진행 중인 적립을 먼저 일시정지하거나 해지하세요';
          mutate((d) => {
            if (d.brokerConnection) d.brokerConnection.connectionStatus = 'DISCONNECTED';
            audit(d, 'BROKER_DISCONNECTED', 'broker_connections', '');
          });
          return null;
        },
        acceptConsents: () =>
          mutate((d) => {
            d.consents = [
              { consentType: 'RISK_DISCLOSURE', version: CONSENT_VERSION, acceptedAt: d.today },
              { consentType: 'AUTO_ORDER', version: CONSENT_VERSION, acceptedAt: d.today },
            ];
            audit(d, 'CONSENT_ACCEPTED', 'user_consents', CONSENT_VERSION);
          }),

        createPlan: ({ ticker, amount, day }) => {
          const d0 = get().data;
          if (!d0.brokerConnection || d0.brokerConnection.connectionStatus !== 'CONNECTED') return '먼저 IBKR 계좌를 연결하세요';
          if (d0.consents.length < 2) return '위험 고지와 자동주문 동의가 필요합니다';
          const err = validateAmountDay(amount, day);
          if (err) return err;
          const etf = etfByTicker(ticker);
          mutate((d) => {
            const plan = {
              id: newId('pln'), userId: d.user!.id, brokerConnectionId: d.brokerConnection!.id, etfId: etf.id, ticker,
              monthlyAmount: money(amount), currency: 'USD' as const, frequency: 'MONTHLY' as const, scheduledDay: day,
              orderUnit: 'WHOLE_SHARE' as const, orderType: 'LIMIT' as const, cashRollover: true, timezone: d.settings.timezone,
              status: 'ACTIVE' as const, nextScheduledDate: initialNextDate(d.today, day), createdAt: d.today, updatedAt: d.today,
            };
            d.plans.unshift(plan);
            audit(d, 'PLAN_CREATED', plan.id, `${ticker} $${plan.monthlyAmount} 매월 ${day}일`);
            d.notifications.unshift({
              id: newId('ntf'), type: 'INFO', title: `${ticker} 적립 시작`,
              content: `매월 ${day}일 $${plan.monthlyAmount}. 첫 실행 ${plan.nextScheduledDate}`, createdAt: `${d.today}T09:00:00`, readAt: null,
            });
          });
          return null;
        },
        updatePlan: (id, { amount, day }) => {
          const err = validateAmountDay(amount, day);
          if (err) return err;
          mutate((d) => {
            const p = d.plans.find((x) => x.id === id)!;
            const before = `$${p.monthlyAmount} ${p.scheduledDay}일`;
            p.monthlyAmount = money(amount);
            if (p.scheduledDay !== day) {
              p.scheduledDay = day;
              // 이미 이번 달 사이클이 있으면 다음 달부터 새 날짜
              if (p.nextScheduledDate) {
                const { y, m } = parseDate(p.nextScheduledDate);
                const cand = scheduledDateFor(y, m, day);
                p.nextScheduledDate = cand >= d.today ? cand : initialNextDate(d.today, day);
              }
            }
            p.updatedAt = d.today;
            audit(d, 'PLAN_UPDATED', id, `${before} → $${p.monthlyAmount} ${day}일`);
          });
          return null;
        },
        pausePlan: (id) =>
          mutate((d) => {
            const p = d.plans.find((x) => x.id === id)!;
            p.status = 'PAUSED';
            audit(d, 'PLAN_PAUSED', id, p.ticker);
          }),
        resumePlan: (id) =>
          mutate((d) => {
            const p = d.plans.find((x) => x.id === id)!;
            p.status = 'ACTIVE';
            p.nextScheduledDate = initialNextDate(d.today, p.scheduledDay);
            audit(d, 'PLAN_RESUMED', id, `다음 ${p.nextScheduledDate}`);
          }),
        cancelPlan: (id) =>
          mutate((d) => {
            const p = d.plans.find((x) => x.id === id)!;
            const rest = planCash(d, id);
            if (rest.gt(0)) {
              d.ledger.push({
                id: newId('led'), userId: p.userId, investmentPlanId: id, cycleId: null, transactionType: 'WITHDRAW_ON_CANCEL',
                amount: money(rest.neg()), currency: 'USD', referenceId: 'CANCEL', createdAt: `${d.today}T09:00:00`,
              });
            }
            p.status = 'CANCELLED';
            p.nextScheduledDate = null;
            audit(d, 'PLAN_CANCELLED', id, `잔액 $${rest.toFixed(2)} 반환`);
          }),

        runNextDue: async () => {
          const d = clone(get().data);
          const next = nextDueDate(d);
          if (!next) return get().showToast('실행할 적립이 없습니다');
          if (!d.flags.autoInvestEnabled) return get().showToast('설정에서 자동매수가 꺼져 있습니다');
          if (next > d.today) d.today = next;
          const results = await runDuePlans(d, d.today);
          set({ data: d, lastRun: results });
        },
        rerunLastMonth: async (planId) => {
          const d = clone(get().data);
          const plan = d.plans.find((p) => p.id === planId);
          const last = d.cycles.find((c) => c.investmentPlanId === planId);
          if (!plan || !last) return get().showToast('아직 실행된 달이 없습니다');
          const r = await processCycle(d, plan, last.scheduledDate);
          set({ data: d });
          get().showToast(r.message);
        },
        setScenario: (s) => mutate((d) => { if (d.broker) d.broker.scenario = s; }),
        setAutoInvest: (v) => mutate((d) => {
          d.flags.autoInvestEnabled = v;
          audit(d, 'FLAG_CHANGED', 'AUTO_INVEST_ENABLED', String(v));
        }),
        addPaperFunds: () => {
          mutate((d) => {
            if (d.broker) d.broker.availableFunds = D(d.broker.availableFunds).plus(1000).toFixed(2);
            audit(d, 'PAPER_FUNDS_ADDED', 'broker', '+$1,000');
          });
          get().showToast('모의 계좌에 $1,000 추가');
        },

        updateSettings: (p) => mutate((d) => {
          d.settings = { ...d.settings, ...p };
          if (p.timezone || p.countryCode) {
            if (d.user) { d.user.timezone = d.settings.timezone; d.user.countryCode = d.settings.countryCode; }
          }
          audit(d, 'SETTINGS_UPDATED', 'users', JSON.stringify(p));
        }),
        markRead: (id) => mutate((d) => {
          d.notifications.forEach((n) => { if (!id || n.id === id) n.readAt = n.readAt ?? d.today; });
        }),
        resetAll: () => set({ data: emptyData(), stack: [{ name: 'home' }], tab: 'home', lastRun: null }),
      };
    },
    {
      name: 'us-bond-auto-invest-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ data: s.data }),
    },
  ),
);

export function validateAmountDay(amount: string, day: number) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) return '금액은 숫자로, 소수 둘째 자리까지 입력하세요';
  const a = D(amount);
  if (a.lt(1)) return '월 적립금은 $1 이상이어야 합니다';
  if (a.gt(MONTHLY_LIMIT)) return `월 한도는 $${MONTHLY_LIMIT.toLocaleString()} 입니다`;
  if (!Number.isInteger(day) || day < 1 || day > 31) return '날짜는 1~31일 중에서 고르세요';
  return null;
}
