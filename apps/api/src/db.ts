import postgres from 'postgres';
import { config } from './config';

export type Sql = postgres.Sql<{}>;
export type Tx = postgres.TransactionSql<{}>;

let client: Sql | null = null;

/** 서버리스 인스턴스마다 하나만 만든다. Supabase 풀러(트랜잭션 모드) 호환을 위해 prepare 끔 */
export function db(): Sql {
  if (!client) {
    client = postgres(config.databaseUrl, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return client;
}

export async function closeDb() {
  if (client) await client.end({ timeout: 5 });
  client = null;
}
