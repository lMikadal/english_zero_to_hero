// docs/PROGRESS.md section 2: words that are really known.
import {
  DAY_MS,
  KNOWN_STABILITY_DAYS,
  MIN_CORRECT_RATING,
  MIN_GRADUATED_STATE,
  OFTEN_FORGOTTEN_LAPSES,
  OXFORD_3000_SIZE,
  REMEMBERED_STABILITY_DAYS,
  RETENTION_WINDOW_DAYS,
} from "./config";
import type { SrsCardLike, SrsDirectionLike, SrsReviewLike, VocabBankItem } from "./types";

export type WordStatus = "not_started" | "learning" | "remembered" | "known";
export type StatusCounts = Record<WordStatus, number>;

const emptyCounts = (): StatusCounts => ({ not_started: 0, learning: 0, remembered: 0, known: 0 });

/** A review counts as recalled when the rating is Hard, Good or Easy; Again is a miss. */
export const isRecalled = (r: Pick<SrsReviewLike, "rating">) => r.rating >= MIN_CORRECT_RATING;

/** Latest review of a direction was recalled. Reviews sharing the latest timestamp all have to be recalled (a tie that includes a miss is a miss). */
function lastReviewRecalled(reviews: readonly SrsReviewLike[], direction: SrsDirectionLike): boolean {
  let latestTime = -Infinity;
  let allRecalled = false;
  for (const r of reviews) {
    if (r.direction !== direction) continue;
    const t = r.reviewedAt.getTime();
    if (t > latestTime) {
      latestTime = t;
      allRecalled = isRecalled(r);
    } else if (t === latestTime) {
      allRecalled = allRecalled && isRecalled(r);
    }
  }
  return allRecalled;
}

/** Status of one word. `cards` are that word's cards; `reviews` may hold any words (matched by vocabId). */
export function wordStatus(cards: readonly SrsCardLike[], reviews: readonly SrsReviewLike[]): WordStatus {
  if (cards.length === 0) return "not_started";
  const id = cards[0].vocabId;
  const own = reviews.filter((r) => r.vocabId === id);
  const enTh = cards.find((c) => c.direction === "en_th");
  const thEn = cards.find((c) => c.direction === "th_en");
  if (
    enTh && thEn &&
    enTh.stability >= KNOWN_STABILITY_DAYS && thEn.stability >= KNOWN_STABILITY_DAYS &&
    lastReviewRecalled(own, "en_th") && lastReviewRecalled(own, "th_en")
  ) {
    return "known";
  }
  if (enTh && enTh.stability >= REMEMBERED_STABILITY_DAYS) return "remembered";
  return "learning";
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = m.get(k);
    if (list) list.push(item);
    else m.set(k, [item]);
  }
  return m;
}

function statusPerWord(bank: readonly VocabBankItem[], cards: readonly SrsCardLike[], reviews: readonly SrsReviewLike[]) {
  const cardsById = groupBy(cards, (c) => c.vocabId);
  const reviewsById = groupBy(reviews, (r) => r.vocabId);
  return bank.map((item) => ({
    item,
    status: wordStatus(cardsById.get(item.id) ?? [], reviewsById.get(item.id) ?? []),
  }));
}

/** Counts per status over the vocab bank, overall and per Oxford level. Cards of words not in the bank are ignored. */
export function countByStatus(
  bank: readonly VocabBankItem[],
  cards: readonly SrsCardLike[],
  reviews: readonly SrsReviewLike[],
): { total: StatusCounts; byLevel: Record<string, StatusCounts> } {
  const total = emptyCounts();
  const byLevel: Record<string, StatusCounts> = {};
  for (const { item, status } of statusPerWord(bank, cards, reviews)) {
    total[status] += 1;
    (byLevel[item.oxford.level] ??= emptyCounts())[status] += 1;
  }
  return { total, byLevel };
}

export function knownWordCount(
  bank: readonly VocabBankItem[],
  cards: readonly SrsCardLike[],
  reviews: readonly SrsReviewLike[],
): number {
  return statusPerWord(bank, cards, reviews).filter((w) => w.status === "known").length;
}

/** Known words of the Oxford 3000 list over the fixed list size (3,000). */
export function oxford3000Progress(
  bank: readonly VocabBankItem[],
  cards: readonly SrsCardLike[],
  reviews: readonly SrsReviewLike[],
): { known: number; total: number; fraction: number } {
  const known = statusPerWord(bank, cards, reviews).filter(
    (w) => w.status === "known" && w.item.oxford.list === "3000",
  ).length;
  return { known, total: OXFORD_3000_SIZE, fraction: known / OXFORD_3000_SIZE };
}

function stateBefore(r: SrsReviewLike): number | null {
  const s = r.stateBefore;
  if (typeof s === "object" && s !== null && "state" in s && typeof s.state === "number") return s.state;
  return null;
}

/** Recalled / reviewed over the last 30 days, for cards already past New/Learning. Null when there are none. */
export function retentionRate(reviews: readonly SrsReviewLike[], now: Date): number | null {
  const from = now.getTime() - RETENTION_WINDOW_DAYS * DAY_MS;
  let total = 0;
  let recalled = 0;
  for (const r of reviews) {
    const t = r.reviewedAt.getTime();
    if (t < from || t > now.getTime()) continue;
    const s = stateBefore(r);
    if (s === null || s < MIN_GRADUATED_STATE) continue;
    total += 1;
    if (isRecalled(r)) recalled += 1;
  }
  return total === 0 ? null : recalled / total;
}

/** Words with a card at lapses >= 3, worst first (ties by id). Lapses is the max over the word's cards. */
export function oftenForgotten(cards: readonly SrsCardLike[]): { vocabId: string; lapses: number }[] {
  const max = new Map<string, number>();
  for (const c of cards) max.set(c.vocabId, Math.max(max.get(c.vocabId) ?? 0, c.lapses));
  return [...max]
    .filter(([, lapses]) => lapses >= OFTEN_FORGOTTEN_LAPSES)
    .map(([vocabId, lapses]) => ({ vocabId, lapses }))
    .sort((a, b) => b.lapses - a.lapses || (a.vocabId < b.vocabId ? -1 : a.vocabId > b.vocabId ? 1 : 0));
}
