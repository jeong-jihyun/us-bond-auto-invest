// 처리 못 한 오류를 사용자가 이해할 수 있는 말로 바꾼다 (원인은 서버 로그에만 남김)
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

const DB_DOWN_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'CONNECT_TIMEOUT', 'XX000', '57P01', '57P03', '53300', '08006', '08001']);

export function isDbDown(e: any) {
  return DB_DOWN_CODES.has(e?.code) || /tenant|connect|terminat|timeout/i.test(String(e?.message ?? ''));
}

@Catch()
export class FriendlyErrorFilter implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof HttpException) {
      return res.status(e.getStatus()).json(e.getResponse());
    }
    console.error('[unhandled]', e?.code ?? '', e?.message ?? e);
    if (isDbDown(e)) {
      return res.status(503).json({ statusCode: 503, message: '서버 저장소(DB)에 잠시 연결할 수 없습니다. 잠시 후 다시 시도하세요' });
    }
    return res.status(500).json({ statusCode: 500, message: '서버에 일시적인 문제가 생겼습니다. 잠시 후 다시 시도하세요' });
  }
}
