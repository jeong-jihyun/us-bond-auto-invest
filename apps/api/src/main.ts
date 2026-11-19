// 로컬 실행: npm -w @bond/api run dev
import { createApp } from './app.factory';

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`API http://localhost:${port}/api/v1/health`);
}
bootstrap();
