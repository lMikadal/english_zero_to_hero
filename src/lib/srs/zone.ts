// "Local wall-clock written as UTC": the trick that makes ts-fsrs count the learner's LOCAL days.
// ts-fsrs counts a day as the difference between UTC calendar dates, so an instant is shifted by the zone's UTC offset
// before it goes into the library and a due date of one day or more is shifted back. Pure and client-safe.
import { resolveTimeZone } from "@/lib/progress/dates";

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The zone's UTC offset in milliseconds at an instant (east of UTC is positive). */
export function offsetMs(instant: number, timeZone: string): number {
  const zone = resolveTimeZone(timeZone);
  if (zone === "UTC") return 0;
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(zone, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(instant))) p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/** The instant's local wall-clock reading, expressed as a UTC date. */
export const toLocalWall = (instant: Date, timeZone: string): Date => new Date(instant.getTime() + offsetMs(instant.getTime(), timeZone));

/**
 * The real instant whose local wall-clock reading is `wall` (read as UTC). A reading that does not exist (the hour
 * skipped when clocks go forward) maps to a nearby real instant, and an ambiguous one (clocks go back) to one of the two.
 */
export function fromLocalWall(wall: Date, timeZone: string): Date {
  const w = wall.getTime();
  const guess = w - offsetMs(w, timeZone);
  return new Date(w - offsetMs(guess, timeZone));
}
