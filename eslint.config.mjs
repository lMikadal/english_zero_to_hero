import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // A replay never writes progress or profiles (docs/plans/replay-plan.md 4.5): the practice handlers may not even import the writers.
    files: ["src/lib/server/practice-*.ts"],
    ignores: ["src/lib/server/practice-*.test.ts", "src/lib/server/practice-*.int.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
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
