// SQL 마이그레이션 실행기: migrations/*.sql 을 번호 순서로 한 번씩만 적용
import { readdirSync, readFileSync } from 'fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const dir = new URL('../migrations/', import.meta.url).pathname;

await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS bond;
  CREATE TABLE IF NOT EXISTS bond.schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
const done = new Set((await sql`SELECT version FROM bond.schema_migrations`).map((r) => r.version));
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(f)) continue;
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(dir + f, 'utf8'));
    await tx`INSERT INTO bond.schema_migrations (version) VALUES (${f})`;
  });
  console.log('applied', f);
}
await sql.end();
