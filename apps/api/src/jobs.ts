// monthly-plan-scan: 사양서 7.1의 작업들을 한 번에 수행 (BullMQ 대신 DB 잠금 + UNIQUE 제약)
import { runDuePlans, todayKST } from '@bond/investment-core';
import { config } from './config';
import { db } from './db';
import { withUser } from './state.repo';

export async function monthlyPlanScan(today = todayKST()) {
  if (!config.autoInvestEnabled) {
    await db().unsafe(`INSERT INTO bond.job_runs (job_name, run_date, finished_at, detail) VALUES ('monthly-plan-scan', $1::date, NOW(), '{"skipped":"AUTO_INVEST_ENABLED=false"}'::jsonb)`, [today]);
    return { skipped: true, reason: 'AUTO_INVEST_ENABLED=false' };
  }
  const [run] = await db().unsafe(`INSERT INTO bond.job_runs (job_name, run_date) VALUES ('monthly-plan-scan', $1::date) RETURNING id`, [today]);
  // 모의 시간을 쓰는 사용자(sim_date 있음)는 자기 시계로만 움직이므로 실제 스케줄러 대상에서 뺀다
  const users = await db().unsafe(
    `SELECT DISTINCT p.user_id FROM bond.investment_plans p JOIN bond.users u ON u.id = p.user_id
      WHERE p.status = 'ACTIVE' AND p.next_scheduled_date <= $1::date AND u.sim_date IS NULL AND u.auto_invest_enabled`,
    [today]);
  let cycles = 0;
  let errors = 0;
  const detail: { userId: string; cycles?: number; error?: string }[] = [];
  for (const { user_id } of users) {
    try {
      const { result } = await withUser(user_id, async (d) => {
        d.today = today;
        return { results: await runDuePlans(d, today) };
      });
      cycles += result.results.length;
      detail.push({ userId: user_id, cycles: result.results.length });
    } catch (e: any) {
      errors += 1;
      detail.push({ userId: user_id, error: e?.code === '23505' ? 'DUPLICATE_BLOCKED' : String(e?.message ?? e).slice(0, 200) });
    }
  }
  await db().unsafe(
    `UPDATE bond.job_runs SET finished_at=NOW(), users_processed=$2, cycles_created=$3, errors=$4, detail=$5::text::jsonb WHERE id=$1`,
    [run.id, users.length, cycles, errors, JSON.stringify(detail)]);
  return { runDate: today, usersProcessed: users.length, cyclesCreated: cycles, errors };
}
