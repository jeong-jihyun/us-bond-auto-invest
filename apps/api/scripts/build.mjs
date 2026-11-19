// Vercel Build Output API(v3)로 직접 출력: 함수 1개 + 라우팅 + 매일 1회 Cron
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { bundle } from './bundle.mjs';

const out = new URL('../.vercel/output/', import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });
const fn = `${out}functions/api.func/`;
mkdirSync(fn, { recursive: true });
await bundle(new URL('../src/serverless.ts', import.meta.url).pathname, `${fn}index.js`);
writeFileSync(`${fn}.vc-config.json`, JSON.stringify({
  runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60,
}, null, 2));
writeFileSync(`${out}config.json`, JSON.stringify({
  version: 3,
  routes: [{ src: '/(.*)', dest: '/api' }],
  // 매일 07:00 KST (22:00 UTC). Hobby 플랜은 하루 1회까지 무료
  crons: [{ path: '/api/v1/jobs/monthly-plan-scan', schedule: '0 22 * * *' }],
}, null, 2));
console.log('built', out);
