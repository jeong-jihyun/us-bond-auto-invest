# US Bond Auto Invest

미국 채권 ETF(SGOV·SHY·IEF·TLT·BND)를 **매월 정수 주 단위로 자동 적립**하는 모바일 앱.
사양서 *Implementation Specification v3.0* 의 **STEP 3(모바일 화면) + STEP 4(적립 엔진·모의 브로커)** 를 구현한 1단계 결과물입니다.

> ⚠️ 모의 환경입니다. 시세는 모의 값이고 실제 주문·실제 돈은 움직이지 않습니다. `LIVE_TRADING_ENABLED` 는 항상 꺼져 있습니다.

## 구성

```
apps/mobile/            React Native(Expo) + TypeScript + Zustand
  src/core/             정수주 계산, 미국 거래일, 적립 엔진, 원장 (Decimal 연산)
  src/broker/           BrokerAdapter 인터페이스(사양서 6.2) + 모의 브로커
  src/screens/          화면 12개 (M-001 ~ M-012)
  __tests__/            단위·엔진 테스트 (사양서 11.1 표 포함)
```

| 사양서 화면 | 구현 |
|---|---|
| M-001 로그인 · M-002 대시보드 | LoginScreen · HomeScreen |
| M-003/004 ETF 탐색·상세 | EtfScreens |
| M-005 적립 설정 · M-007 적립 관리 | PlanScreens |
| M-006 계좌 · M-009 포트폴리오 · M-010 원장 · M-011 알림 | AccountScreens |
| M-008 주문 내역 | OrderScreens |
| M-012 설정 | SettingsScreens |

## 적립 엔진 (사양서 7장)

- 계획·연월마다 `idempotencyKey` 로 사이클 1건만 생성 → 중복 실행 차단
- 미국 주말·휴장일이면 다음 거래일 실행, 31일 설정은 말일로 보정
- 지정가 = 매도호가 + 0.1%, tick(0.01) 올림 → 수수료까지 넣어 **정수 주**만 주문
- 1주 미만이면 주문 없이 **현금 이월**
- 주문 전 예약 → 체결 시 예약 해제 + 체결금액 + 수수료를 원장에 따로 기록 (지우지 않음)
- 체결 ID 중복 반영 방지, 부분 체결은 체결분만 보유 반영 후 나머지 취소
- 설정 화면에서 브로커 시나리오(정상·부분체결·거부·잔액부족) 전환해 상태별 화면 확인

## 실행

```powershell
cd apps/mobile
npm install
npm test            # 단위·엔진 테스트
npm run web         # 브라우저
npx expo start      # Expo Go(폰)
npm run build:web   # dist/ 웹 빌드
```

## 다음 단계 (사양서 13장)

- STEP 1·2: NestJS API, PostgreSQL 마이그레이션, Redis/BullMQ 스케줄러로 엔진을 서버로 이동
- STEP 5: IBKR Paper Trading 어댑터 (같은 `BrokerAdapter` 인터페이스)
- STEP 6: IBKR 제3자 승인·국가별 규제 검토 후 실거래 스위치
