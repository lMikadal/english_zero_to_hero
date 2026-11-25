import { localMidnight, resolveTimeZone } from "@/lib/progress/dates";

/** Client timestamps older than this are raised to it (or to the profile start, whichever is later). */
export const MAX_PAST_MS = 30 * 86_400_000;

/** The earliest instant a client timestamp may carry: max(now - 30 days, profile start date at local midnight). */
export function timestampFloor(now: Date, startDate: string, timeZone: string): Date {
  const start = localMidnight(startDate, resolveTimeZone(timeZone));
  return new Date(Math.max(now.getTime() - MAX_PAST_MS, start.getTime()));
}

/** A client clock is trusted only inside [floor, now]: nothing from the future, nothing absurdly old. */
export function clampTimestamp(clientIso: string, now: Date, floor: Date): Date {
  const t = new Date(clientIso).getTime();
  return new Date(Math.min(now.getTime(), Math.max(floor.getTime(), t)));
}
