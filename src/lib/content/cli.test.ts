// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runValidate } from "./cli";

let root: string;
beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ezh-cli-")), "content");
  fs.mkdirSync(path.join(root, "lessons"), { recursive: true });
});
afterEach(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("runValidate", () => {
  it("returns 0 and prints the coverage summary for valid (here: empty) content", () => {
    const out: string[] = [];
    expect(runValidate(root, (l) => out.push(l))).toBe(0);
    expect(out.join("\n")).toMatch(/lessons: 0/);
    expect(out.join("\n")).toMatch(/OK/);
  });

  it("returns 1 and prints one line per problem, naming the file", () => {
    fs.writeFileSync(path.join(root, "lessons", "day-001.json"), "{ nope");
    fs.writeFileSync(path.join(root, "lessons", "day-002.json"), "{ nope");
    const out: string[] = [];
    expect(runValidate(root, (l) => out.push(l))).toBe(1);
    const lines = out.filter((l) => l.includes("day-00"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("content/lessons/day-001.json");
    expect(out.join("\n")).toMatch(/2 problem/);
  });
});
