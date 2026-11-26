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
