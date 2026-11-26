// @vitest-environment node
// The practice handlers may not import anything that writes progress or profiles (docs/plans/replay-plan.md 4.5).
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const lint = async (code: string, filePath: string) => {
  const [res] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
  return res.messages.filter((m) => m.ruleId === "no-restricted-imports");
};

describe("no-restricted-imports for src/lib/server/practice-*.ts", () => {
  const forbidden: [string, string][] = [
    ["finishProgress", "@/db/queries/progress"],
    ["advanceCurrentDay", "@/db/queries/progress"],
    ["lockProgress", "@/db/queries/progress"],
    ["markInProgress", "@/db/queries/attempts"],
    ["refreshDoneScore", "@/db/queries/attempts"],
  ];
  it.each(forbidden)("%s from %s is an error in a practice-* file", async (name, from) => {
    const msgs = await lint(`import { ${name} } from "${from}";\nvoid ${name};\n`, "src/lib/server/practice-complete-handler.ts");
    expect(msgs).toHaveLength(1);
  });
  it.each(forbidden)("%s from %s is fine in other files", async (name, from) => {
    expect(await lint(`import { ${name} } from "${from}";\nvoid ${name};\n`, "src/lib/server/complete-handler.ts")).toHaveLength(0);
  });
  it("touchStreak and getStreak are allowed in practice-* files", async () => {
    expect(await lint(`import { touchStreak, getStreak, getProfile } from "@/db/queries/progress";\nvoid [touchStreak, getStreak, getProfile];\n`, "src/lib/server/practice-complete-handler.ts")).toHaveLength(0);
  });

  describe("structural bans", () => {
    const P = "src/lib/server/practice-complete-handler.ts";
    it("a value import from @/db/schema is an error in a practice-* file, a type import is fine, other files are free", async () => {
      expect(await lint(`import { progress } from "@/db/schema";\nvoid progress;\n`, P)).toHaveLength(1);
      expect(await lint(`import { progress } from "../../db/schema";\nvoid progress;\n`, P)).toHaveLength(1);
      expect(await lint(`import type { ActivitySource } from "@/db/schema";\nexport type T = ActivitySource;\n`, P)).toHaveLength(0);
      expect(await lint(`import { progress } from "@/db/schema";\nvoid progress;\n`, "src/lib/server/complete-handler.ts")).toHaveLength(0);
    });
    it("namespace and relative imports of the progress writers are errors", async () => {
      expect(await lint(`import * as q from "@/db/queries/progress";\nvoid q;\n`, P)).toHaveLength(1);
      expect(await lint(`import * as q from "@/db/queries/attempts";\nvoid q;\n`, P)).toHaveLength(1);
      expect(await lint(`import { finishProgress } from "../../db/queries/progress";\nvoid finishProgress;\n`, P)).toHaveLength(1);
      expect(await lint(`import { markInProgress } from "../../db/queries/attempts";\nvoid markInProgress;\n`, P)).toHaveLength(1);
      expect(await lint(`import * as q from "@/db/queries/progress";\nvoid q;\n`, "src/lib/server/complete-handler.ts")).toHaveLength(0);
    });
    it("the practice query module is allowed", async () => {
      expect(await lint(`import { getDayStatus } from "@/db/queries/practice";\nvoid getDayStatus;\n`, P)).toHaveLength(0);
    });
  });
});
