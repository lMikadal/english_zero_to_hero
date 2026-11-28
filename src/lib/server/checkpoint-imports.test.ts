// @vitest-environment node
// The checkpoint handlers may not import anything that writes progress, profiles, attempts or the review cards
// (docs/plans/checkpoint-plan.md 3.5 item 34), like the practice handlers (replay-plan 4.5).
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const lint = async (code: string, filePath: string) => {
  const [res] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
  return res.messages.filter((m) => m.ruleId === "no-restricted-imports");
};
const F = "src/lib/server/checkpoint-complete-handler.ts";

describe("no-restricted-imports for src/lib/server/checkpoint-*.ts", () => {
  const forbidden: [string, string][] = [
    ["finishProgress", "@/db/queries/progress"],
    ["advanceCurrentDay", "@/db/queries/progress"],
    ["lockProgress", "@/db/queries/progress"],
    ["markInProgress", "@/db/queries/attempts"],
    ["insertAttempt", "@/db/queries/attempts"],
    ["refreshDoneScore", "@/db/queries/attempts"],
    ["insertMissingCards", "@/db/queries/srs"],
    ["reconcileCards", "@/lib/srs/cards"],
  ];
  it.each(forbidden)("%s from %s is an error in a checkpoint-* file", async (name, from) => {
    expect(await lint(`import { ${name} } from "${from}";\nvoid ${name};\n`, F)).toHaveLength(1);
  });
  it.each(forbidden)("%s from %s is fine in other files", async (name, from) => {
    expect(await lint(`import { ${name} } from "${from}";\nvoid ${name};\n`, "src/lib/server/complete-handler.ts")).toHaveLength(0);
  });
  it("touchStreak, getStreak and getProfile are allowed, and so are the checkpoint and practice read queries", async () => {
    expect(await lint(`import { touchStreak, getStreak, getProfile } from "@/db/queries/progress";\nvoid [touchStreak, getStreak, getProfile];\n`, F)).toHaveLength(0);
    expect(await lint(`import { getCheckpointResult } from "@/db/queries/checkpoints";\nvoid getCheckpointResult;\n`, F)).toHaveLength(0);
    expect(await lint(`import { getDayProgress } from "@/db/queries/practice";\nvoid getDayProgress;\n`, F)).toHaveLength(0);
  });
  it("a value import from @/db/schema is an error (type imports are fine), namespace and relative imports of the writers too", async () => {
    expect(await lint(`import { progress } from "@/db/schema";\nvoid progress;\n`, F)).toHaveLength(1);
    expect(await lint(`import type { ActivitySource } from "@/db/schema";\nexport type T = ActivitySource;\n`, F)).toHaveLength(0);
    expect(await lint(`import * as q from "@/db/queries/progress";\nvoid q;\n`, F)).toHaveLength(1);
    expect(await lint(`import { finishProgress } from "../../db/queries/progress";\nvoid finishProgress;\n`, F)).toHaveLength(1);
    expect(await lint(`import { insertAttempt } from "../../db/queries/attempts";\nvoid insertAttempt;\n`, F)).toHaveLength(1);
  });
});
