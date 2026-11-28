// The safety guard of the E2E database helper (it runs in `make check`; the helper itself only runs in the E2E job).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertE2eDatabase, makeCardsDue } from "./due";

const url = (name: string) => `postgres://ezh:ezh@postgres:5432/${name}`;

describe("assertE2eDatabase", () => {
  it("accepts the dev database the e2e service points at", () => {
    expect(assertE2eDatabase(url("english_zero_to_hero_dev"))).toBe(url("english_zero_to_hero_dev"));
  });

  it("accepts the throwaway database of make e2e (a production build cannot use a _dev name)", () => {
    expect(assertE2eDatabase(url("english_zero_to_hero_e2e"))).toBe(url("english_zero_to_hero_e2e"));
  });

  it("refuses the real database, the stage/ci/test databases, a bare suffix and anything that only contains _dev or _e2e", () => {
    const names = ["english_zero_to_hero", "english_zero_to_hero_dev_test", "_dev", "_e2e", "english_zero_to_hero_dev2", "english_zero_to_hero_e2e2", "english_zero_to_hero_stage", "english_zero_to_hero_ci", "postgres"];
    for (const name of names) {
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

describe("make e2e", () => {
  const makefile = fs.readFileSync(path.join(process.cwd(), "Makefile"), "utf8");

  it("uses a throwaway database whose name the guard accepts, and never the real project", () => {
    const db = /^e2e-init:[\s\S]*?POSTGRES_DB=(\w+)\//m.exec(makefile)?.[1];
    expect(db).toBe("english_zero_to_hero_e2e");
    expect(() => assertE2eDatabase(url(db as string))).not.toThrow();
    const e2eTargets = makefile.slice(makefile.indexOf("e2e-init:"), makefile.indexOf("lint: ## ESLint"));
    expect(e2eTargets).not.toMatch(/ezh_prod|\.env\.prod/);
    expect(e2eTargets).toContain("-p ezh_e2e");
  });
});
