const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD" as a UTC midnight date, so time zones never shift the day. */
export function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayUtc(): Date {
  return parseDay(new Date().toISOString().slice(0, 10));
}

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
