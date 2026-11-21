import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException,
  Param, Patch, Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import {
  AppData, CATEGORY_LABEL, ETF_SEED, RISK_LEVEL, acceptConsents, addDays, addPaperFunds, cancelPlan, connectBroker, createPlan,
  disconnectBroker, etfByTicker, markRead, mockQuote, pausePlan, planCash, portfolioSummary, rerunLastMonth, resumePlan,
  runNextDue, setAutoInvest, setScenario, todayKST, updatePlan, updateSettings, nextDueDate,
} from '@bond/investment-core';
import { AuthGuard, UserId, checkRate, signToken } from './auth';
import { config } from './config';
import { db } from './db';
import {
  CreateInvestmentPlanDto, LoginDto, ScenarioDto, SignupDto, UpdateInvestmentPlanDto, UpdateMeDto, validateBody,
} from './dto';
import { ActionError, NotFoundUser, withUser } from './state.repo';
import { monthlyPlanScan } from './jobs';

/** 사용자 작업 실행 + 오류를 HTTP 오류로 바꾸기 */
export async function run<T>(userId: string, fn: (d: AppData) => Promise<T> | T) {
  try {
    return await withUser(userId, fn);
  } catch (e: any) {
    if (e instanceof ActionError) throw new BadRequestException(e.message);
    if (e instanceof NotFoundUser) throw new UnauthorizedException('계정을 찾을 수 없습니다');
    if (e?.code === '23505') throw new ConflictException('이미 처리된 요청입니다 (중복 차단)');
    throw e;
  }
}

const publicUser = (d: AppData) => ({
  ...d.user,
  settings: d.settings,
  flags: { ...d.flags, envAutoInvestEnabled: config.autoInvestEnabled, brokerProvider: config.brokerProvider, ibkrEnv: config.ibkrEnv },
  today: d.today,
  simulated: d.today !== todayKST(),
});

@Controller('health')
export class HealthController {
  /** DB가 꺼져 있으면 503과 함께 db: 'down' 을 돌려준다 (모니터링용) */
  @Get()
  async health(@Req() req: any) {
    const base = { autoInvestEnabled: config.autoInvestEnabled, liveTradingEnabled: false, broker: config.brokerProvider };
    try {
      const [r] = await db().unsafe(`SELECT count(*)::int AS etfs FROM bond.etf_products`);
      const [j] = await db().unsafe(`SELECT run_date::text AS run_date, finished_at IS NOT NULL AS finished, cycles_created, errors
                                       FROM bond.job_runs ORDER BY started_at DESC LIMIT 1`);
      return { ok: true, db: 'up', etfs: r.etfs, lastJob: j ?? null, ...base };
    } catch (e: any) {
      console.error('[health]', e?.code ?? '', e?.message ?? e);
      req.res.status(503);
      return { ok: false, db: 'down', ...base };
    }
  }
}

@Controller('auth')
export class AuthController {
  @Post('signup')
  async signup(@Body() body: unknown, @Req() req: any) {
    if (!checkRate(`signup:${req.ip}`, 20)) throw new BadRequestException('잠시 후 다시 시도하세요');
    const dto = await validateBody(SignupDto, body);
    const email = dto.email.trim().toLowerCase();
    const hash = await bcrypt.hash(dto.password, 10);
    try {
      const [u] = await db().unsafe(
        `INSERT INTO bond.users (email, password_hash, country_code, timezone) VALUES ($1,$2,$3,$4) RETURNING id, email`,
        [email, hash, (dto.countryCode ?? 'KR').toUpperCase(), dto.timezone ?? 'Asia/Seoul']);
      await db().unsafe(`INSERT INTO bond.audit_logs (user_id, actor, action, resource, detail) VALUES ($1,$2,'USER_SIGNUP','users','')`, [u.id, email]);
      return { token: signToken(u.id, u.email), user: { id: u.id, email: u.email } };
    } catch (e: any) {
      if (e?.code === '23505') throw new ConflictException('이미 가입된 이메일입니다. 로그인하세요');
      throw e;
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: any) {
    const dto = await validateBody(LoginDto, body);
    const email = dto.email.trim().toLowerCase();
    if (!checkRate(`login:${email}`, 10)) throw new BadRequestException('로그인 시도가 너무 많습니다. 10분 뒤 다시 시도하세요');
    const [u] = await db().unsafe(`SELECT id, email, password_hash, status FROM bond.users WHERE email=$1`, [email]);
    if (!u || !(await bcrypt.compare(dto.password, u.password_hash))) throw new UnauthorizedException('이메일 또는 비밀번호가 맞지 않습니다');
    if (u.status !== 'ACTIVE') throw new ForbiddenException('사용할 수 없는 계정입니다');
    await db().unsafe(`INSERT INTO bond.audit_logs (user_id, actor, action, resource, detail) VALUES ($1,$2,'USER_LOGIN','users',$3)`,
      [u.id, email, String(req.ip ?? '').slice(0, 60)]);
    return { token: signToken(u.id, u.email), user: { id: u.id, email: u.email } };
  }
}

@Controller()
@UseGuards(AuthGuard)
export class MeController {
  /** 앱이 한 번에 받는 전체 상태 (화면 계산은 앱에서) */
  @Get('state')
  async state(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return { state };
  }

  @Get('users/me')
  async me(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return publicUser(state);
  }

  @Patch('users/me')
  async updateMe(@UserId() userId: string, @Body() body: unknown) {
    const dto = await validateBody(UpdateMeDto, body);
    return run(userId, (d) => {
      updateSettings(d, dto);
      if (typeof dto.autoInvestEnabled === 'boolean') setAutoInvest(d, dto.autoInvestEnabled);
      return null;
    });
  }

  @Post('consents')
  async consents(@UserId() userId: string) {
    return run(userId, (d) => acceptConsents(d));
  }
}

@Controller('broker')
@UseGuards(AuthGuard)
export class BrokerController {
  /** IBKR 승인 전까지는 모의(Paper 대체) 계좌만 연결한다 */
  @Post('connections')
  async connect(@UserId() userId: string) {
    return run(userId, (d) => connectBroker(d));
  }

  @Delete('connections/current')
  async disconnect(@UserId() userId: string) {
    return run(userId, (d) => disconnectBroker(d));
  }

  @Get('accounts')
  async accounts(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    const bc = state.brokerConnection;
    return bc
      ? [{ ...bc, availableFunds: state.broker?.availableFunds ?? '0.00', currency: 'USD', scenario: state.broker?.scenario ?? 'NORMAL' }]
      : [];
  }

  @Post('paper-funds')
  async funds(@UserId() userId: string) {
    return run(userId, (d) => addPaperFunds(d, 1000));
  }

  @Patch('scenario')
  async scenario(@UserId() userId: string, @Body() body: unknown) {
    const dto = await validateBody(ScenarioDto, body);
    return run(userId, (d) => setScenario(d, dto.scenario));
  }
}

const etfView = (ticker: string, date: string) => {
  const e = etfByTicker(ticker);
  const q = mockQuote(ticker, date);
  return {
    id: e.id, ticker: e.ticker, name: e.name, assetCategory: e.assetCategory, categoryLabel: CATEGORY_LABEL[e.assetCategory],
    exchangeCode: e.exchangeCode, currency: e.currency, expenseRatio: e.expenseRatio, duration: e.duration, isActive: e.isActive,
    risk: RISK_LEVEL[e.ticker], summary: e.summary, quote: { ...q, source: 'MOCK' },
  };
};

@Controller('etfs')
export class EtfController {
  @Get()
  list() {
    const today = todayKST();
    return ETF_SEED.map((e) => etfView(e.ticker, today));
  }

  @Get(':ticker')
  detail(@Param('ticker') ticker: string) {
    const t = ticker.toUpperCase();
    if (!ETF_SEED.some((e) => e.ticker === t)) throw new NotFoundException('ETF를 찾을 수 없습니다');
    const today = todayKST();
    const history = Array.from({ length: 30 }, (_, i) => {
      const date = addDays(today, i - 29);
      return { date, lastPrice: mockQuote(t, date).lastPrice };
    });
    return { ...etfView(t, today), history };
  }
}

@Controller('investment-plans')
@UseGuards(AuthGuard)
export class PlanController {
  @Post()
  async create(@UserId() userId: string, @Body() body: unknown) {
    const dto = await validateBody(CreateInvestmentPlanDto, body);
    return run(userId, (d) => {
      if (dto.brokerConnectionId && d.brokerConnection?.id !== dto.brokerConnectionId) return '본인 계좌가 아닙니다';
      if (dto.currency && dto.currency !== 'USD') return 'USD만 지원합니다';
      const ticker = dto.ticker?.toUpperCase() ?? ETF_SEED.find((e) => e.id === dto.etfId)?.ticker;
      if (!ticker || !ETF_SEED.some((e) => e.ticker === ticker)) return 'ETF를 확인하세요';
      return createPlan(d, { ticker, amount: dto.monthlyAmount, day: dto.scheduledDay });
    });
  }

  @Get()
  async list(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return state.plans.map((p) => ({ ...p, pendingCash: planCash(state, p.id).toFixed(2) }));
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const dto = await validateBody(UpdateInvestmentPlanDto, body);
    return run(userId, (d) => updatePlan(d, id, { amount: dto.monthlyAmount, day: dto.scheduledDay }));
  }

  @Post(':id/pause')
  async pause(@UserId() userId: string, @Param('id') id: string) {
    return run(userId, (d) => pausePlan(d, id));
  }

  @Post(':id/resume')
  async resume(@UserId() userId: string, @Param('id') id: string) {
    return run(userId, (d) => resumePlan(d, id));
  }

  @Post(':id/cancel')
  async cancel(@UserId() userId: string, @Param('id') id: string) {
    return run(userId, (d) => cancelPlan(d, id));
  }

  @Get(':id/cycles')
  async cycles(@UserId() userId: string, @Param('id') id: string) {
    const { state } = await run(userId, () => null);
    if (!state.plans.some((p) => p.id === id)) throw new NotFoundException('적립을 찾을 수 없습니다');
    return state.cycles.filter((c) => c.investmentPlanId === id);
  }
}

@Controller()
@UseGuards(AuthGuard)
export class ReadController {
  @Get('orders')
  async orders(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return state.orders;
  }

  @Get('orders/:id')
  async order(@UserId() userId: string, @Param('id') id: string) {
    const { state } = await run(userId, () => null);
    const o = state.orders.find((x) => x.id === id);
    if (!o) throw new NotFoundException('주문을 찾을 수 없습니다');
    return { ...o, executions: state.executions.filter((e) => e.orderId === id) };
  }

  @Get('portfolio')
  async portfolio(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return portfolioSummary(state);
  }

  @Get('cash-ledger')
  async ledger(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return state.ledger;
  }

  @Get('dividends')
  async dividends(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return state.dividends;
  }

  @Get('notifications')
  async notifications(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return state.notifications;
  }

  @Post('notifications/read')
  async read(@UserId() userId: string, @Body() body: any) {
    return run(userId, (d) => markRead(d, typeof body?.id === 'string' ? body.id : undefined));
  }
}

/** 모의 시간 이동 — 실제 서비스에서는 쓰지 않고 체험·검증용 */
@Controller('simulation')
@UseGuards(AuthGuard)
export class SimulationController {
  @Post('advance')
  async advance(@UserId() userId: string) {
    return run(userId, (d) => runNextDue(d));
  }

  @Post('rerun/:planId')
  async rerun(@UserId() userId: string, @Param('planId') planId: string) {
    return run(userId, (d) => rerunLastMonth(d, planId));
  }

  @Get('next')
  async next(@UserId() userId: string) {
    const { state } = await run(userId, () => null);
    return { today: state.today, nextDue: nextDueDate(state) };
  }
}

@Controller('jobs')
export class JobsController {
  /** Vercel Cron(매일 1회)이 Authorization: Bearer CRON_SECRET 으로 호출 */
  @Get('monthly-plan-scan')
  async scan(@Req() req: any) {
    if (!config.cronSecret || req.headers['authorization'] !== `Bearer ${config.cronSecret}`) {
      throw new UnauthorizedException('cron only');
    }
    return monthlyPlanScan();
  }
}
