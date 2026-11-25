// Deterministic shuffling so tests (and remounts) always see the same order.

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleOnce<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = rng(hash(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A Fisher-Yates shuffle seeded by `seed`. `reject` marks orders that must not be shown (for example the correct
 * order); other seeds are tried, then the reverse and rotations. If every order is rejected the last shuffle is returned.
 */
export function shuffleSeeded<T>(items: readonly T[], seed: string, reject: (order: T[]) => boolean = () => false): T[] {
  let candidate = shuffleOnce(items, seed);
  for (let n = 1; reject(candidate) && n <= 30; n++) candidate = shuffleOnce(items, `${seed}#${n}`);
  if (!reject(candidate)) return candidate;
  const fallbacks = [[...items].reverse(), ...items.map((_, i) => [...items.slice(i + 1), ...items.slice(0, i + 1)])];
  return fallbacks.find((o) => !reject(o)) ?? candidate;
}
