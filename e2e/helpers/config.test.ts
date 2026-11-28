// Playwright must write only inside e2e-artifacts/ (see the comment in playwright.config.ts): a path outside it would need
// write permission on the checkout root, which the Playwright container user does not have on CI.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("Playwright output location", () => {
  const config = read("playwright.config.ts");

  it("puts the test output and the html report under e2e-artifacts/", () => {
    expect(config).toMatch(/outputDir:\s*"\.\/e2e-artifacts\/[\w-]+"/);
    expect(config).toMatch(/outputFolder:\s*"e2e-artifacts\/[\w-]+"/);
  });

  it("is created, uploaded and ignored by everything that handles it", () => {
    expect(read("Makefile")).toContain("mkdir -p e2e-artifacts");
    expect(read(".github/workflows/ci.yml")).toMatch(/chown 1000:1000 e2e-artifacts/);
    expect(read(".github/workflows/ci.yml")).toMatch(/^\s+e2e-artifacts\/\s*$/m);
    for (const f of [".gitignore", ".dockerignore"]) expect(read(f), f).toMatch(/^e2e-artifacts\/?$/m);
    expect(read("eslint.config.mjs")).toContain("e2e-artifacts/**");
  });
});
