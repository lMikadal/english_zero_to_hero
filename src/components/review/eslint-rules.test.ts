// @vitest-environment node
// Plan 4.4 item 13 (PR 4): the review UI takes the time zone ONLY from ReviewQueue.timeZone and its clock only from the
// one injected `now`. These tests run the real ESLint config on small snippets, so removing the rule fails here.
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const eslint = new ESLint({ cwd: root });
async function messages(code: string, file: string, ruleId = "no-restricted-syntax") {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages.filter((m) => m.ruleId === ruleId);
}
const FILES = ["src/components/review/ReviewSession.tsx", "src/components/review/ReviewCard.tsx", "src/app/(learn)/review/page.tsx", "src/components/review/ReviewSession.test.tsx"];

describe("the device zone is banned in the review UI", () => {
  it.each(FILES.flatMap((f) => [
    [f, "Intl.DateTimeFormat().resolvedOptions().timeZone"],
    [f, "new Intl.DateTimeFormat(undefined).resolvedOptions().timeZone"],
    [f, "new Intl.DateTimeFormat('en', { timeZone: 'UTC' }).resolvedOptions()"],
    [f, "someFormatter.resolvedOptions()"],
  ] as const))("%s: %s is an error", async (file, expr) => {
    const m = await messages(`export const z = ${expr};`, file);
    expect(m).toHaveLength(1);
    expect(m[0].message).toMatch(/ReviewQueue\.timeZone/);
  });
  it("is allowed elsewhere (the settings page may show the device zone)", async () => {
    expect(await messages("export const z = Intl.DateTimeFormat().resolvedOptions().timeZone;", "src/components/nav/MainNav.tsx")).toEqual([]);
  });
  it("formatting with an explicit zone is fine", async () => {
    expect(await messages("export const f = new Intl.DateTimeFormat('th', { timeZone: tz }).format(d);", "src/components/review/ReviewSession.tsx")).toEqual([]);
  });
});

describe("the clock is injected, not read, in the review UI", () => {
  it.each([["Date.now()", "export const t = Date.now();"], ["new Date()", "export const t = new Date();"]])("%s is an error in the components", async (_n, code) => {
    for (const f of ["src/components/review/ReviewSession.tsx", "src/components/review/session-state.ts"]) expect(await messages(code, f), f).toHaveLength(1);
  });
  it("new Date(value) is fine", async () => {
    expect(await messages("export const t = new Date(x);", "src/components/review/ReviewSession.tsx")).toEqual([]);
  });
});

describe("the review UI also keeps the other bans (config blocks replace each other)", () => {
  it("ts-fsrs and the review tables cannot be imported by the review UI", async () => {
    expect(await messages('import { DefaultScheduler } from "ts-fsrs";\nexport const x = 1;', "src/components/review/ReviewSession.tsx", "no-restricted-imports")).toHaveLength(1);
    expect(await messages('import { srsCards } from "@/db/schema";\nexport const x = srsCards;', "src/components/review/ReviewSession.tsx", "no-restricted-imports")).toHaveLength(1);
  });
});
