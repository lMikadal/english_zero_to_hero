// Tests for the automatic daily backup: auto-backup.sh (what the systemd timer, prod-up and prod-down run),
// auto-backup-status.sh and auto-backup-install.sh (systemd user units). Same style as prod-scripts.test.ts: a fake
// `docker compose`, a fake `docker` and a fake `systemctl` that record their calls. Real PostgreSQL and real systemd are
// exercised separately on the stage stack (docs/FEATURE_MAP.md).
// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const dir = path.resolve(import.meta.dirname);
const script = (name: string) => path.join(dir, name);
const repoRoot = path.resolve(dir, "../..");
const DB = "english_zero_to_hero";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ezh-auto-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(file: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync("sh", [script(file), ...args], {
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-"); // 20260101-120000 (UTC)
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const fname = (d: Date, label = "") => `ezh-${DB}-${stamp(d)}${label ? `-${label}` : ""}.dump`;

/** fake `docker compose`: logs calls; FAKE_FAIL=<text> fails matching calls; FAKE_STACK_DOWN=1 = postgres not running; FAKE_NO_DATA=1 = empty database; FAKE_SCRATCH = lines of leftover scratch database names */
function fakeCompose() {
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
  *"ps --status running"*) [ "\${FAKE_STACK_DOWN:-}" = 1 ] || echo "abc123" ;;
  *pg_dump*) printf 'PGDMP-fake-dump-bytes' ;;
  *pg_database*) [ -z "\${FAKE_SCRATCH:-}" ] || printf '%s\\n' $FAKE_SCRATCH ;;
  *to_regclass*) [ "\${FAKE_NO_DATA:-}" = 1 ] || echo "drizzle.__drizzle_migrations" ;;
  *"count(*)"*) echo "7" ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  return { cmd: bin, log };
}
function fakeDocker(up: boolean) {
  const bin = path.join(tmp, "fake-docker");
  fs.writeFileSync(bin, `#!/bin/sh\necho "docker $*" >> "${path.join(tmp, "docker.log")}"\n${up ? "exit 0" : 'echo "Cannot connect to the Docker daemon" >&2; exit 1'}\n`, { mode: 0o755 });
  return bin;
}
const BIG = "x".repeat(2048); // real dumps are far above 1 KB; smaller files do not count as a backup
const callsOf = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n") : []);

describe("auto-backup.sh", () => {
  const backups = () => path.join(tmp, "backups");
  const state = () => path.join(tmp, "data", "backup-auto.state");
  const logf = () => path.join(tmp, "data", "backup-auto.log");
  const env = (extra: Record<string, string> = {}, up = true) => {
    const { cmd } = fakeCompose();
    return {
      COMPOSE_CMD: cmd,
      DOCKER_CMD: fakeDocker(up),
      DB_NAME: DB,
      DB_USER: "ezh",
      BACKUP_DIR: backups(),
      KEEP_AUTO: "14",
      STATE_FILE: state(),
      LOG_FILE: logf(),
      DOCKER_SOCKET: path.join(tmp, "docker.sock"), // a file stands in for the socket (only its existence is checked)
      DOCKER_ACTIVE_CMD: "true",
      ...extra,
    };
  };
  const seed = (...files: string[]) => {
    fs.mkdirSync(backups(), { recursive: true });
    files.forEach((f) => fs.writeFileSync(path.join(backups(), f), BIG));
  };
  const list = () => (fs.existsSync(backups()) ? fs.readdirSync(backups()).sort() : []);
  const compose = () => callsOf(path.join(tmp, "calls.log"));
  beforeEach(() => fs.writeFileSync(path.join(tmp, "docker.sock"), ""));

  it("takes a backup labelled -auto, verifies it by restoring into a scratch database, and records success", () => {
    const r = run("auto-backup.sh", [], env());
    expect(r.code).toBe(0);
    const files = list();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(new RegExp(`^ezh-${DB}-\\d{8}-\\d{6}-auto\\.dump$`));
    expect(compose().join("\n")).toMatch(/pg_restore .*-d ezh_verify_/);
    expect(compose().join("\n")).toMatch(/DROP DATABASE IF EXISTS ezh_verify_/);
    const st = fs.readFileSync(state(), "utf8");
    expect(st).toMatch(/^result=ok$/m);
    expect(st).toContain(files[0]);
    expect(fs.readFileSync(logf(), "utf8")).toMatch(/backup ok/i);
  });

  it("when Docker is not running (no socket): skips quietly (exit 0, one clear line) and never starts anything", () => {
    const r = run("auto-backup.sh", [], env({ DOCKER_SOCKET: path.join(tmp, "no-such.sock") }));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/SKIP.*Docker is not running/);
    expect(list()).toEqual([]);
    expect(compose()).toEqual([]); // compose was not even asked
    expect(callsOf(path.join(tmp, "docker.log"))).toEqual([]); // not even `docker info` (it could socket-activate the daemon)
    const st = fs.readFileSync(state(), "utf8");
    expect(st).not.toMatch(/^result=/m); // a skip is not a result...
    expect(st).toMatch(/^attempt=SKIP: .*Docker is not running/m); // ...but it is recorded as an attempt
    expect(st).toMatch(/^attempt_at=\d{4}-/m);
    expect(fs.readFileSync(logf(), "utf8")).toMatch(/SKIP/);
  });

  it("S3c: the Docker service is not active -> skip without touching docker (docker info could socket-activate it)", () => {
    const r = run("auto-backup.sh", [], env({ DOCKER_ACTIVE_CMD: "false" }));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/SKIP.*Docker/);
    expect(callsOf(path.join(tmp, "docker.log"))).toEqual([]);
  });

  it("S3c: Docker looks up (socket there, service active) but `docker info` fails -> FAILED, not a quiet skip", () => {
    const r = run("auto-backup.sh", [], env({}, false));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/FAILED.*docker/i);
    expect(fs.readFileSync(state(), "utf8")).toMatch(/^result=FAILED$/m);
  });

  it("when the production stack is not running: skips quietly and never starts it", () => {
    const r = run("auto-backup.sh", [], env({ FAKE_STACK_DOWN: "1" }));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/SKIP.*not running/);
    expect(list()).toEqual([]);
    expect(compose().filter((c) => /\b(up|start|run)\b/.test(c))).toEqual([]);
  });

  it("with no data yet (first install) there is nothing to back up", () => {
    const r = run("auto-backup.sh", [], env({ FAKE_NO_DATA: "1" }));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/SKIP.*no data/i);
    expect(list()).toEqual([]);
  });

  it.each([
    ["an automatic backup", "auto"],
    ["a manual backup", ""],
    ["a -pre-update backup", "pre-update"],
    ["a -pre-restore backup", "pre-restore"],
  ])("at most one per day: a fresh (%s) younger than 22 hours means no new backup", (_n, label) => {
    seed(fname(hoursAgo(5), label));
    const r = run("auto-backup.sh", [], env());
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/SKIP.*5 hours/);
    expect(list()).toHaveLength(1);
    expect(compose().join("\n")).not.toContain("pg_dump");
  });

  it("a newest backup older than 22 hours (e.g. the PC was off) is replaced by a new automatic one", () => {
    seed(fname(hoursAgo(30), "auto"));
    expect(run("auto-backup.sh", [], env()).code).toBe(0);
    expect(list()).toHaveLength(2);
  });

  it("MIN_AGE_HOURS can be changed (used by tests and by the status page)", () => {
    seed(fname(hoursAgo(5)));
    expect(run("auto-backup.sh", [], env({ MIN_AGE_HOURS: "3" })).code).toBe(0);
    expect(list()).toHaveLength(2);
  });

  it("pg_dump failure: exit 1, nothing written, state FAILED with the time and the reason, visible in the log", () => {
    const r = run("auto-backup.sh", [], env({ FAKE_FAIL: "pg_dump" }));
    expect(r.code).toBe(1);
    expect(list().filter((f) => f.endsWith(".dump"))).toEqual([]);
    const st = fs.readFileSync(state(), "utf8");
    expect(st).toMatch(/^result=FAILED$/m);
    expect(st).toMatch(/^at=\d{4}-\d{2}-\d{2}/m);
    expect(st).toMatch(/^message=.+/m);
    expect(fs.readFileSync(logf(), "utf8")).toMatch(/FAILED/);
    expect(r.err + r.out).toMatch(/FAILED/);
  });

  it("verification failure: exit 1, state FAILED, the unusable file is set aside so it cannot pass for a good backup", () => {
    const r = run("auto-backup.sh", [], env({ FAKE_FAIL: "pg_restore" }));
    expect(r.code).toBe(1);
    expect(list().filter((f) => f.endsWith(".dump"))).toEqual([]);
    expect(list().some((f) => f.endsWith(".verify-failed"))).toBe(true);
    expect(fs.readFileSync(state(), "utf8")).toMatch(/^result=FAILED$/m);
  });

  it("the next success clears the FAILED state", () => {
    run("auto-backup.sh", [], env({ FAKE_FAIL: "pg_dump" }));
    expect(fs.readFileSync(state(), "utf8")).toMatch(/FAILED/);
    expect(run("auto-backup.sh", [], env()).code).toBe(0);
    expect(fs.readFileSync(state(), "utf8")).toMatch(/^result=ok$/m);
  });

  it("automatic backups have their own window (KEEP_AUTO) and never evict manual or pre-update ones", () => {
    const manual = [100, 99, 98].map((h) => fname(hoursAgo(h * 24)));
    const pre = [fname(hoursAgo(97 * 24), "pre-update"), fname(hoursAgo(96 * 24), "pre-restore")];
    const autos = [10, 9, 8, 7].map((d) => fname(hoursAgo(d * 24), "auto"));
    seed(...manual, ...pre, ...autos);
    expect(run("auto-backup.sh", [], env({ KEEP_AUTO: "2" })).code).toBe(0);
    const left = list();
    for (const f of [...manual, ...pre]) expect(left).toContain(f);
    expect(left.filter((f) => f.endsWith("-auto.dump"))).toHaveLength(2); // the new one + the newest old one
    expect(left).toContain(autos[3]); // the newest of the old automatic ones (7 days ago) stays
  });

  it("a manual backup never evicts automatic ones", () => {
    const autos = [5, 4, 3, 2, 1].map((d) => fname(hoursAgo(d * 24 + 30), "auto"));
    seed(...autos);
    const { cmd } = fakeCompose();
    const r = run("backup.sh", [], { COMPOSE_CMD: cmd, BACKUP_DIR: backups(), DB_NAME: DB, DB_USER: "ezh", KEEP: "1" });
    expect(r.code).toBe(0);
    for (const f of autos) expect(list()).toContain(f);
  });

  it("KEEP_AUTO must be a whole number >= 1", () => {
    for (const k of ["0", "abc", "1.5", "08"]) {
      const r = run("auto-backup.sh", [], env({ KEEP_AUTO: k }));
      expect(r.code).not.toBe(0);
      expect(r.err + r.out).toMatch(/KEEP_AUTO/);
    }
  });

  it("two runs at the same time: the second one steps aside instead of backing up twice", () => {
    const e = env();
    const lock = path.join(tmp, "data", "backup-auto.lock");
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const r = spawnSync("sh", ["-c", `exec 9>"${lock}"; flock -n 9 || exit 99; sh "${script("auto-backup.sh")}"`], { env: { PATH: process.env.PATH ?? "", ...e } as unknown as NodeJS.ProcessEnv, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SKIP.*already running/);
    expect(list()).toEqual([]); // the lock was held by the outer shell: no second backup
  });

  it("the log keeps only the latest ~1000 lines", () => {
    fs.mkdirSync(path.dirname(logf()), { recursive: true });
    fs.writeFileSync(logf(), Array.from({ length: 1500 }, (_, i) => `old line ${i}`).join("\n") + "\n");
    run("auto-backup.sh", [], env({ FAKE_STACK_DOWN: "1" }));
    const lines = fs.readFileSync(logf(), "utf8").trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(1001);
    expect(lines.at(-1)).toMatch(/SKIP/);
  });

  it("S3b: every attempt is recorded in the state file (time + outcome), success also as ok_at", () => {
    run("auto-backup.sh", [], env());
    const st = fs.readFileSync(state(), "utf8");
    expect(st).toMatch(/^attempt=ok$/m);
    expect(st).toMatch(/^attempt_at=\d{4}-\d{2}-\d{2} /m);
    expect(st).toMatch(/^ok_at=\d{4}-\d{2}-\d{2} /m);
    run("auto-backup.sh", [], env()); // skipped: fresh backup
    const st2 = fs.readFileSync(state(), "utf8");
    expect(st2).toMatch(/^attempt=SKIP: .*hours old/m);
    expect(st2).toMatch(/^result=ok$/m); // the last real result is kept
    expect(st2).toMatch(/^ok_at=/m);
  });

  it("S2: an empty file named just now is NOT a backup: a new one is taken", () => {
    fs.mkdirSync(backups(), { recursive: true });
    fs.writeFileSync(path.join(backups(), fname(hoursAgo(0.1))), "");
    expect(run("auto-backup.sh", [], env()).code).toBe(0);
    expect(list().filter((f) => f.endsWith("-auto.dump"))).toHaveLength(1);
  });

  it("S2: a file under 1 KB is not a backup either", () => {
    fs.mkdirSync(backups(), { recursive: true });
    fs.writeFileSync(path.join(backups(), fname(hoursAgo(0.1), "pre-update")), "x".repeat(500));
    expect(run("auto-backup.sh", [], env()).code).toBe(0);
    expect(list().filter((f) => f.endsWith("-auto.dump"))).toHaveLength(1);
  });

  it("S2: a big but unreadable -pre-restore file (pg_restore -l fails) does not count as a fresh backup", () => {
    seed(fname(hoursAgo(0.1), "pre-restore"));
    expect(run("auto-backup.sh", [], env({ FAKE_FAIL: "pg_restore -l" })).code).toBe(0);
    expect(list().filter((f) => f.endsWith("-auto.dump"))).toHaveLength(1);
  });

  it("S2: a fresh -auto file is trusted without listing it (it was verified when it was made)", () => {
    seed(fname(hoursAgo(0.1), "auto"));
    const r = run("auto-backup.sh", [], env({ FAKE_FAIL: "pg_restore -l" }));
    expect(r.out).toMatch(/SKIP/);
    expect(list()).toHaveLength(1);
  });

  it("a backup file dated in the future is ignored for the 22-hour rule (wrong clock)", () => {
    seed(fname(new Date(Date.now() + 24 * 3600_000)));
    expect(run("auto-backup.sh", [], env()).code).toBe(0);
    expect(list().filter((f) => f.endsWith("-auto.dump"))).toHaveLength(1);
  });

  it("S7: leftover scratch databases older than an hour are dropped at the start of a run, fresh ones are left alone", () => {
    const old = Math.floor(Date.now() / 1000) - 7200;
    const fresh = Math.floor(Date.now() / 1000) - 60;
    run("auto-backup.sh", [], env({ FAKE_SCRATCH: `ezh_verify_${old}_11 ezh_verify_${fresh}_22 other_db` }));
    const log = compose().join("\n");
    expect(log).toContain(`DROP DATABASE IF EXISTS ezh_verify_${old}_11`);
    expect(log).not.toContain(`DROP DATABASE IF EXISTS ezh_verify_${fresh}_22`);
    expect(log).not.toContain("DROP DATABASE IF EXISTS other_db");
  });

  it("S7: when verification fails, the old automatic backups are untouched (even with KEEP_AUTO=1)", () => {
    const autos = [5, 4, 3].map((d) => fname(hoursAgo(d * 24 + 30), "auto"));
    seed(...autos);
    const r = run("auto-backup.sh", [], env({ KEEP_AUTO: "1", FAKE_FAIL: "pg_restore --no-owner" }));
    expect(r.code).toBe(1);
    for (const f of autos) expect(list()).toContain(f);
  });

  it("S7: messages name the right log file (stage has its own)", () => {
    const r = run("auto-backup.sh", [], env({ FAKE_FAIL: "pg_dump", LOG_FILE: path.join(tmp, "data", "backup-auto-stage.log") }));
    expect(r.code).toBe(1);
    expect(r.err + r.out).toContain("backup-auto-stage.log");
  });

  it("never starts Docker or the stack by itself (static check of the script)", () => {
    const src = fs.readFileSync(script("auto-backup.sh"), "utf8").replace(/^\s*#.*$/gm, "");
    expect(src).not.toMatch(/docker-on|systemctl (start|restart)|\bup -d\b|\bstart\b|sudo/);
  });
});

describe("auto-backup-status.sh", () => {
  const backups = () => path.join(tmp, "backups");
  const stateF = () => path.join(tmp, "backup-auto.state");
  const unitDir = () => path.join(tmp, "units");
  const seed = (...files: string[]) => {
    fs.mkdirSync(backups(), { recursive: true });
    files.forEach((f) => fs.writeFileSync(path.join(backups(), f), BIG));
  };
  const installTimer = () => {
    fs.mkdirSync(unitDir(), { recursive: true });
    fs.writeFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "[Timer]\n");
  };
  const fmt = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace("T", " "); // local time, like `date '+%F %T'`
  const writeState = (kv: Record<string, string>) => fs.writeFileSync(stateF(), Object.entries(kv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  function fakeSystemctl(installed: boolean) {
    const bin = path.join(tmp, "fake-systemctl");
    fs.writeFileSync(
      bin,
      `#!/bin/sh
echo "$*" >> "${path.join(tmp, "systemctl.log")}"
case "$*" in
  *is-enabled*) ${installed ? "echo enabled" : "echo disabled; exit 1"} ;;
  *"show"*"NextElapseUSecRealtime"*) echo "NextElapseUSecRealtime=Sun 2026-12-06 00:12:00 +07" ;;
  *"show"*"WorkingDirectory"*) echo "WorkingDirectory=\${FAKE_WD:-${repoDir()}}" ;;
  *"show"*"Result"*) echo "Result=\${FAKE_RESULT:-success}"; echo "ExecMainStatus=0" ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
    return bin;
  }
  const repoDir = () => path.join(tmp, "repo");
  function fakeCompose(up: boolean) {
    const bin = path.join(tmp, "fake-compose-status");
    fs.writeFileSync(bin, `#!/bin/sh\n${up ? 'echo abc123' : "true"}\n`, { mode: 0o755 });
    return bin;
  }
  const env = (extra: Record<string, string> = {}, installed = true, stackUp = true) => ({
    BACKUP_DIR: backups(),
    DB_NAME: DB,
    STATE_FILE: stateF(),
    UNIT: "ezh-prod-backup",
    UNIT_DIR: unitDir(),
    SYSTEMCTL: fakeSystemctl(installed),
    COMPOSE_CMD: fakeCompose(stackUp),
    REPO: repoDir(),
    LOG_FILE: "data/backup-auto.log",
    ...extra,
  });

  it("shows the newest backup (any kind) and its age", () => {
    const newest = fname(hoursAgo(3), "pre-update");
    seed(fname(hoursAgo(50)), newest, fname(hoursAgo(26), "auto"));
    const r = run("auto-backup-status.sh", ["--brief"], env());
    expect(r.code).toBe(0);
    expect(r.out).toContain(newest);
    expect(r.out).toMatch(/3 hours/);
    expect(r.out).not.toMatch(/WARNING/);
  });

  it("warns in Thai and English when the newest backup is older than 3 days", () => {
    seed(fname(hoursAgo(24 * 4)));
    const r = run("auto-backup-status.sh", ["--brief"], env());
    expect(r.out).toMatch(/WARNING.*older than 3 days/);
    expect(r.out).toMatch(/[ก-๙]/);
  });

  it("warns when there is no backup at all", () => {
    const r = run("auto-backup-status.sh", ["--brief"], env());
    expect(r.out).toMatch(/WARNING.*no backup/i);
    expect(r.out).toMatch(/[ก-๙]/);
  });

  it("shows 'last automatic backup FAILED at …' from the state file, and nothing when the last one worked", () => {
    seed(fname(hoursAgo(1)));
    fs.writeFileSync(stateF(), "result=FAILED\nat=2026-12-05 00:10:03\nmessage=pg_dump failed\n");
    expect(run("auto-backup-status.sh", ["--brief"], env()).out).toMatch(/last automatic backup FAILED at 2026-12-05 00:10:03/);
    fs.writeFileSync(stateF(), "result=ok\nat=2026-12-05 00:10:03\nfile=x\n");
    expect(run("auto-backup-status.sh", ["--brief"], env()).out).not.toMatch(/FAILED/);
  });

  it("full status: installed or not, next run, last run, newest backup", () => {
    seed(fname(hoursAgo(2), "auto"));
    fs.writeFileSync(stateF(), "result=ok\nat=2026-12-05 00:10:03\nfile=x\n");
    const on = run("auto-backup-status.sh", [], env());
    expect(on.out).toMatch(/automatic daily backup: installed/);
    expect(on.out).toMatch(/next run: .*2026-12-06/);
    expect(on.out).toMatch(/last automatic backup: ok at 2026-12-05 00:10:03/);
    const off = run("auto-backup-status.sh", [], env({}, false));
    expect(off.out).toMatch(/automatic daily backup: NOT installed/);
    expect(off.out).toContain("make prod-backup-auto-install");
    expect(off.out).not.toMatch(/systemd: /); // nothing to report for a unit that is not installed
  });

  it("brief mode does not talk to systemd when no timer is installed (prod-status stays fast)", () => {
    seed(fname(hoursAgo(2)));
    run("auto-backup-status.sh", ["--brief"], env());
    expect(fs.existsSync(path.join(tmp, "systemctl.log"))).toBe(false);
  });

  it("S1: a backup dated in the future is ignored, so the 3-day warning cannot be hidden by it", () => {
    seed(fname(new Date(Date.now() + 2 * 24 * 3600_000)), fname(hoursAgo(24 * 4)));
    const r = run("auto-backup-status.sh", ["--brief"], env());
    expect(r.out).toMatch(/WARNING.*older than 3 days/);
    expect(r.out).toMatch(/4 days old/);
  });

  it("S2: empty or tiny files are not backups for the age shown", () => {
    seed(fname(hoursAgo(24 * 5)));
    fs.writeFileSync(path.join(backups(), fname(hoursAgo(1))), "");
    fs.writeFileSync(path.join(backups(), fname(hoursAgo(2), "auto")), "tiny");
    const r = run("auto-backup-status.sh", ["--brief"], env());
    expect(r.out).toMatch(/5 days old/);
    expect(r.out).toMatch(/WARNING.*older than 3 days/);
  });

  describe("S3: a broken timer must not look fine", () => {
    const hoursText = (h: number) => fmt(hoursAgo(h));
    it("installed timer, stack up, but no attempt for 40 hours -> warns that the timer is not running", () => {
      installTimer();
      seed(fname(hoursAgo(5)));
      writeState({ result: "ok", at: hoursText(40), ok_at: hoursText(40), attempt_at: hoursText(40), attempt: "ok" });
      const r = run("auto-backup-status.sh", ["--brief"], env());
      expect(r.out).toMatch(/WARNING.*timer has not run/i);
      expect(r.out).toMatch(/[ก-๙]/);
    });
    it("recent attempts (even skips) mean the timer works: no warning", () => {
      installTimer();
      seed(fname(hoursAgo(5)));
      writeState({ result: "ok", at: hoursText(30), ok_at: hoursText(30), attempt_at: hoursText(1), attempt: "SKIP: the newest backup is 5 hours old" });
      expect(run("auto-backup-status.sh", ["--brief"], env()).out).not.toMatch(/WARNING/);
    });
    it("no warning when the stack is not up now (nothing could have been backed up)", () => {
      installTimer();
      seed(fname(hoursAgo(5)));
      writeState({ result: "ok", at: hoursText(40), ok_at: hoursText(40), attempt_at: hoursText(40), attempt: "ok" });
      expect(run("auto-backup-status.sh", ["--brief"], env({}, true, false)).out).not.toMatch(/timer has not run/i);
    });
    it("no warning when no timer is installed (the owner may use only the prod-up hook)", () => {
      seed(fname(hoursAgo(5)));
      writeState({ result: "ok", at: hoursText(40), ok_at: hoursText(40), attempt_at: hoursText(40), attempt: "ok" });
      expect(run("auto-backup-status.sh", ["--brief"], env()).out).not.toMatch(/timer has not run/i);
    });
    it("attempts happen but the last SUCCESS is older than 36 hours while the app is up -> warns", () => {
      installTimer();
      seed(fname(hoursAgo(50)));
      writeState({ result: "ok", at: hoursText(50), ok_at: hoursText(50), attempt_at: hoursText(1), attempt: "SKIP: cannot read" });
      expect(run("auto-backup-status.sh", ["--brief"], env()).out).toMatch(/WARNING.*no successful automatic backup/i);
    });
    it("systemd reporting Result != success for the service warns, also in brief mode", () => {
      installTimer();
      seed(fname(hoursAgo(5)));
      writeState({ result: "ok", at: hoursText(5), ok_at: hoursText(5), attempt_at: hoursText(1), attempt: "ok" });
      const r = run("auto-backup-status.sh", ["--brief"], env({ FAKE_RESULT: "exit-code" }));
      expect(r.out).toMatch(/WARNING.*systemd.*exit-code/i);
    });
    it("a timer installed long ago that never recorded any attempt is reported", () => {
      installTimer();
      const t = path.join(unitDir(), "ezh-prod-backup.timer");
      const old = new Date(Date.now() - 3 * 24 * 3600_000);
      fs.utimesSync(t, old, old);
      seed(fname(hoursAgo(5)));
      expect(run("auto-backup-status.sh", ["--brief"], env()).out).toMatch(/WARNING.*timer has not run/i);
    });
  });

  it("S4: full status shows the folder the timer runs from and warns when it is not this checkout", () => {
    installTimer();
    seed(fname(hoursAgo(2), "auto"));
    const same = run("auto-backup-status.sh", [], env());
    expect(same.out).toContain(`runs from: ${repoDir()}`);
    expect(same.out).not.toMatch(/WARNING.*differs/);
    const other = run("auto-backup-status.sh", [], env({ FAKE_WD: "/old/place/english_zero_to_hero" }));
    expect(other.out).toContain("runs from: /old/place/english_zero_to_hero");
    expect(other.out).toMatch(/WARNING.*differs/);
    expect(other.out).toContain("make prod-backup-auto-install");
  });

  it("S7: the FAILED warning names this stack's log file", () => {
    seed(fname(hoursAgo(1)));
    writeState({ result: "FAILED", at: "2026-12-05 00:10:03", message: "x" });
    expect(run("auto-backup-status.sh", ["--brief"], env({ LOG_FILE: "data/backup-auto-stage.log" })).out).toContain("data/backup-auto-stage.log");
  });
});

describe("auto-backup-install.sh and the unit templates", () => {
  const unitDir = () => path.join(tmp, "units");
  const stampDir = () => path.join(tmp, "timers");
  function fakeSystemctl() {
    const bin = path.join(tmp, "fake-systemctl");
    fs.writeFileSync(bin, `#!/bin/sh\necho "$*" >> "${path.join(tmp, "systemctl.log")}"\nexit 0\n`, { mode: 0o755 });
    return bin;
  }
  /** a checkout folder that has a .env.prod (the installer refuses anything else) */
  const mkrepo = (rel = "my repo/english zero", envProd = true) => {
    const d = path.join(tmp, rel);
    fs.mkdirSync(d, { recursive: true });
    if (envProd) fs.writeFileSync(path.join(d, ".env.prod"), "");
    return d;
  };
  const env = (repo: string, extra: Record<string, string> = {}) => ({ UNIT_DIR: unitDir(), STAMP_DIR: stampDir(), SYSTEMCTL: fakeSystemctl(), REPO: repo, MAKE: "/usr/bin/make", ...extra });
  const sctl = () => callsOf(path.join(tmp, "systemctl.log"));
  const hasGit = spawnSync("git", ["--version"]).status === 0;

  it("writes a service and a timer with the absolute repo path, enables the timer, never needs sudo", () => {
    const repo = mkrepo();
    const r = run("auto-backup-install.sh", ["install", "ezh_prod"], env(repo));
    expect(r.code).toBe(0);
    const svc = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.service"), "utf8");
    const tim = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "utf8");
    expect(svc).toContain(`ExecStart=/bin/sh "${repo}/scripts/prod/auto-backup-run.sh" prod`);
    expect(svc).toContain("(make prod-backup-auto-run)");
    expect(svc).toMatch(/^Type=oneshot$/m);
    expect(svc).not.toMatch(/^Documentation=/m); // a URL list cannot hold a path with spaces (systemd-analyze verify found this)
    expect(tim).toMatch(/^Persistent=true$/m);
    expect(tim).toMatch(/WantedBy=timers\.target/);
    expect(sctl().join("\n")).toMatch(/--user daemon-reload/);
    expect(sctl().join("\n")).toMatch(/--user enable --now ezh-prod-backup\.timer/);
    expect(fs.readFileSync(script("auto-backup-install.sh"), "utf8").replace(/^\s*#.*$/gm, "")).not.toMatch(/sudo|linger/);
  });

  it("M1: the timer fires every hour (not once a day): a missed midnight run happens at login, when Docker is still off, and would be 'done'", () => {
    run("auto-backup-install.sh", ["install", "ezh_prod"], env(mkrepo()));
    const tim = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "utf8");
    expect(tim).toMatch(/^OnCalendar=hourly$/m);
    expect(tim).not.toMatch(/^OnCalendar=daily$/m);
    expect(tim).toMatch(/^RandomizedDelaySec=5min$/m);
    expect(tim).toMatch(/^Persistent=true$/m);
  });

  it("escapes characters that systemd treats specially in a path (% and $ and quotes)", () => {
    const repo = mkrepo('100% "odd" $HOME dir');
    run("auto-backup-install.sh", ["install", "ezh_prod"], env(repo));
    const svc = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.service"), "utf8");
    expect(svc).toContain('ExecStart=/bin/sh "' + repo.replace(/%/g, "%%").replace(/\$/g, "$$$$").replace(/"/g, '\\"') + '/scripts/prod/auto-backup-run.sh" prod');
  });

  it("is idempotent: a second install changes nothing and reports it", () => {
    const repo = mkrepo();
    run("auto-backup-install.sh", ["install", "ezh_prod"], env(repo));
    const before = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "utf8");
    const r = run("auto-backup-install.sh", ["install", "ezh_prod"], env(repo));
    expect(r.code).toBe(0);
    expect(fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "utf8")).toBe(before);
    expect(r.out).toMatch(/already|unchanged/i);
  });

  it("uninstall disables the timer, removes both files and the timer stamp (and is fine when nothing is installed)", () => {
    const repo = mkrepo();
    run("auto-backup-install.sh", ["install", "ezh_prod"], env(repo));
    fs.mkdirSync(stampDir(), { recursive: true });
    fs.writeFileSync(path.join(stampDir(), "stamp-ezh-prod-backup.timer"), "");
    fs.writeFileSync(path.join(stampDir(), "stamp-other.timer"), "");
    const r = run("auto-backup-install.sh", ["uninstall", "ezh_prod"], env(repo));
    expect(r.code).toBe(0);
    expect(fs.readdirSync(unitDir())).toEqual([]);
    expect(fs.readdirSync(stampDir())).toEqual(["stamp-other.timer"]); // only ours is removed
    expect(sctl().join("\n")).toMatch(/--user disable --now ezh-prod-backup\.timer/);
    expect(run("auto-backup-install.sh", ["uninstall", "ezh_prod"], env(repo)).code).toBe(0);
  });

  it.each(["ezh_stage", "ezh_ci", "ezh_other", ""])("refuses project '%s' (only the real production project gets a timer)", (project) => {
    const r = run("auto-backup-install.sh", ["install", project], env(mkrepo()));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/ezh_prod/);
    expect(fs.existsSync(unitDir())).toBe(false);
    expect(sctl()).toEqual([]);
  });

  it("S4: refuses a checkout that has no .env.prod (it is not the folder the real app runs from)", () => {
    const r = run("auto-backup-install.sh", ["install", "ezh_prod"], env(mkrepo("other checkout", false)));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain(".env.prod");
    expect(r.err).toMatch(/[ก-๙]/);
    expect(fs.existsSync(unitDir())).toBe(false);
    expect(sctl()).toEqual([]);
  });

  it.skipIf(!hasGit)("S4: refuses a linked git worktree (it may be deleted; the timer would then fail every hour)", () => {
    const main = mkrepo("main repo", true);
    const g = (args: string[], cwd: string) => spawnSync("git", ["-c", "user.email=a@b", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" });
    g(["init", "-q", "-b", "main"], main);
    g(["commit", "-q", "--allow-empty", "-m", "x"], main);
    const wt = path.join(tmp, "linked wt");
    expect(g(["worktree", "add", "-q", wt, "-b", "wt"], main).status).toBe(0);
    fs.writeFileSync(path.join(wt, ".env.prod"), "");
    const r = run("auto-backup-install.sh", ["install", "ezh_prod"], env(wt));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/worktree/i);
    expect(fs.existsSync(unitDir())).toBe(false);
    // the main checkout is fine
    expect(run("auto-backup-install.sh", ["install", "ezh_prod"], env(main)).code).toBe(0);
  });

  it("the templates are the only source of the unit text (a rendered stage copy is possible for tests: render mode)", () => {
    const out = path.join(tmp, "render");
    const r = run("auto-backup-install.sh", ["render", "ezh_stage", out, "ezh-stage-test-backup"], env(mkrepo("any dir", false)));
    expect(r.code).toBe(0);
    expect(fs.readFileSync(path.join(out, "ezh-stage-test-backup.service"), "utf8")).toContain("stage-backup-auto-run");
    expect(fs.existsSync(path.join(unitDir()))).toBe(false);
  });
});

describe("S3d: auto-backup-run.sh (what the unit runs) records failures that happen before the backup script runs", () => {
  const state = () => path.join(tmp, "data", "backup-auto.state");
  function fakeMake(body: string) {
    const bin = path.join(tmp, "fake-make");
    fs.writeFileSync(bin, `#!/bin/sh\necho "$*" >> "${path.join(tmp, "make.log")}"\n${body}\n`, { mode: 0o755 });
    return bin;
  }
  const go = (body: string) => run("auto-backup-run.sh", ["prod"], { MAKE: fakeMake(body), STATE_FILE: state() });

  it("calls the make target for the project", () => {
    go("exit 0");
    expect(callsOf(path.join(tmp, "make.log")).join("\n")).toMatch(/--no-print-directory prod-backup-auto-run/);
    expect(run("auto-backup-run.sh", ["stage"], { MAKE: fakeMake("exit 0"), STATE_FILE: state() }).code).toBe(0);
    expect(callsOf(path.join(tmp, "make.log")).join("\n")).toMatch(/stage-backup-auto-run/);
  });
  it("success: exit 0 and the state file is not touched", () => {
    expect(go("exit 0").code).toBe(0);
    expect(fs.existsSync(state())).toBe(false);
  });
  it("make fails without the backup script having recorded anything (unreadable .env.prod, moved repo...): FAILED state, same exit code", () => {
    const r = go('echo "env file unreadable" >&2; exit 2');
    expect(r.code).toBe(2);
    const st = fs.readFileSync(state(), "utf8");
    expect(st).toMatch(/^result=FAILED$/m);
    expect(st).toMatch(/^message=.*exit 2.*(journalctl|systemctl)/m);
    expect(st).toMatch(/^attempt=FAILED/m);
  });
  it("make fails AFTER the backup script recorded its own, more precise failure: that state is kept", () => {
    const r = go(`printf 'result=FAILED\\nat=2026-01-01 00:00:00\\nmessage=pg_dump said no\\nattempt=FAILED\\nattempt_at=2026-01-01 00:00:00\\n' > "${state()}"; exit 1`);
    expect(r.code).toBe(1);
    expect(fs.readFileSync(state(), "utf8")).toContain("message=pg_dump said no");
  });
  it("an earlier success time is kept when it records a failure", () => {
    fs.mkdirSync(path.dirname(state()), { recursive: true });
    fs.writeFileSync(state(), "result=ok\nat=2026-01-01 00:00:00\nok_at=2026-01-01 00:00:00\n");
    go("exit 2");
    expect(fs.readFileSync(state(), "utf8")).toMatch(/^ok_at=2026-01-01 00:00:00$/m);
  });
});

describe("wiring in the Makefile, env example and check-env", () => {
  const mk = fs.readFileSync(path.join(repoRoot, "Makefile"), "utf8");
  const slice = (from: string, to: string) => mk.slice(mk.indexOf(from), mk.indexOf(to, mk.indexOf(from) + 1));

  it("has the install / uninstall / status / run targets", () => {
    for (const t of ["prod-backup-auto-install:", "prod-backup-auto-uninstall:", "prod-backup-auto-status:", "prod-backup-auto-run:"]) expect(mk).toContain(t);
    expect(mk).toContain("scripts/prod/auto-backup-install.sh");
  });
  it("the timer runs the same target that stage-backup-auto-run runs (prod-backup-auto-run with the stage project)", () => {
    expect(mk).toMatch(/prod-backup-auto-run:[^\n]*\n\t@\$\(PROD_SCRIPT_ENV\)[^\n]*auto-backup\.sh/);
  });
  it("prod-up and prod-down take an automatic backup when the newest is old (prod only by default, AUTO_ON_UP overrides)", () => {
    const up = slice("prod-up:", "prod-update:");
    expect(up).toContain("auto-backup.sh");
    expect(up).toContain("AUTO_ON_UP");
    expect(up.indexOf("up -d --wait")).toBeLessThan(up.indexOf("auto-backup.sh"));
    const down = slice("prod-down:", "prod-logs:");
    expect(down).toContain("auto-backup.sh");
    expect(down.indexOf("auto-backup.sh")).toBeLessThan(down.indexOf("$(PROD) down"));
    expect(mk).toMatch(/AUTO_ON_UP \?= \$\(if \$\(filter ezh_prod,\$\(PROD_PROJECT\)\),1,0\)/);
  });
  it("S5: both hooks run under `timeout 300`, so a hung pg_dump cannot block starting or stopping the app", () => {
    for (const body of [slice("prod-up:", "prod-update:"), slice("prod-down:", "prod-logs:")]) {
      const line = body.split("\n").find((l) => l.includes("auto-backup.sh")) ?? "";
      expect(line).toMatch(/timeout 300 sh scripts\/prod\/auto-backup\.sh/);
    }
  });
  it("S4: the full status knows which checkout it is run from", () => {
    expect(slice("prod-backup-auto-status:", "# ---- Stage and ci")).toMatch(/REPO='?\$\(CURDIR\)/);
  });
  it("a failing automatic backup in prod-up / prod-down never blocks starting or stopping", () => {
    for (const body of [slice("prod-up:", "prod-update:"), slice("prod-down:", "prod-logs:")]) {
      const line = body.split("\n").find((l) => l.includes("auto-backup.sh")) ?? "";
      expect(line).toMatch(/\|\||; *fi|-@/);
    }
  });
  it("prod-status prints the newest backup, its age and the warnings", () => {
    expect(slice("prod-status:", "prod-migrate:")).toContain("auto-backup-status.sh --brief");
  });
  it("BACKUP_KEEP_AUTO is documented, validated and read by the Makefile", () => {
    expect(fs.readFileSync(path.join(repoRoot, ".env.prod.example"), "utf8")).toMatch(/^BACKUP_KEEP_AUTO=14$/m);
    expect(mk).toContain("BACKUP_KEEP_AUTO");
    const GOOD = "POSTGRES_PASSWORD=abcdEFGH1234ijklMNOP5678\n";
    const f = path.join(tmp, ".env.prod");
    for (const bad of ["0", "abc", "08", "1.5"]) {
      fs.writeFileSync(f, `${GOOD}BACKUP_KEEP_AUTO=${bad}\n`);
      const r = run("check-env.sh", [f]);
      expect(r.code, bad).not.toBe(0);
      expect(r.err).toContain("BACKUP_KEEP_AUTO");
    }
    fs.writeFileSync(f, `${GOOD}BACKUP_KEEP_AUTO=30\n`);
    expect(run("check-env.sh", [f]).code).toBe(0);
  });
  it("data/ (log and state files) is git-ignored", () => {
    expect(fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8")).toMatch(/^data\/$/m);
  });
});
