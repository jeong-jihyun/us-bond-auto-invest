import { EtfProduct } from './types';

// Migration 001 시드 5종. 가격 기준값은 모의 브로커가 쓰는 출발점일 뿐 실제 시세가 아니다.
export const ETF_SEED: (EtfProduct & { basePrice: string; annualYield: string; volatility: number })[] = [
  {
    id: 'etf-sgov', ticker: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', assetCategory: 'SHORT_TERM',
    exchangeCode: 'NYSE Arca', currency: 'USD', expenseRatio: '0.0009', duration: '0.1', isActive: true,
    summary: '만기 3개월 이내 미국 국채. 가격 변동이 가장 작고 현금과 비슷하게 움직입니다.',
    basePrice: '100.50', annualYield: '0.042', volatility: 0.0003,
  },
  {
    id: 'etf-shy', ticker: 'SHY', name: 'iShares 1-3 Year Treasury Bond ETF', assetCategory: 'SHORT_TERM',
    exchangeCode: 'NASDAQ', currency: 'USD', expenseRatio: '0.0015', duration: '1.9', isActive: true,
    summary: '만기 1~3년 미국 국채. 금리 변화에 조금 반응하지만 변동이 작은 편입니다.',
    basePrice: '82.70', annualYield: '0.038', volatility: 0.0025,
  },
  {
    id: 'etf-ief', ticker: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF', assetCategory: 'INTERMEDIATE',
    exchangeCode: 'NASDAQ', currency: 'USD', expenseRatio: '0.0015', duration: '7.1', isActive: true,
    summary: '만기 7~10년 미국 국채. 금리가 오르면 가격이 눈에 띄게 내려갑니다.',
    basePrice: '95.40', annualYield: '0.036', volatility: 0.009,
  },
  {
    id: 'etf-tlt', ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', assetCategory: 'LONG_TERM',
    exchangeCode: 'NASDAQ', currency: 'USD', expenseRatio: '0.0015', duration: '16.4', isActive: true,
    summary: '만기 20년 이상 미국 국채. 금리 변화에 가장 크게 흔들립니다.',
    basePrice: '88.60', annualYield: '0.044', volatility: 0.02,
  },
  {
    id: 'etf-bnd', ticker: 'BND', name: 'Vanguard Total Bond Market ETF', assetCategory: 'AGGREGATE',
    exchangeCode: 'NASDAQ', currency: 'USD', expenseRatio: '0.0003', duration: '5.9', isActive: true,
    summary: '미국 투자등급 채권 전체(국채+회사채). 신용 위험이 일부 섞여 있습니다.',
    basePrice: '73.10', annualYield: '0.039', volatility: 0.007,
  },
];

export const CATEGORY_LABEL: Record<string, string> = {
  SHORT_TERM: '단기',
  INTERMEDIATE: '중기',
  LONG_TERM: '장기',
  AGGREGATE: '종합',
};

export const RISK_LEVEL: Record<string, { label: string; level: 1 | 2 | 3 }> = {
  SGOV: { label: '매우 낮음', level: 1 },
  SHY: { label: '낮음', level: 1 },
  IEF: { label: '보통', level: 2 },
  BND: { label: '보통', level: 2 },
  TLT: { label: '높음', level: 3 },
};

export const etfByTicker = (t: string) => ETF_SEED.find((e) => e.ticker === t)!;
export const etfById = (id: string) => ETF_SEED.find((e) => e.id === id)!;
