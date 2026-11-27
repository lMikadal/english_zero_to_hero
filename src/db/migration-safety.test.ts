// Migrations after 0004 run automatically on the user's real data at `make prod-up`, so a destructive statement
// must have been looked at by a human: the file has to carry the marker `-- destructive: reviewed`.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findDestructive, REVIEW_MARKER } from "./migration-safety";

describe("findDestructive", () => {
  it.each([
    ['DROP TABLE "x";', "DROP TABLE"],
    ['ALTER TABLE "x" DROP COLUMN "y";', "DROP COLUMN"],
    ['TRUNCATE "x";', "TRUNCATE"],
    ['truncate table x;', "TRUNCATE"],
    ['ALTER TABLE "x" ALTER COLUMN "y" SET DATA TYPE integer;', "ALTER ... TYPE"],
    ['ALTER TABLE "x" ALTER COLUMN "y" TYPE text;', "ALTER ... TYPE"],
    ['drop   table if exists x;', "DROP TABLE"],
  ])("flags %s", (sql, what) => {
    expect(findDestructive(sql)).toContain(what);
  });

  it("does not flag additive migrations", () => {
    expect(findDestructive('CREATE TABLE "x" ("id" uuid);\n--> statement-breakpoint\nALTER TABLE "x" ADD COLUMN "z" text;\nCREATE INDEX i ON x (z);')).toEqual([]);
  });

  it("ignores words inside comments", () => {
    expect(findDestructive("-- we did not DROP TABLE anything\nCREATE TABLE a (b int);")).toEqual([]);
  });

  it("accepts a destructive file that carries the review marker", () => {
    expect(findDestructive(`${REVIEW_MARKER}\nDROP TABLE "x";`)).toEqual([]);
  });
});

describe("migration files", () => {
  const dir = path.join(import.meta.dirname, "migrations");
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

  it("there are migration files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.filter((f) => Number(f.slice(0, 4)) > 4))("%s has no unreviewed destructive statement", (f) => {
    const found = findDestructive(fs.readFileSync(path.join(dir, f), "utf8"));
    expect(found, `${f} contains ${found.join(", ")}. If it is intended, add the line "${REVIEW_MARKER}" after reviewing it against real data and take a backup first (make prod-update does).`).toEqual([]);
  });
});
