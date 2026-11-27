// @vitest-environment node
// The review handlers may not import anything that writes progress or profiles (docs/plans/vocab-review-plan.md PR 3,
// same idea as practice-imports.test.ts): a review only touches the review tables and the streak.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const lint = async (code: string, filePath: string) => {
  const [res] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
  return res.messages.filter((m) => m.ruleId === "no-restricted-imports");
};
const FILES = ["src/lib/server/review-handler.ts", "src/lib/server/review-complete-handler.ts", "src/lib/server/review-anything.ts"];

describe("no-restricted-imports for src/lib/server/review-*.ts", () => {
  const forbidden: [string, string][] = [
    ["finishProgress", "@/db/queries/progress"],
    ["advanceCurrentDay", "@/db/queries/progress"],
    ["lockProgress", "@/db/queries/progress"],
    ["computeLessonScore", "@/db/queries/progress"],
    ["markInProgress", "@/db/queries/attempts"],
    ["insertAttempt", "@/db/queries/attempts"],
  ];
  it.each(FILES.flatMap((f) => forbidden.map(([n, from]) => [f, n, from] as const)))("%s: %s from %s is an error", async (file, name, from) => {
    expect(await lint(`import { ${name} } from "${from}";\nvoid ${name};\n`, file)).toHaveLength(1);
  });
  it.each(forbidden)("%s from %s is fine in other files", async (name, from) => {
    expect(await lint(`import { ${name} } from "${from}";\nvoid ${name};\n`, "src/lib/server/complete-handler.ts")).toHaveLength(0);
  });
  it("getProfile, getStreak and touchStreak are allowed", async () => {
    for (const file of FILES) expect(await lint(`import { touchStreak, getStreak, getProfile } from "@/db/queries/progress";\nvoid [touchStreak, getStreak, getProfile];\n`, file)).toHaveLength(0);
  });
  it("the review queries and the read-only practice query (finished days) are allowed", async () => {
    for (const file of FILES) {
      expect(await lint(`import { lockCard } from "@/db/queries/srs";\nvoid lockCard;\n`, file)).toHaveLength(0);
      expect(await lint(`import { listDoneDays } from "@/db/queries/practice";\nvoid listDoneDays;\n`, file)).toHaveLength(0);
    }
  });

  describe("structural bans", () => {
    const P = FILES[0];
    it("a value import from the schema is an error (deep relative path too), a type import is fine, other files are free", async () => {
      expect(await lint(`import { progress } from "@/db/schema";\nvoid progress;\n`, P)).toHaveLength(1);
      expect(await lint(`import { srsCards } from "../../db/schema";\nvoid srsCards;\n`, P)).toHaveLength(1);
      expect(await lint(`import { profiles } from "../../../src/db/schema";\nvoid profiles;\n`, FILES[1])).toHaveLength(1);
      expect(await lint(`import type { ActivitySource } from "@/db/schema";\nexport type T = ActivitySource;\n`, P)).toHaveLength(0);
      expect(await lint(`import { progress } from "@/db/schema";\nvoid progress;\n`, "src/lib/server/complete-handler.ts")).toHaveLength(0);
    });
    it("namespace and relative imports of the progress writers are errors", async () => {
      expect(await lint(`import * as q from "@/db/queries/progress";\nvoid q;\n`, P)).toHaveLength(1);
      expect(await lint(`import * as q from "@/db/queries/attempts";\nvoid q;\n`, P)).toHaveLength(1);
      expect(await lint(`import { finishProgress } from "../../db/queries/progress";\nvoid finishProgress;\n`, P)).toHaveLength(1);
      expect(await lint(`import { markInProgress } from "../../db/queries/attempts";\nvoid markInProgress;\n`, P)).toHaveLength(1);
    });
    it("ts-fsrs is still banned there (this block replaces the general rule)", async () => {
      expect(await lint(`import { DefaultScheduler } from "ts-fsrs";\nvoid DefaultScheduler;\n`, P)).toHaveLength(1);
    });
    it("tests of the handlers are not restricted (they set up data through the schema)", async () => {
      expect(await lint(`import { progress } from "@/db/schema";\nvoid progress;\n`, "src/lib/server/review-handler.int.test.ts")).toHaveLength(0);
    });
  });
});
