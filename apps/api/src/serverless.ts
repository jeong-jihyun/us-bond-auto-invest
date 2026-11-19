// Vercel 함수 진입점: Nest 앱을 한 번 만들어 재사용한다
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './app.factory';

let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

export default async function (req: IncomingMessage, res: ServerResponse) {
  if (!handler) {
    const app = await createApp();
    await app.init();
    handler = app.getHttpAdapter().getInstance();
  }
  return handler!(req, res);
}
