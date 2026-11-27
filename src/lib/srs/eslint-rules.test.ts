// @vitest-environment node
// The machine-enforced rules of the vocabulary review (docs/plans/vocab-review-plan.md section 6, PR 1):
//  1. only the adapter (src/lib/srs/scheduler.ts) may import ts-fsrs;
//  2. nothing in src/lib/srs/** reads the clock (Date.now(), new Date() without an argument): time comes in as a parameter.
// These tests run the real ESLint config on small snippets, so deleting or loosening a rule fails here.
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const eslint = new ESLint({ cwd: root });

async function messages(code: string, file: string, ruleId?: string) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages.filter((m) => (ruleId ? m.ruleId === ruleId : true));
}

describe("only the scheduler adapter imports ts-fsrs", () => {
  const imports = ['import { DefaultScheduler } from "ts-fsrs";', 'import { FSRS6Model } from "ts-fsrs/models/fsrs-6";', 'import * as M from "ts-fsrs/middlewares";'];
  it.each(imports)("is allowed in the adapter: %s", async (code) => {
    expect(await messages(`${code}\nexport const x = 1;`, "src/lib/srs/scheduler.ts", "no-restricted-imports")).toEqual([]);
  });
  it.each(["src/lib/srs/queue.ts", "src/lib/srs/simulate.ts", "src/components/review/ReviewCard.tsx", "src/lib/server/review-handler.ts", "src/app/page.tsx"])(
    "is an error elsewhere: %s",
    async (file) => {
      for (const code of imports) {
        const m = await messages(`${code}\nexport const x = 1;`, file, "no-restricted-imports");
        expect(m, `${file}: ${code}`).toHaveLength(1);
        expect(m[0].message).toMatch(/scheduler/);
      }
    },
  );
  it("also holds for the practice handlers, which have their own import rule", async () => {
    const m = await messages('import { DefaultScheduler } from "ts-fsrs";\nexport const x = 1;', "src/lib/server/practice-complete-handler.ts", "no-restricted-imports");
    expect(m).toHaveLength(1);
  });
  it("type-only imports are not an exception (nothing outside the adapter may know the library)", async () => {
    const m = await messages('import type { Card } from "ts-fsrs";\nexport type X = Card;', "src/lib/srs/queue.ts", "no-restricted-imports");
    expect(m).toHaveLength(1);
  });
});

describe("the ts-fsrs ban cannot be lost by a later config block", () => {
  // In flat config, a later block that sets `no-restricted-imports` REPLACES the earlier value for the files it matches.
  type Block = { rules?: Record<string, unknown>; name?: string };
  const patternsOf = (value: unknown): { group?: string[] }[] => {
    const options = Array.isArray(value) ? value[1] : undefined;
    return (options && typeof options === "object" && "patterns" in options ? (options as { patterns: { group?: string[] }[] }).patterns : []) ?? [];
  };
  /** The blocks that set no-restricted-imports without banning ts-fsrs. */
  const missingTsFsrs = (blocks: Block[]) =>
    blocks.filter((b) => b.rules && "no-restricted-imports" in b.rules && !patternsOf(b.rules["no-restricted-imports"]).some((p) => p.group?.includes("ts-fsrs")));

  it("every block of the real config that sets no-restricted-imports includes the ts-fsrs pattern", async () => {
    const config = (await import(path.join(root, "eslint.config.mjs"))).default as Block[];
    const setting = config.filter((b) => b.rules && "no-restricted-imports" in b.rules);
    expect(setting.length).toBeGreaterThanOrEqual(2); // the general block and the practice-* block
    expect(missingTsFsrs(config)).toEqual([]);
  });
  it("the check itself notices a block without the pattern, and one that sets the rule to something else", () => {
    const withIt: Block = { rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["ts-fsrs", "ts-fsrs/*"] }] }] } };
    const without: Block = { rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/db/schema"] }] }] } };
    const paths: Block = { rules: { "no-restricted-imports": ["error", { paths: ["x"] }] } };
    expect(missingTsFsrs([withIt])).toEqual([]);
    expect(missingTsFsrs([withIt, without, paths])).toEqual([without, paths]);
    expect(missingTsFsrs([{ rules: { "no-console": "error" } }])).toEqual([]);
  });
  it.each(["src/lib/x.js", "src/lib/x.cjs", "src/lib/x.mts", "src/lib/x.mjs", "scripts/x.mjs", "src/lib/x.jsx"])("the ban also covers %s", async (file) => {
    const m = await messages('import { DefaultScheduler } from "ts-fsrs";\nexport const x = 1;', file, "no-restricted-imports");
    expect(m).toHaveLength(1);
  });
});

describe("no clock inside src/lib/srs/**", () => {
  const bad: [string, string][] = [
    ["Date.now()", "export const t = Date.now();"],
    ["new Date()", "export const t = new Date();"],
    ["Date.now passed around", "export const f = Date.now;"],
  ];
  it.each(bad)("%s is an error", async (_n, code) => {
    for (const file of ["src/lib/srs/queue.ts", "src/lib/srs/scheduler.ts", "src/lib/srs/anything.test.ts"]) {
      const m = await messages(code, file, "no-restricted-syntax");
      expect(m, file).toHaveLength(1);
    }
  });
  it.each(["export const t = new Date(0);", "export const t = new Date(x);", 'export const t = new Date("2026-01-01T00:00:00Z");', "export const f = (d: Date) => d.getTime();"])(
    "is fine: %s",
    async (code) => {
      expect(await messages(`declare const x: number;\n${code}`, "src/lib/srs/queue.ts", "no-restricted-syntax")).toEqual([]);
    },
  );
  it("is not applied outside src/lib/srs (the app still needs a clock somewhere)", async () => {
    expect(await messages("export const t = Date.now();", "src/lib/server/clamp.ts", "no-restricted-syntax")).toEqual([]);
  });
});

describe("the review tables are reached only through src/db/queries/srs.ts", () => {
  const value = 'import { srsCards } from "@/db/schema";\nexport const x = srsCards;';
  it.each([
    ["src/lib/srs/cards.ts", value],
    ["src/lib/server/review-handler.ts", 'import { srsReviews } from "@/db/schema";\nexport const x = srsReviews;'],
    ["src/app/(learn)/review/page.tsx", value],
    ["src/db/queries/home.ts", 'import { srsCards } from "../schema";\nexport const x = srsCards;'],
    ["src/db/queries/progress.ts", 'import { srsReviews, profiles } from "./schema";\nexport const x = [srsReviews, profiles];'],
  ])("%s may not import a review table as a value", async (file, code) => {
    const m = await messages(code, file, "no-restricted-imports");
    expect(m).toHaveLength(1);
    expect(m[0].message).toMatch(/queries\/srs/);
  });
  it.each([
    "src/db/queries/srs.ts",
    "src/db/schema.int.test.ts",
    "src/lib/srs/cards.int.test.ts",
  ])("%s may", async (file) => {
    expect(await messages('import { srsCards, srsReviews } from "@/db/schema";\nexport const x = [srsCards, srsReviews];', file, "no-restricted-imports")).toEqual([]);
  });
  it("types of the tables and the other tables are fine everywhere", async () => {
    expect(await messages('import type { srsCards } from "@/db/schema";\nexport type X = typeof srsCards;', "src/lib/srs/cards.ts", "no-restricted-imports")).toEqual([]);
    expect(await messages('import { progress } from "@/db/schema";\nexport const x = progress;', "src/lib/srs/cards.ts", "no-restricted-imports")).toEqual([]);
  });
  it("the exempt files still cannot import ts-fsrs", async () => {
    const m = await messages('import { DefaultScheduler } from "ts-fsrs";\nexport const x = 1;', "src/db/queries/srs.ts", "no-restricted-imports");
    expect(m).toHaveLength(1);
  });
});

describe("the table-access ban cannot be dropped silently by a later config block", () => {
  type Block = { files?: string[]; ignores?: string[]; rules?: Record<string, unknown> };
  type Pattern = { group?: string[]; importNames?: string[] };
  const patternsOf = (b: Block): Pattern[] => {
    const value = b.rules?.["no-restricted-imports"];
    const options = Array.isArray(value) ? value[1] : undefined;
    return options && typeof options === "object" && "patterns" in options ? (options as { patterns: Pattern[] }).patterns : [];
  };
  const names = ["srsCards", "srsReviews"];
  /** The block bans the review tables as values: either the two names, or every value import from the schema. */
  const bansTables = (b: Block) =>
    patternsOf(b).some(
      (p) => p.group?.some((g) => g.endsWith("db/schema")) && (p.importNames === undefined || names.every((n) => p.importNames!.includes(n))),
    );
  /** The ONLY blocks allowed to set no-restricted-imports without the table ban (they are the files that may touch the tables). */
  const EXEMPT_FILES = ["src/db/queries/srs.ts", "src/db/schema.ts", "src/db/client.ts", "src/db/test-utils.ts", "src/**/*.int.test.ts"];
  const unprotected = (blocks: Block[]) =>
    blocks.filter((b) => b.rules && "no-restricted-imports" in b.rules && !bansTables(b) && JSON.stringify(b.files) !== JSON.stringify(EXEMPT_FILES));

  it("every block of the real config that sets no-restricted-imports bans the tables, or is the exempt block with the listed files", async () => {
    const config = (await import(path.join(root, "eslint.config.mjs"))).default as Block[];
    expect(unprotected(config)).toEqual([]);
    expect(config.some((b) => JSON.stringify(b.files) === JSON.stringify(EXEMPT_FILES))).toBe(true); // the exemption exists and is exactly the list
  });
  it("the exempt list is exactly these files (adding a file to it is a deliberate edit of this test)", async () => {
    const config = (await import(path.join(root, "eslint.config.mjs"))).default as Block[];
    const exempt = config.find((b) => JSON.stringify(b.files) === JSON.stringify(EXEMPT_FILES));
    expect(exempt?.files).toEqual(EXEMPT_FILES);
    expect(patternsOf(exempt!).some((p) => p.importNames?.includes("srsCards"))).toBe(false);
  });
  it("the check notices a new block that sets the rule without the ban", () => {
    const good: Block = { files: ["a"], rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/db/schema"], importNames: names }] }] } };
    const everyValue: Block = { files: ["b"], rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/db/schema"] }] }] } };
    const oneName: Block = { files: ["c"], rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/db/schema"], importNames: ["srsCards"] }] }] } };
    const onlyFsrs: Block = { files: ["d"], rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["ts-fsrs"] }] }] } };
    const other: Block = { files: ["e"], rules: { "no-console": "error" } };
    expect(unprotected([good, everyValue, other])).toEqual([]);
    expect(unprotected([good, oneName, onlyFsrs, other])).toEqual([oneName, onlyFsrs]);
  });
  it.each(["../../db/schema", "../../../src/db/schema", "../schema", "./schema", "@/db/schema"])("a deep or relative import of the tables (%s) is caught in an ordinary file", async (from) => {
    const m = await messages(`import { srsCards } from "${from}";\nexport const x = srsCards;`, "src/lib/srs/cards.ts", "no-restricted-imports");
    expect(m).toHaveLength(1);
  });
  it("and in a review-* server file", async () => {
    const m = await messages('import { srsReviews } from "../../db/schema";\nexport const x = srsReviews;', "src/lib/server/review-handler.ts", "no-restricted-imports");
    expect(m.length).toBeGreaterThanOrEqual(1);
  });
});
