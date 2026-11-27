// Tests for the shell scripts behind `make prod-*` (POSIX sh, run on the host by make).
// The scripts talk to Docker through $COMPOSE_CMD, so the tests swap in a fake command that records its
// arguments and prints canned bytes instead of running pg_dump.
// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const dir = path.resolve(import.meta.dirname);
const script = (name: string) => path.join(dir, name);
const repoRoot = path.resolve(dir, "../..");

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ezh-prod-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(file: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync("sh", [script(file), ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function envFile(content: string): string {
  const f = path.join(tmp, ".env.prod");
  fs.writeFileSync(f, content);
  return f;
}

const GOOD = "POSTGRES_PASSWORD=abcdEFGH1234ijklMNOP5678\nPOSTGRES_DB=english_zero_to_hero\n";

describe("check-env.sh", () => {
  it("accepts a strong password", () => {
    expect(run("check-env.sh", [envFile(GOOD)]).code).toBe(0);
  });

  it("refuses a missing file and tells the user how to create it", () => {
    const r = run("check-env.sh", [path.join(tmp, "nope")]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("make prod-init");
  });

  it("refuses the value shipped in .env.prod.example", () => {
    const example = path.join(repoRoot, ".env.prod.example");
    const r = run("check-env.sh", [example]);
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/POSTGRES_PASSWORD/);
  });

  it.each([
    ["no password", "POSTGRES_DB=english_zero_to_hero\n"],
    ["empty password", "POSTGRES_PASSWORD=\n"],
    ["short password", "POSTGRES_PASSWORD=abc123\n"],
    ["a repetitive password", "POSTGRES_PASSWORD=ezhezhezhezhezhezhezh\n"],
    ["a placeholder", "POSTGRES_PASSWORD=change-me-please-change-me\n"],
    ["characters that break the connection URL", "POSTGRES_PASSWORD=abcdEFGH1234ijkl@MNOP5678\n"],
  ])("refuses %s", (_name, content) => {
    expect(run("check-env.sh", [envFile(content)]).code).not.toBe(0);
  });

  it("refuses a database name that belongs to dev", () => {
    const r = run("check-env.sh", [envFile(GOOD + "POSTGRES_DB=english_zero_to_hero_dev\n")]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("_dev");
  });

  it("ignores comments and does not execute the file", () => {
    const marker = path.join(tmp, "executed");
    const f = envFile(`# POSTGRES_PASSWORD=short\n${GOOD}touch ${marker}\n`);
    expect(run("check-env.sh", [f]).code).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
  });
});

/** A stand-in for `docker compose ...`: logs every call; `pg_dump` prints bytes, `pg_restore -l` succeeds. */
function fakeCompose(): { cmd: string; log: string } {
  const log = path.join(tmp, "calls.log");
  const bin = path.join(tmp, "fake-compose");
  fs.writeFileSync(
    bin,
    `#!/bin/sh
echo "$*" >> "${log}"
case "$*" in
  *pg_dump*) printf 'PGDMP-fake-dump-bytes' ;;
esac
exit \${FAKE_EXIT:-0}
`,
    { mode: 0o755 },
  );
  return { cmd: bin, log };
}

describe("backup.sh", () => {
  it("writes a timestamped non-empty dump, prints its path and leaves no partial file", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    const r = run("backup.sh", [], { COMPOSE_CMD: cmd, BACKUP_DIR: backups, DB_NAME: "english_zero_to_hero", DB_USER: "ezh" });
    expect(r.code).toBe(0);
    const file = r.out.trim().split("\n").pop()!;
    expect(file).toMatch(/ezh-english_zero_to_hero-\d{8}-\d{6}\.dump$/);
    expect(fs.readFileSync(file, "utf8")).toBe("PGDMP-fake-dump-bytes");
    expect(fs.readdirSync(backups).filter((n) => n.includes("partial"))).toEqual([]);
  });

  it("deletes nothing and leaves no file when pg_dump fails", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    fs.writeFileSync(path.join(backups, "ezh-english_zero_to_hero-20200101-000000.dump"), "old");
    const r = run("backup.sh", [], { COMPOSE_CMD: cmd, BACKUP_DIR: backups, DB_NAME: "english_zero_to_hero", DB_USER: "ezh", FAKE_EXIT: "1", KEEP: "1" });
    expect(r.code).not.toBe(0);
    expect(fs.readdirSync(backups)).toEqual(["ezh-english_zero_to_hero-20200101-000000.dump"]);
  });

  it("keeps only the newest KEEP backups of this database", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    for (const d of ["20200101", "20200102", "20200103"]) {
      fs.writeFileSync(path.join(backups, `ezh-english_zero_to_hero-${d}-000000.dump`), "x");
    }
    fs.writeFileSync(path.join(backups, "ezh-other_db-20190101-000000.dump"), "x");
    const r = run("backup.sh", [], { COMPOSE_CMD: cmd, BACKUP_DIR: backups, DB_NAME: "english_zero_to_hero", DB_USER: "ezh", KEEP: "2" });
    expect(r.code).toBe(0);
    const left = fs.readdirSync(backups).sort();
    expect(left).toHaveLength(3); // 2 of ours + the other database's file, untouched
    expect(left).toContain("ezh-other_db-20190101-000000.dump");
    expect(left).not.toContain("ezh-english_zero_to_hero-20200101-000000.dump");
  });

  it("refuses a KEEP that is not a positive number", () => {
    const { cmd } = fakeCompose();
    const r = run("backup.sh", [], { COMPOSE_CMD: cmd, BACKUP_DIR: path.join(tmp, "b"), DB_NAME: "x", DB_USER: "ezh", KEEP: "0" });
    expect(r.code).not.toBe(0);
  });
});

describe("restore.sh", () => {
  const base = (cmd: string) => ({
    COMPOSE_CMD: cmd,
    BACKUP_DIR: path.join(tmp, "backups"),
    DB_NAME: "english_zero_to_hero",
    DB_USER: "ezh",
  });
  const dump = () => {
    const f = path.join(tmp, "in.dump");
    fs.writeFileSync(f, "PGDMP-something");
    return f;
  };

  it("refuses without CONFIRM=<database name> and touches nothing", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), ""], base(cmd));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("CONFIRM=english_zero_to_hero");
    expect(fs.existsSync(log)).toBe(false);
  });

  it("refuses the wrong CONFIRM", () => {
    const { cmd, log } = fakeCompose();
    expect(run("restore.sh", [dump(), "english_zero_to_hero_dev"], base(cmd)).code).not.toBe(0);
    expect(fs.existsSync(log)).toBe(false);
  });

  it("refuses a missing or empty file", () => {
    const { cmd, log } = fakeCompose();
    expect(run("restore.sh", [path.join(tmp, "missing.dump"), "english_zero_to_hero"], base(cmd)).code).not.toBe(0);
    const empty = path.join(tmp, "empty.dump");
    fs.writeFileSync(empty, "");
    expect(run("restore.sh", [empty, "english_zero_to_hero"], base(cmd)).code).not.toBe(0);
    expect(fs.existsSync(log)).toBe(false);
  });

  it("takes a fresh backup BEFORE it restores, with the app stopped in between", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), "english_zero_to_hero"], base(cmd));
    expect(r.code).toBe(0);
    const calls = fs.readFileSync(log, "utf8").trim().split("\n");
    const at = (needle: string) => calls.findIndex((c) => c.includes(needle));
    expect(at("pg_dump")).toBeGreaterThan(-1);
    expect(at("pg_restore --clean")).toBeGreaterThan(at("pg_dump"));
    expect(at("stop app")).toBeLessThan(at("pg_restore --clean"));
    expect(at("start app")).toBeGreaterThan(at("pg_restore --clean"));
    expect(fs.readdirSync(path.join(tmp, "backups")).some((n) => n.includes("pre-restore"))).toBe(true);
  });

  it("does not restore when the safety backup fails", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), "english_zero_to_hero"], { ...base(cmd), FAKE_EXIT: "1" });
    expect(r.code).not.toBe(0);
    expect(fs.readFileSync(log, "utf8")).not.toContain("pg_restore --clean");
  });
});
