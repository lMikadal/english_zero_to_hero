// The safety guard of the E2E database helper (it runs in `make check`; the helper itself only runs in the E2E job).
import { describe, expect, it } from "vitest";
import { assertE2eDatabase, makeCardsDue } from "./due";

const url = (name: string) => `postgres://ezh:ezh@postgres:5432/${name}`;

describe("assertE2eDatabase", () => {
  it("accepts the dev database the e2e service points at", () => {
    expect(assertE2eDatabase(url("english_zero_to_hero_dev"))).toBe(url("english_zero_to_hero_dev"));
  });

  it("refuses the real database, the test database, a bare _dev and anything that only contains _dev", () => {
    for (const name of ["english_zero_to_hero", "english_zero_to_hero_dev_test", "_dev", "english_zero_to_hero_dev2", "postgres"]) {
      expect(() => assertE2eDatabase(url(name)), name).toThrow(/refuses/);
    }
  });

  it("refuses a URL that is not set, and does not fall back to DATABASE_URL", async () => {
    expect(() => assertE2eDatabase(undefined)).toThrow(/E2E_DATABASE_URL/);
    await expect(makeCardsDue("en_th", { DATABASE_URL: url("english_zero_to_hero_dev") })).rejects.toThrow(/E2E_DATABASE_URL/);
  });

  it("makeCardsDue checks the name before it connects", async () => {
    await expect(makeCardsDue("th_en", { E2E_DATABASE_URL: url("english_zero_to_hero") })).rejects.toThrow(/refuses/);
  });
});
