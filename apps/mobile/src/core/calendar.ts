// 날짜는 모두 'YYYY-MM-DD' 문자열로 다룬다 (사용자 시간대의 달력 날짜).

// NYSE 휴장일 (2026~2027). 실제 서비스는 trading_calendars 테이블에서 관리.
const US_MARKET_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04',
  '2028-09-04', '2028-11-23', '2028-12-25',
]);

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(s: string, n: number) {
  const { y, m, d } = parseDate(s);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function weekday(s: string) {
  const { y, m, d } = parseDate(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isUsTradingDay(s: string) {
  const w = weekday(s);
  return w !== 0 && w !== 6 && !US_MARKET_HOLIDAYS.has(s);
}

export function isUsHoliday(s: string) {
  return US_MARKET_HOLIDAYS.has(s);
}

/** 휴장일이면 다음 거래일로 */
export function nextTradingDay(s: string) {
  let cur = s;
  for (let i = 0; i < 10 && !isUsTradingDay(cur); i++) cur = addDays(cur, 1);
  return cur;
}

/** 해당 월의 실행일: 31일 설정 + 30일까지 있는 달 → 말일 */
export function scheduledDateFor(y: number, m: number, day: number) {
  return toDateStr(y, m, Math.min(day, daysInMonth(y, m)));
}

/** today 기준 다음 예정일 (오늘 포함) */
export function firstScheduledDate(today: string, day: number) {
  const { y, m } = parseDate(today);
  const thisMonth = scheduledDateFor(y, m, day);
  if (thisMonth >= today) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return scheduledDateFor(ny, nm, day);
}

export function nextMonthScheduled(prev: string, day: number) {
  const { y, m } = parseDate(prev);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return scheduledDateFor(ny, nm, day);
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(s: string | null | undefined) {
  if (!s) return '-';
  const { y, m, d } = parseDate(s.slice(0, 10));
  return `${y}.${pad(m)}.${pad(d)}(${WD[weekday(s.slice(0, 10))]})`;
}

export function diffDays(a: string, b: string) {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
