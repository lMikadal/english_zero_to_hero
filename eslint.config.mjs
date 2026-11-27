import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ts-fsrs is wrapped by ONE file (docs/plans/vocab-review-plan.md 4.1): everything else talks to src/lib/srs/scheduler.ts.
// Its own tests and the golden-vector generator may import the library to compare against it.
const TS_FSRS_ONLY_IN_ADAPTER = { group: ["ts-fsrs", "ts-fsrs/*"], message: "Only src/lib/srs/scheduler.ts imports ts-fsrs; use its applyRating / previewRatings." };

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    ignores: ["src/lib/srs/scheduler.ts", "src/lib/srs/scheduler.*.test.ts", "src/lib/srs/scheduler.test.ts", "scripts/srs-golden.mjs"],
    rules: { "no-restricted-imports": ["error", { patterns: [TS_FSRS_ONLY_IN_ADAPTER] }] },
  },
  {
    // The review's arithmetic is pure: time is a parameter, never read from the clock (docs/plans/vocab-review-plan.md 4.2).
    files: ["src/lib/srs/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: "Do not read the clock in src/lib/srs: pass `now` in." },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Do not read the clock in src/lib/srs: pass `now` in." },
      ],
    },
  },
  {
    // A replay never writes progress or profiles (docs/plans/replay-plan.md 4.5): the practice handlers may not even import the writers.
    files: ["src/lib/server/practice-*.ts"],
    ignores: ["src/lib/server/practice-*.test.ts", "src/lib/server/practice-*.int.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            TS_FSRS_ONLY_IN_ADAPTER, // this block replaces the general no-restricted-imports rule for these files, so repeat it
            // tables come only through query functions; types may come from the schema
            { group: ["@/db/schema", "**/db/schema"], allowTypeImports: true, message: "A practice handler reads tables through @/db/queries/practice only." },
            // namespace imports are rejected whenever allowImportNames is used
            { group: ["@/db/queries/progress", "**/db/queries/progress"], allowImportNames: ["getProfile", "getStreak", "touchStreak"], message: "A practice handler must not write progress or profiles." },
            { group: ["@/db/queries/attempts", "**/db/queries/attempts"], message: "A practice handler must not write progress." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", ".claude/**"]),
]);
