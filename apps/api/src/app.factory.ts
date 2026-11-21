import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertConfig, config } from './config';
import { FriendlyErrorFilter } from './errors';

export async function createApp(): Promise<INestApplication> {
  assertConfig();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new FriendlyErrorFilter());
  app.enableCors({
    origin: (origin: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => {
      // 앱(네이티브)은 Origin이 없다. 웹은 허용 목록 + 로컬 개발 주소만
      if (!origin || config.corsOrigins.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  const http = app.getHttpAdapter().getInstance();
  http.disable?.('x-powered-by');
  http.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  return app;
}
