import { RATINGS, previewRatings, type CardState, type Rating } from "./scheduler";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "10 นาที", "3 ชั่วโมง", "8 วัน", "2 เดือน", "1 ปี": rounded to the nearest whole number, never below 1. */
export function formatInterval(ms: number): string {
  const minutes = Math.round(ms / MIN);
  if (minutes < 60) return `${Math.max(1, minutes)} นาที`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} ชั่วโมง`;
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} วัน`;
  if (days < 365) return `${Math.round(days / 30)} เดือน`; // 345 to 364 days is "12 เดือน", not a year
  return `${Math.round(days / 365)} ปี`;
}

/** The text under each rating button: how long until the card comes back if that button is pressed now. */
export function ratingIntervalLabels(card: CardState, now: Date, timeZone: string): Record<Rating, string> {
  const next = previewRatings(card, now, timeZone);
  const out = {} as Record<Rating, string>;
  for (const r of RATINGS) out[r] = formatInterval(next[r].due.getTime() - now.getTime());
  return out;
}
