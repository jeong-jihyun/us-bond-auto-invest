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
  // 매일 07:00 KST Cron은 apps/api/vercel.json 에만 둔다 (두 곳에 두면 duplicated_cron_job 오류)
}, null, 2));
console.log('built', out);
