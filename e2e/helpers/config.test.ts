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

// e2e/zz-checkpoint.spec.ts finishes days 1-30 for the one learner all the specs share, so it must be the LAST file to run
// (see its header). That holds only while files run one after another in alphabetical order and no file sorts after it.
describe("spec order", () => {
  const config = read("playwright.config.ts");
  const specs = fs.readdirSync(path.join(process.cwd(), "e2e")).filter((f) => f.endsWith(".spec.ts")).sort();

  it("runs the files one at a time, in alphabetical order", () => {
    expect(config).toMatch(/^\s*workers:\s*1,/m);
    expect(config).not.toMatch(/fullyParallel/);
    expect(config).not.toMatch(/\bretries:/); // a retry would replay a spec on a learner the later specs have already moved
  });

  it("has zz-checkpoint.spec.ts as the last spec", () => {
    expect(specs.at(-1)).toBe("zz-checkpoint.spec.ts");
  });
});
