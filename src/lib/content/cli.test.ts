// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentRootFromArgs, runValidate } from "./cli";

let root: string;
beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ezh-cli-")), "content");
  fs.mkdirSync(path.join(root, "lessons"), { recursive: true });
});
afterEach(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("runValidate", () => {
  it("returns 1 for an empty tree (no lessons, no words)", () => {
    const out: string[] = [];
    fs.mkdirSync(path.join(root, "vocab"));
    expect(runValidate(root, (l) => out.push(l))).toBe(1);
    expect(out.join("\n")).toMatch(/no lesson files/);
  });

  it("returns 1 and prints one line per problem, naming the file", () => {
    fs.writeFileSync(path.join(root, "lessons", "day-001.json"), "{ nope");
    fs.writeFileSync(path.join(root, "lessons", "day-002.json"), "{ nope");
    const out: string[] = [];
    expect(runValidate(root, (l) => out.push(l))).toBe(1);
    const lines = out.filter((l) => l.includes("day-00"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("content/lessons/day-001.json");
    expect(out.join("\n")).toMatch(/problem\(s\) found/);
  });
});

describe("contentRootFromArgs (S12)", () => {
  it("defaults to ./content and accepts a directory argument", () => {
    expect(contentRootFromArgs([], "/repo")).toBe("/repo/content");
    expect(contentRootFromArgs(["/tmp/copy/content"], "/repo")).toBe("/tmp/copy/content");
    expect(contentRootFromArgs(["rel/dir"], "/repo")).toBe("/repo/rel/dir");
  });
});
