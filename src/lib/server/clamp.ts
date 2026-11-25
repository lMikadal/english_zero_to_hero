/** Client clocks may run ahead: a client timestamp is trusted only up to this far past the server's `now`. */
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export function clampToNow(clientIso: string, now: Date): Date {
  const t = new Date(clientIso);
  const limit = new Date(now.getTime() + MAX_FUTURE_SKEW_MS);
  return t > limit ? limit : t;
}
