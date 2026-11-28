// Tests for the shell scripts behind `make prod-*` (POSIX sh, run on the host by make).
// The scripts talk to Docker through $COMPOSE_CMD, so the tests swap in a fake command that records its
// arguments and prints canned output instead of running pg_dump / psql.
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
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
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

describe("env-get.sh (the one parser for .env.prod values)", () => {
  const get = (content: string, key: string, def = "") => run("env-get.sh", [envFile(content), key, def]).out;

  it("returns the last assignment, trimmed", () => {
    expect(get("A=1\nA=  2  \n", "A")).toBe("2");
  });
  it("strips quotes and carriage returns the same way everywhere", () => {
    expect(get('A="abc"\r\n', "A")).toBe("abc");
    expect(get("A='abc'\n", "A")).toBe("abc");
    expect(get("A=abc\r\n", "A")).toBe("abc");
  });
  it("ignores comments and falls back to the default", () => {
    expect(get("# A=1\n", "A", "dflt")).toBe("dflt");
    expect(get("A=\n", "A", "dflt")).toBe("dflt");
  });
  it("does not treat a longer key as the key", () => {
    expect(get("APP_PORT_X=1\n", "APP_PORT", "3100")).toBe("3100");
  });
});

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
    const r = run("check-env.sh", [path.join(repoRoot, ".env.prod.example")]);
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
    ["BACKUP_KEEP=00", GOOD + "BACKUP_KEEP=00\n"],
    ["BACKUP_KEEP=0", GOOD + "BACKUP_KEEP=0\n"],
    ["BACKUP_KEEP=abc", GOOD + "BACKUP_KEEP=abc\n"],
    ["a POSTGRES_USER with odd characters", GOOD + "POSTGRES_USER=ezh;drop\n"],
    ["a POSTGRES_DB with odd characters", "POSTGRES_PASSWORD=abcdEFGH1234ijklMNOP5678\nPOSTGRES_DB=a/b\n"],
    ["a POSTGRES_DB with upper case", "POSTGRES_PASSWORD=abcdEFGH1234ijklMNOP5678\nPOSTGRES_DB=Prod\n"],
    ["a non-numeric APP_PORT", GOOD + "APP_PORT=abc\n"],
    ["S3: APP_BIND=0.0.0.0 (open to everyone)", GOOD + "APP_BIND=0.0.0.0\n"],
    ["S3: APP_BIND=::", GOOD + "APP_BIND=::\n"],
    ["S5: an `export ` prefix (make ignores it, compose honours it)", GOOD + "export POSTGRES_DB=english_zero_to_hero\n"],
    ["S5: an inline comment after a value", GOOD + "APP_PORT=3100 # my port\n"],
  ])("refuses %s", (_name, content) => {
    expect(run("check-env.sh", [envFile(content)]).code).not.toBe(0);
  });

  it("accepts BACKUP_KEEP=14", () => {
    expect(run("check-env.sh", [envFile(GOOD + "BACKUP_KEEP=14\n")]).code).toBe(0);
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

/**
 * A stand-in for `docker compose ...`: logs every call and prints canned output.
 * FAKE_FAIL=<text> makes only the calls whose arguments contain <text> fail.
 */
function fakeCompose(): { cmd: string; log: string } {
  const log = path.join(tmp, "calls.log");
  const bin = path.join(tmp, "fake-compose");
  fs.writeFileSync(
    bin,
    `#!/bin/sh
echo "$*" >> "${log}"
if [ -n "\${FAKE_FAIL:-}" ]; then
  case "$*" in *"$FAKE_FAIL"*) echo "fake failure" >&2; exit 1 ;; esac
fi
case "$*" in
  *pg_dump*) printf 'PGDMP-fake-dump-bytes' ;;
  *"pg_restore -l"*) echo "; dbname: \${FAKE_DBNAME:-english_zero_to_hero}" ;;
  *"pg_restore --data-only"*) printf 'COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;\\n1\\tabc\\t%s\\n\\\\.\\n' "\${FAKE_DUMP_MAX:-1000}" ;;
  *"pg_restore --no-owner -f -"*) echo "SELECT 1;" ;;
  *_journal.json*) printf '{"entries":[{"idx":0,"when":1},{"idx":1,"when":%s}]}' "\${FAKE_JOURNAL_MAX:-2000}" ;;
  *to_regclass*) echo "\${FAKE_HAS_TABLE-drizzle.__drizzle_migrations}" ;;
  *"max(created_at)"*) echo "\${FAKE_DB_MAX:-2000}" ;;
  *"count(*)"*) echo "7" ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  return { cmd: bin, log };
}

const calls = (log: string) => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []);
const DB = "english_zero_to_hero";
const name = (stamp: string, label = "") => `ezh-${DB}-${stamp}${label ? `-${label}` : ""}.dump`;

describe("backup.sh", () => {
  const base = (cmd: string, extra: Record<string, string> = {}) => ({
    COMPOSE_CMD: cmd,
    BACKUP_DIR: path.join(tmp, "backups"),
    DB_NAME: DB,
    DB_USER: "ezh",
    ...extra,
  });

  it("writes a timestamped non-empty dump, prints its path and leaves no partial file", () => {
    const { cmd } = fakeCompose();
    const r = run("backup.sh", [], base(cmd));
    expect(r.code).toBe(0);
    const file = r.out.trim().split("\n").pop()!;
    expect(file).toMatch(/ezh-english_zero_to_hero-\d{8}-\d{6}\.dump$/);
    expect(fs.readFileSync(file, "utf8")).toBe("PGDMP-fake-dump-bytes");
    expect(fs.readdirSync(path.join(tmp, "backups")).filter((n) => n.includes("partial"))).toEqual([]);
  });

  it("makes the folder 700 and the dump 600 (it holds all the learner's data)", () => {
    const { cmd } = fakeCompose();
    const r = run("backup.sh", [], base(cmd));
    const file = r.out.trim().split("\n").pop()!;
    expect((fs.statSync(path.dirname(file)).mode & 0o777).toString(8)).toBe("700");
    expect((fs.statSync(file).mode & 0o777).toString(8)).toBe("600");
  });

  it("deletes nothing and leaves no file when pg_dump fails", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    fs.writeFileSync(path.join(backups, name("20200101-000000")), "old");
    const r = run("backup.sh", [], base(cmd, { FAKE_FAIL: "pg_dump", KEEP: "1" }));
    expect(r.code).not.toBe(0);
    expect(fs.readdirSync(backups)).toEqual([name("20200101-000000")]);
  });

  it("keeps only the newest KEEP backups of this database", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    for (const d of ["20200101", "20200102", "20200103"]) fs.writeFileSync(path.join(backups, name(`${d}-000000`)), "x");
    fs.writeFileSync(path.join(backups, "ezh-other_db-20190101-000000.dump"), "x");
    expect(run("backup.sh", [], base(cmd, { KEEP: "2" })).code).toBe(0);
    const left = fs.readdirSync(backups).sort();
    expect(left).toHaveLength(3);
    expect(left).toContain("ezh-other_db-20190101-000000.dump");
    expect(left).not.toContain(name("20200101-000000"));
  });

  it.each(["0", "00", "000", "-1", "1.5", "abc", " ", "08x"])("refuses KEEP=%s (and deletes nothing)", (keep) => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    fs.writeFileSync(path.join(backups, name("20200101-000000")), "x");
    const r = run("backup.sh", [], base(cmd, { KEEP: keep }));
    expect(r.code).not.toBe(0);
    expect(fs.readdirSync(backups)).toEqual([name("20200101-000000")]);
  });

  it("keeps labelled safety backups in their own window of 5 and never evicts normal backups for them", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    const normal = ["20200101", "20200102"].map((d) => name(`${d}-000000`));
    normal.forEach((n) => fs.writeFileSync(path.join(backups, n), "x"));
    for (let i = 1; i <= 7; i++) fs.writeFileSync(path.join(backups, name(`2020020${i}-000000`, "pre-update")), "x");
    expect(run("backup.sh", [], base(cmd, { KEEP: "2", LABEL: "pre-update" })).code).toBe(0);
    const left = fs.readdirSync(backups);
    expect(left.filter((n) => n.includes("pre-update"))).toHaveLength(5);
    expect(normal.every((n) => left.includes(n))).toBe(true);
  });

  it("S1: the new backup survives even when later-named files exist (clock behind / timezone change)", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    for (const d of ["29990101", "29990102", "29990103"]) fs.writeFileSync(path.join(backups, name(`${d}-000000`)), "x");
    const r = run("backup.sh", [], base(cmd, { KEEP: "3" }));
    expect(r.code).toBe(0);
    const file = r.out.trim().split("\n").pop()!;
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(0);
  });

  it("S1: a -pre-update backup survives pruning of its own window too", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    for (let i = 1; i <= 6; i++) fs.writeFileSync(path.join(backups, name(`2999020${i}-000000`, "pre-update")), "x");
    const r = run("backup.sh", [], base(cmd, { KEEP: "3", LABEL: "pre-update" }));
    expect(fs.existsSync(r.out.trim().split("\n").pop()!)).toBe(true);
  });

  it("S1: -pre-restore backups are never pruned automatically (may be the only copy of the latest data)", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(backups, name(`2020010${i}-000000`, "pre-restore")), "x");
    expect(run("backup.sh", [], base(cmd, { KEEP: "1" })).code).toBe(0);
    expect(fs.readdirSync(backups).filter((n) => n.includes("pre-restore"))).toHaveLength(9);
  });

  it("S1: two backups in the same second do not overwrite each other", () => {
    const { cmd } = fakeCompose();
    const a = run("backup.sh", [], base(cmd)).out.trim().split("\n").pop()!;
    const b = run("backup.sh", [], base(cmd)).out.trim().split("\n").pop()!;
    expect(a).not.toBe(b);
    expect(fs.existsSync(a) && fs.existsSync(b)).toBe(true);
  });

  it("S1: time stamps are UTC", () => {
    const { cmd } = fakeCompose();
    const file = run("backup.sh", [], { ...base(cmd), TZ: "Asia/Bangkok" }).out.trim().split("\n").pop()!;
    const m = path.basename(file).match(/-(\d{8})-(\d{2})(\d{4})\.dump$/)!;
    const utcHour = new Date().getUTCHours();
    expect(Math.abs(Number(m[2]) - utcHour) % 24 <= 1 || Math.abs(Number(m[2]) - utcHour) >= 23).toBe(true);
  });

  it("warns (stderr) when backups with time stamps in the FUTURE exist, and still succeeds", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    fs.writeFileSync(path.join(backups, name("29990101-000000")), "x");
    const r = run("backup.sh", [], base(cmd, { KEEP: "3" }));
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/clock/i);
    expect(r.err).toContain(name("29990101-000000"));
    expect(r.err).toMatch(/[ก-๙]/);
  });

  it("does not warn when no backup is from the future", () => {
    const { cmd } = fakeCompose();
    expect(run("backup.sh", [], base(cmd)).err).toBe("");
  });

  it("does not prune at all when PRUNE=0", () => {
    const { cmd } = fakeCompose();
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    for (const d of ["20200101", "20200102", "20200103"]) fs.writeFileSync(path.join(backups, name(`${d}-000000`)), "x");
    expect(run("backup.sh", [], base(cmd, { KEEP: "1", PRUNE: "0" })).code).toBe(0);
    expect(fs.readdirSync(backups)).toHaveLength(4);
  });
});

describe("restore.sh", () => {
  const backups = () => path.join(tmp, "backups");
  const base = (cmd: string, extra: Record<string, string> = {}) => ({
    COMPOSE_CMD: cmd,
    BACKUP_DIR: backups(),
    DB_NAME: DB,
    DB_USER: "ezh",
    ...extra,
  });
  /** a dump inside BACKUP_DIR (so pruning could reach it), named like make prod-backup names it */
  const dump = (stamp = "20200101-000000") => {
    fs.mkdirSync(backups(), { recursive: true });
    const f = path.join(backups(), name(stamp));
    fs.writeFileSync(f, "PGDMP-something");
    return f;
  };

  it("refuses without CONFIRM=<database name> and touches nothing", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), ""], base(cmd));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain(`CONFIRM=${DB}`);
    expect(calls(log)).toEqual([]);
  });

  it("refuses the wrong CONFIRM", () => {
    const { cmd, log } = fakeCompose();
    expect(run("restore.sh", [dump(), "english_zero_to_hero_dev"], base(cmd)).code).not.toBe(0);
    expect(calls(log)).toEqual([]);
  });

  it("refuses a missing or empty file", () => {
    const { cmd, log } = fakeCompose();
    expect(run("restore.sh", [path.join(tmp, "missing.dump"), DB], base(cmd)).code).not.toBe(0);
    const empty = path.join(tmp, name("20200101-000000"));
    fs.writeFileSync(empty, "");
    expect(run("restore.sh", [empty, DB], base(cmd)).code).not.toBe(0);
    expect(calls(log)).toEqual([]);
  });

  it("says postgres is not running (not 'invalid backup') when it cannot be reached", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "pg_isready" }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/not running/i);
    expect(r.err).not.toMatch(/not a valid backup/i);
    expect(calls(log).some((c) => c.includes("stop app"))).toBe(false);
  });

  it("takes a fresh backup BEFORE it restores; restores in one transaction; ends with the normal up path (migrations)", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd));
    expect(r.code).toBe(0);
    const c = calls(log);
    const at = (needle: string) => c.findIndex((x) => x.includes(needle));
    const restoreIdx = c.findIndex((x) => x.includes("psql") && x.includes("--single-transaction"));
    expect(at("pg_dump")).toBeGreaterThan(-1);
    expect(restoreIdx).toBeGreaterThan(at("pg_dump"));
    expect(at("stop app")).toBeLessThan(restoreIdx);
    expect(c[c.length - 1]).toContain("up -d --wait");
    expect(c.some((x) => x.includes("start app"))).toBe(false);
    expect(c[restoreIdx]).toContain("ON_ERROR_STOP=1");
    expect(fs.readdirSync(backups()).some((n) => n.includes("pre-restore"))).toBe(true);
  });

  it("drops and recreates the app schemas in the same transaction as the restore (true replace)", () => {
    const { cmd } = fakeCompose();
    const sent = path.join(tmp, "psql-stdin");
    // capture what is piped into psql
    const wrap = path.join(tmp, "wrap");
    fs.writeFileSync(wrap, `#!/bin/sh\ncase "$*" in *--single-transaction*) cat > "${sent}" ;; esac\nexec "${cmd}" "$@"\n`, { mode: 0o755 });
    expect(run("restore.sh", [dump(), DB], base(wrap)).code).toBe(0);
    const sql = fs.readFileSync(sent, "utf8");
    expect(sql).toMatch(/DROP SCHEMA IF EXISTS public CASCADE/);
    expect(sql).toMatch(/DROP SCHEMA IF EXISTS drizzle CASCADE/);
    expect(sql).toMatch(/CREATE SCHEMA public/);
    expect(sql.indexOf("DROP SCHEMA")).toBeLessThan(sql.indexOf("SELECT 1;"));
  });

  it("A1: restoring the OLDEST backup of KEEP files works and the file survives", () => {
    const { cmd } = fakeCompose();
    const oldest = dump("20200101-000000");
    dump("20200102-000000");
    dump("20200103-000000");
    const r = run("restore.sh", [oldest, DB], base(cmd, { KEEP: "3" }));
    expect(r.code).toBe(0);
    expect(fs.existsSync(oldest)).toBe(true);
    expect(fs.readdirSync(backups()).filter((n) => !n.includes("pre-restore"))).toHaveLength(3);
  });

  it("A1: the safety backup never evicts normal backups", () => {
    const { cmd } = fakeCompose();
    const files = ["20200101", "20200102", "20200103"].map((d) => dump(`${d}-000000`));
    expect(run("restore.sh", [files[0], DB], base(cmd, { KEEP: "1" })).code).toBe(0);
    expect(files.every((f) => fs.existsSync(f))).toBe(true);
  });

  it("does not restore when the safety backup fails (only pg_dump fails)", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "pg_dump" }));
    expect(r.code).not.toBe(0);
    const c = calls(log);
    expect(c.some((x) => x.includes("pg_dump"))).toBe(true);
    expect(c.some((x) => x.includes("--single-transaction"))).toBe(false);
    expect(c[c.length - 1]).toContain("up -d --wait");
  });

  it("when pg_restore fails: non-zero exit, nothing applied, data-unchanged message with the safety backup path, app restarted", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "pg_restore --no-owner -f -" }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/unchanged/i);
    expect(r.err).toContain("pre-restore.dump");
    const c = calls(log);
    expect(c.some((x) => x.includes("--single-transaction"))).toBe(false);
    expect(c[c.length - 1]).toContain("up -d --wait");
  });

  it("when the transaction fails: non-zero exit, says it was rolled back and the data is unchanged", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "--single-transaction" }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/unchanged/i);
    expect(calls(log)[calls(log).length - 1]).toContain("up -d --wait");
  });

  it("B2: refuses a dump whose newest migration is newer than this code, unless ALLOW_NEWER=1", () => {
    const { cmd, log } = fakeCompose();
    const env = { FAKE_DUMP_MAX: "3000", FAKE_JOURNAL_MAX: "2000" };
    const r = run("restore.sh", [dump(), DB], base(cmd, env));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/ALLOW_NEWER=1/);
    expect(r.err).toMatch(/[ก-๙]/); // Thai as well as English
    expect(calls(log).some((x) => x.includes("stop app"))).toBe(false);
    expect(run("restore.sh", [dump(), DB], base(cmd, { ...env, ALLOW_NEWER: "1" })).code).toBe(0);
  });

  it("B2: an older or equal dump is fine", () => {
    const { cmd } = fakeCompose();
    expect(run("restore.sh", [dump(), DB], base(cmd, { FAKE_DUMP_MAX: "2000", FAKE_JOURNAL_MAX: "2000" })).code).toBe(0);
  });

  it("B4: refuses a file named for another database, unless ALLOW_OTHER_DB=1", () => {
    const { cmd, log } = fakeCompose();
    fs.mkdirSync(backups(), { recursive: true });
    const other = path.join(backups(), "ezh-other_db-20200101-000000.dump");
    fs.writeFileSync(other, "PGDMP");
    const r = run("restore.sh", [other, DB], base(cmd));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("ALLOW_OTHER_DB=1");
    expect(calls(log).some((x) => x.includes("stop app"))).toBe(false);
    expect(run("restore.sh", [other, DB], base(cmd, { ALLOW_OTHER_DB: "1" })).code).toBe(0);
  });

  it("B4: refuses a dump whose own header names another database (even with the right file name)", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_DBNAME: "english_zero_to_hero_dev" }));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("english_zero_to_hero_dev");
    expect(calls(log).some((x) => x.includes("stop app"))).toBe(false);
    expect(run("restore.sh", [dump(), DB], base(cmd, { FAKE_DBNAME: "english_zero_to_hero_dev", ALLOW_OTHER_DB: "1" })).code).toBe(0);
  });

  it("M1: reads the dump's newest migration with `pg_restore ... -f -` (pg >= 12 needs -f), and says so when that fails", () => {
    const { cmd, log } = fakeCompose();
    expect(run("restore.sh", [dump(), DB], base(cmd)).code).toBe(0);
    const c = calls(log).find((x) => x.includes("pg_restore --data-only"))!;
    expect(c).toMatch(/ -f -(\s|$)/);
    fs.writeFileSync(log, "");
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "pg_restore --data-only" }));
    expect(r.code).not.toBe(0);
    expect(calls(log).some((x) => x.includes("stop app"))).toBe(false);
  });

  it("M1: cannot read the migration list of the image -> refuses (does not guess)", () => {
    const { cmd, log } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "_journal.json" }));
    expect(r.code).not.toBe(0);
    expect(calls(log).some((x) => x.includes("stop app"))).toBe(false);
  });

  it("S2: exits non-zero and prints no success line when the app does not start afterwards", () => {
    const { cmd } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "up -d --wait" }));
    expect(r.code).not.toBe(0);
    expect(r.out).not.toMatch(/เสร็จ|finished/i);
  });

  it("S2: success prints one final line with the address of the app", () => {
    const { cmd } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { APP_BIND: "127.0.0.1", APP_PORT: "3100" }));
    expect(r.code).toBe(0);
    expect(r.out.trim().split("\n").pop()).toContain("http://127.0.0.1:3100");
  });

  it("S5: starts the stack again when interrupted (INT/TERM are trapped, not only EXIT)", () => {
    expect(fs.readFileSync(script("restore.sh"), "utf8")).toMatch(/trap [^\n]*INT[^\n]*TERM|trap [^\n]*TERM[^\n]*INT/);
  });

  it("refuses a file that is not a valid backup", () => {
    const { cmd } = fakeCompose();
    const r = run("restore.sh", [dump(), DB], base(cmd, { FAKE_FAIL: "pg_restore -l" }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/not a valid backup/i);
  });
});

describe("pre-update.sh (backup before migrations)", () => {
  const base = (cmd: string, mode: string, extra: Record<string, string> = {}) => ({
    COMPOSE_CMD: cmd,
    BACKUP_DIR: path.join(tmp, "backups"),
    DB_NAME: DB,
    DB_USER: "ezh",
    MODE: mode,
    ...extra,
  });
  const labelled = () => (fs.existsSync(path.join(tmp, "backups")) ? fs.readdirSync(path.join(tmp, "backups")).filter((n) => n.includes("-pre-update")) : []);

  it("always: backs up when the database already has data", () => {
    const { cmd } = fakeCompose();
    expect(run("pre-update.sh", [], base(cmd, "always")).code).toBe(0);
    expect(labelled()).toHaveLength(1);
  });

  it("always: first install (no migrations table) takes no backup", () => {
    const { cmd } = fakeCompose();
    expect(run("pre-update.sh", [], base(cmd, "always", { FAKE_HAS_TABLE: "" })).code).toBe(0);
    expect(labelled()).toHaveLength(0);
  });

  it("if-pending: backs up when the image has a migration the database lacks", () => {
    const { cmd } = fakeCompose();
    expect(run("pre-update.sh", [], base(cmd, "if-pending", { FAKE_JOURNAL_MAX: "3000", FAKE_DB_MAX: "2000" })).code).toBe(0);
    expect(labelled()).toHaveLength(1);
  });

  it("if-pending: no backup when the database is up to date", () => {
    const { cmd } = fakeCompose();
    expect(run("pre-update.sh", [], base(cmd, "if-pending", { FAKE_JOURNAL_MAX: "2000", FAKE_DB_MAX: "2000" })).code).toBe(0);
    expect(labelled()).toHaveLength(0);
  });

  it("fails (so the update stops) when the backup fails", () => {
    const { cmd } = fakeCompose();
    expect(run("pre-update.sh", [], base(cmd, "always", { FAKE_FAIL: "pg_dump" })).code).not.toBe(0);
  });

  it("SKIP=1 does nothing", () => {
    const { cmd, log } = fakeCompose();
    expect(run("pre-update.sh", [], base(cmd, "if-pending", { SKIP: "1" })).code).toBe(0);
    expect(calls(log)).toEqual([]);
  });
});

describe("verify.sh (is this backup restorable?)", () => {
  const base = (cmd: string, extra: Record<string, string> = {}) => ({ COMPOSE_CMD: cmd, DB_NAME: DB, DB_USER: "ezh", ...extra });
  const dump = () => {
    const f = path.join(tmp, name("20200101-000000"));
    fs.writeFileSync(f, "PGDMP-something");
    return f;
  };

  it("restores into a scratch database (never the real one), prints counts and drops the scratch database", () => {
    const { cmd, log } = fakeCompose();
    const r = run("verify.sh", [dump()], base(cmd));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ok/i);
    const c = calls(log);
    const create = c.findIndex((x) => /CREATE DATABASE ezh_verify_/.test(x));
    const drop = c.findIndex((x) => /DROP DATABASE .*ezh_verify_/.test(x));
    expect(create).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(create);
    expect(c.filter((x) => x.includes("pg_restore")).every((x) => !x.includes(`-d ${DB}`) || x.includes("ezh_verify_"))).toBe(true);
    expect(c.some((x) => x.includes("stop app"))).toBe(false);
  });

  it("drops the scratch database and fails when the restore fails", () => {
    const { cmd, log } = fakeCompose();
    const r = run("verify.sh", [dump()], base(cmd, { FAKE_FAIL: "--exit-on-error" }));
    expect(r.code).not.toBe(0);
    expect(calls(log).some((x) => /DROP DATABASE .*ezh_verify_/.test(x))).toBe(true);
  });

  it("refuses a missing file", () => {
    const { cmd } = fakeCompose();
    expect(run("verify.sh", [path.join(tmp, "nope.dump")], base(cmd)).code).not.toBe(0);
  });
});

describe("Makefile guards", () => {
  const makefile = fs.readFileSync(path.join(repoRoot, "Makefile"), "utf8");

  it("C6: no target passes -v / --volumes (or removes a volume) for the production project", () => {
    const bad = makefile.split("\n").filter((l) => {
      const touchesVolumes = /(\s-v\b|--volumes|volume\s+(rm|prune)|system\s+prune)/.test(l) && !/^\s*#/.test(l);
      return touchesVolumes && !l.includes("-p ezh_stage") && !l.includes("-p ezh_ci") && !l.includes("-v /app/.next");
    });
    expect(bad).toEqual([]);
  });

  it("A3: the dev app lookup is limited to the dev compose project, so a running prod/stage app is never picked", () => {
    const appUp = makefile.slice(makefile.indexOf("APP_UP ="), makefile.indexOf("RUN ="));
    expect(appUp).toContain("com.docker.compose.project=");
  });

  it("C4: prod-status does not hard-code 127.0.0.1", () => {
    const status = makefile.slice(makefile.indexOf("prod-status:"), makefile.indexOf("prod-migrate:"));
    expect(status).not.toContain("127.0.0.1");
  });

  it("every prod-* env value comes from the one parser", () => {
    expect(makefile).toContain("scripts/prod/env-get.sh");
    expect(makefile).not.toMatch(/sed -n 's\/\^\$\(1\)=/);
  });

  it("S5: the 'is up' message says stage for the stage stack", () => {
    expect(makefile).toMatch(/is up: http/);
    expect(makefile).toContain("stage");
    const up = makefile.slice(makefile.indexOf("prod-up:"), makefile.indexOf("prod-update:"));
    expect(up).not.toMatch(/echo "production is up/);
    expect(up).toMatch(/stage/);
  });

  const hasMake = spawnSync("make", ["--version"]).status === 0;
  const dry = (target: string) =>
    spawnSync("make", ["-n", "-C", repoRoot, target, "FILE=x", "CONFIRM=y"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv }).stdout;

  it.skipIf(!hasMake)("M2: stage and prod resolve to different images", () => {
    const prod = dry("prod-build").match(/PROD_IMAGE=(\S+)/)?.[1];
    const stage = dry("stage-build").match(/PROD_IMAGE=(\S+)/)?.[1];
    expect(prod).toBeTruthy();
    expect(stage).toBeTruthy();
    expect(stage).not.toBe(prod);
    expect(prod).toBe("ezh-prod-app:latest");
  });

  it.skipIf(!hasMake)("M2: stage uses its own backup folder, prod keeps backups/", () => {
    expect(dry("prod-backup")).toMatch(/BACKUP_DIR=backups(\s|$)/);
    expect(dry("stage-backup")).toMatch(/BACKUP_DIR=backups-stage(\s|$)/);
  });

  it("M2 (text check, runs without make): the image tag and the backup folder are derived from the project name", () => {
    expect(makefile).toMatch(/^PROD_IMAGE\s*[:?]?=.*PROD_PROJECT.*-app:latest/m);
    expect(makefile).toMatch(/^PROD\s*:?=.*PROD_IMAGE=\$\(PROD_IMAGE\)/m);
    expect(makefile).toMatch(/BACKUP_DIR=\$\(PROD_BACKUPS\)/);
    expect(makefile).toMatch(/^PROD_BACKUPS\s*[:?]?=.*PROD_PROJECT/m);
  });

  it("M2: backups-stage/ is git-ignored", () => {
    expect(fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8")).toMatch(/^backups-stage\/$/m);
  });
});

describe("roundtrip.sh (only ever for stage or ci, never the real app)", () => {
  /** a fake `docker compose` that logs and answers the few queries the script makes, and a fake `make` */
  function setup(opts: { failBackup?: number } = {}) {
    const log = path.join(tmp, "rt.log");
    const bin = path.join(tmp, "fakebin");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "compose"),
      `#!/bin/sh
echo "COMPOSE $*" >> "${log}"
case "$*" in
  *"select current"*) echo "\${FAKE_MARKER:-42}" ;;
  *"count(*)"*) echo 5 ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(bin, "make"),
      `#!/bin/sh
echo "MAKE $*" >> "${log}"
n=$(grep -c '^MAKE -s [a-z]*-backup$' "${log}" || true)
case "$*" in
  *-backup) [ "$n" = "${opts.failBackup ?? 0}" ] && { echo "backup failed" >&2; exit 1; }
            f="${tmp}/dump-$n.dump"; echo x > "$f"; echo "$f"; exit 0 ;;
  *-restore*) echo "ERROR: this backup was made by a NEWER version of the app" >&2; exit 1 ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
    return { log, bin, cmd: path.join(bin, "compose") };
  }
  const env = (s: ReturnType<typeof setup>, extra: Record<string, string> = {}) => ({
    PATH: `${s.bin}:${process.env.PATH ?? ""}`,
    COMPOSE_CMD: `${s.cmd} -p ezh_stage -f docker-compose.prod.yml`,
    DB_NAME: "english_zero_to_hero_stage",
    DB_USER: "ezh",
    BASE_URL: "http://127.0.0.1:3190",
    ...extra,
  });
  const logged = (log: string) => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "");

  it.each([
    ["prod", {}],
    ["ezh_prod", {}],
    ["PROD", {}],
    ["", {}],
    ["stage ", {}],
    ["stage;prod", {}],
    ["../prod", {}],
    ["stage", { COMPOSE_CMD: "docker compose -p ezh_prod -f docker-compose.prod.yml --env-file .env.prod" }],
    ["stage", { DB_NAME: "english_zero_to_hero" }],
    ["ci", { DB_NAME: "english_zero_to_hero_stage" }],
    ["stage", { COMPOSE_CMD: "docker compose -p ezh_stage_x -f docker-compose.prod.yml" }],
    ["stage", { I_AM_THROWAWAY: "1", DB_NAME: "english_zero_to_hero" }],
  ])("refuses target %j with %j and touches nothing", (target, extra) => {
    const s = setup();
    const r = run("roundtrip.sh", [target], env(s, extra));
    expect(r.code).not.toBe(0);
    expect(logged(s.log)).toBe("");
    expect(r.err).not.toContain("I_AM_THROWAWAY");
  });

  it("the script has no override variable and no hint to set one", () => {
    expect(fs.readFileSync(script("roundtrip.sh"), "utf8")).not.toContain("I_AM_THROWAWAY");
  });

  it("happy path (stage): marker written, refusal must say NEWER, marker deleted at the end", () => {
    const s = setup();
    // the fake make's restore always refuses with NEWER, so only the refusal part can pass here
    const r = run("roundtrip.sh", ["stage"], env(s, { FAKE_MARKER: "7" }));
    expect(r.out + r.err).toMatch(/refused|NEWER/);
    expect(logged(s.log)).toMatch(/delete from "user" where id = 'roundtrip-marker'/);
  });

  it("when backup #2 fails the future migration row and the marker user are still deleted", () => {
    const s = setup({ failBackup: 1 });
    const r = run("roundtrip.sh", ["stage"], env(s));
    expect(r.code).not.toBe(0);
    const l = logged(s.log);
    expect(l).toMatch(/insert into drizzle\.__drizzle_migrations/);
    const futureDel = l.lastIndexOf("delete from drizzle.__drizzle_migrations where hash = 'future'");
    expect(futureDel).toBeGreaterThan(l.indexOf("insert into drizzle.__drizzle_migrations"));
    expect(l).toMatch(/delete from "user" where id = 'roundtrip-marker'/);
  });

  it("when backup #1 fails the script stops (the failure is not swallowed by a pipe)", () => {
    const s = setup({ failBackup: 0 });
    const r = run("roundtrip.sh", ["stage"], env(s));
    expect(r.code).not.toBe(0);
    expect(logged(s.log)).not.toMatch(/insert into drizzle\.__drizzle_migrations/);
  });

  it("a restore that fails WITHOUT the word NEWER is not accepted as the refusal", () => {
    const s = setup();
    fs.appendFileSync(path.join(s.bin, "make"), "");
    const mk = fs.readFileSync(path.join(s.bin, "make"), "utf8").replace("NEWER version", "something else");
    fs.writeFileSync(path.join(s.bin, "make"), mk);
    const r = run("roundtrip.sh", ["stage"], env(s, { FAKE_MARKER: "7" }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/NEWER/);
  });
});

describe("Makefile: ci stack and stage cleanup", () => {
  const makefile = fs.readFileSync(path.join(repoRoot, "Makefile"), "utf8");
  it("has ci-* targets on their own project, and roundtrip is only reachable with a stage/ci project", () => {
    expect(makefile).toMatch(/^ci-init:/m);
    expect(makefile).toMatch(/^ci-down:/m);
    expect(makefile).toMatch(/PROD_ENV=\.env\.ci PROD_PROJECT=ezh_ci/);
    expect(makefile).toMatch(/scripts\/prod\/roundtrip\.sh '\$\(patsubst ezh_%,%,\$\(PROD_PROJECT\)\)'/);
  });
  it("stage-down also removes backups-stage/", () => {
    const down = makefile.slice(makefile.indexOf("stage-down:"), makefile.indexOf("stage-%:"));
    expect(down).toContain("backups-stage");
  });
  it("ci.yml uses the ci project, never ezh_prod, and no longer sets I_AM_THROWAWAY", () => {
    const ci = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    const job = ci.slice(ci.indexOf("prod-image:"));
    expect(job).toContain("ezh-ci-app:latest");
    expect(job).toContain("make ci-roundtrip");
    expect(job).not.toContain("ezh_prod");
    expect(job).not.toContain("I_AM_THROWAWAY");
  });
});
