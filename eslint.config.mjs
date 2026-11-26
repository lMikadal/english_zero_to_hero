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
          paths: [
            { name: "@/db/queries/progress", importNames: ["finishProgress", "advanceCurrentDay", "lockProgress"], message: "A practice handler must not write progress or profiles." },
            { name: "@/db/queries/attempts", importNames: ["markInProgress", "refreshDoneScore"], message: "A practice handler must not write progress." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", ".claude/**"]),
]);
