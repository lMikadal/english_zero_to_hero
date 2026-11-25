import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };
const exclude = ["**/node_modules/**", ".claude/**"];

// Two projects: `unit` needs nothing running; `integration` needs the Postgres service
// (it creates and migrates the english_zero_to_hero_test database in global setup).
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...exclude, "**/*.int.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          globalSetup: ["./src/db/vitest-global-setup.ts"],
          include: ["src/**/*.int.test.ts"],
          exclude,
          // one shared test database: run files one after another
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
