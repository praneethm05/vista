const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD" as a UTC midnight date, so time zones never shift the day. */
export function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The organisation's time zone. "Today" is the calendar date here, not in UTC. */
export const ORG_TIME_ZONE = process.env.ORG_TIME_ZONE ?? 'Asia/Kolkata';
const orgDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ORG_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in the organisation's time zone (01:30 IST on 7 Nov is 7 Nov, though UTC says 6 Nov). */
export function orgToday(now = new Date()): Date {
  return parseDay(orgDateFmt.format(now));
}

/** @deprecated name kept for older call sites; same as orgToday(). */
export const todayUtc = orgToday;

/** Inclusive count of calendar days: 1 Nov → 5 Nov = 5. Used for the ">3 consecutive days" rule. */
export function calendarDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

/** Inclusive count of Mon–Fri days. This is what gets deducted from the balance. */
export function workingDays(from: Date, to: Date): number {
  let count = 0;
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
