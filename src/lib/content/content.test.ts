// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOPICS } from "./schema";
import { formatProblem, validateContentDir } from "./validate";

const repo = path.resolve(import.meta.dirname, "../../..");

describe("real content/ directory", () => {
  it("validates with no problems", () => {
    const r = validateContentDir(path.join(repo, "content"));
    expect(r.problems.map(formatProblem)).toEqual([]);
    expect(r.summary.lessons).toBeGreaterThanOrEqual(1);
    expect(r.summary.words).toBeGreaterThanOrEqual(1);
  });
});

describe("TOPICS", () => {
  it("matches the topic slugs in docs/VOCABULARY.md section 3", () => {
    const md = fs.readFileSync(path.join(repo, "docs/VOCABULARY.md"), "utf8");
    const section = md.split("## 3.")[1].split("## 4.")[0];
    const slugs = [...section.matchAll(/^\| `([a-z_]+)`/gm)].map((m) => m[1]);
    expect([...TOPICS]).toEqual(slugs);
  });
});
