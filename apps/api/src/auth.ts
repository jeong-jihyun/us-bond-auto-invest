import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { config } from './config';

export function signToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '30d' });
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const h: string = req.headers['authorization'] ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new UnauthorizedException('로그인이 필요합니다');
    try {
      const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { sub: string; email: string };
      req.userId = p.sub;
      req.userEmail = p.email;
      return true;
    } catch {
      throw new UnauthorizedException('로그인이 만료되었습니다. 다시 로그인하세요');
    }
  }
}

/** 토큰에서 꺼낸 사용자 ID — 요청 본문의 userId는 절대 믿지 않는다 */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().userId as string);

/** 아주 단순한 로그인 시도 제한 (인스턴스 단위). 운영에서는 게이트웨이/Edge에서 추가 제한 */
const attempts = new Map<string, { n: number; until: number }>();
export function checkRate(key: string, limit = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) {
    attempts.set(key, { n: 1, until: now + windowMs });
    return true;
  }
  a.n += 1;
  return a.n <= limit;
}
