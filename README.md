# US Bond Auto Invest

미국 채권 ETF(SGOV·SHY·IEF·TLT·BND)를 **매월 정수 주 단위로 자동 적립**하는 앱.
사양서 *Implementation Specification v3.0* 기준으로 단계별 구현 중입니다.

> ⚠️ 모의 환경입니다. 시세와 브로커는 모의이며 실제 주문·실제 돈은 움직이지 않습니다. `LIVE_TRADING_ENABLED` 는 켤 수 없습니다.

| 구분 | 주소 |
|---|---|
| 앱 (웹) | https://us-bond-auto-invest.vercel.app |
| API | https://us-bond-auto-invest-api.vercel.app/api/v1/health |

## 구성 (npm workspaces 모노레포)

```
apps/mobile/               React Native(Expo) 앱 — 화면 12개 (M-001~M-012)
apps/api/                  NestJS API (/api/v1) — Vercel 서버리스 + 매일 Cron
  migrations/              SQL 마이그레이션 001~009 (bond 스키마)
packages/investment-core/  적립 엔진·정수주 계산·거래일·모의 브로커·상태 변경 함수 (앱과 서버가 같이 사용)
```

## 진행 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| STEP 1·2 | API, DB 마이그레이션, 스케줄러 | ✅ (Redis/BullMQ 대신 DB 잠금 + Vercel Cron) |
| STEP 3·4 | 모바일 화면, 적립 엔진, 모의 브로커 | ✅ |
| STEP 5 | IBKR Paper Trading 어댑터 | 예정 (`BrokerAdapter` 인터페이스 그대로) |
| STEP 6 | 실거래 | IBKR 승인·규제 검토 후 |

## 중복 실행 방지 (사양서 7.5)

1. 사용자 단위 트랜잭션 잠금 (`pg_advisory_xact_lock`) — 같은 사용자 작업은 한 번에 하나
2. `investment_cycles.idempotency_key` UNIQUE + `(plan, 연, 월)` UNIQUE
3. `investment_orders.idempotency_key`, `order_executions.broker_execution_id` UNIQUE
4. 원장·체결·감사 로그는 트리거로 수정·삭제 금지 (정정은 반대 기록)

## 실행 (Windows PowerShell)

```powershell
npm install
# Postgres 준비 후
$env:DATABASE_URL="postgresql://postgres@127.0.0.1:5432/bond_auto"
npm -w @bond/api run migrate
$env:JWT_SECRET="local-secret-local-secret"; $env:AUTO_INVEST_ENABLED="true"
npm -w @bond/api run dev            # http://localhost:3000/api/v1/health
$env:EXPO_PUBLIC_API_URL="http://localhost:3000/api/v1"
npm -w mobile run web               # 앱
npm test                            # 엔진 + API 통합 테스트
```

## 주요 API (`/api/v1`)

`auth/signup` · `auth/login` · `users/me` · `state` · `consents` · `broker/connections` · `broker/accounts` ·
`etfs` · `etfs/:ticker` · `investment-plans` (+ `:id` PATCH, `/pause`, `/resume`, `/cancel`, `/cycles`) ·
`orders` · `orders/:id` · `portfolio` · `cash-ledger` · `dividends` · `notifications` ·
`simulation/advance` (모의 시간 이동) · `jobs/monthly-plan-scan` (Cron 전용)

## 환경 변수

`apps/api/.env.example` 참고. 운영 값은 Vercel 프로젝트 환경 변수에만 둡니다.
