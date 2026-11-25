// Calendar-date maths in an IANA time zone, using only built-in Intl. Dates are "YYYY-MM-DD" strings.

import { DEFAULT_TIME_ZONE } from "./config";

const formatters = new Map<string, Intl.DateTimeFormat>();
const validity = new Map<string, boolean>();

/** True when `timeZone` is an IANA zone this runtime knows (use it to validate settings on save). */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  const cached = validity.get(timeZone);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
  } catch {
    ok = false;
  }
  validity.set(timeZone, ok);
  return ok;
}

/** The zone itself when valid, otherwise Asia/Bangkok, so a bad profile value never throws. */
export const resolveTimeZone = (timeZone: string | null | undefined): string =>
  timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;

function formatterFor(requested: string): Intl.DateTimeFormat {
  const timeZone = resolveTimeZone(requested);
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Calendar date of an instant in the given time zone. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const toUtcMs = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return addDays(date, 0) === date;
}
