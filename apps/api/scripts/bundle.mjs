import { build } from 'esbuild';

// Nest가 있으면 쓰고 없으면 건너뛰는 선택 패키지들 — 번들에서 제외
const optional = [
  '@nestjs/microservices', '@nestjs/microservices/microservices-module', '@nestjs/websockets',
  '@nestjs/websockets/socket-module', '@nestjs/platform-fastify', '@fastify/static', 'cache-manager',
  'class-transformer/storage', '@mikro-orm/core', '@nestjs/mongoose', '@nestjs/typeorm', '@nestjs/sequelize',
];

export async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    sourcemap: false,
    minify: false,
    keepNames: true,
    external: optional,
    tsconfig: new URL('../tsconfig.json', import.meta.url).pathname,
    logLevel: 'warning',
  });
}
