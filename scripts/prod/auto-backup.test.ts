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

/** fake `docker compose`: logs calls; FAKE_FAIL=<text> fails matching calls; FAKE_STACK_DOWN=1 = postgres not running; FAKE_NO_DATA=1 = empty database */
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
      ...extra,
    };
  };
  const seed = (...files: string[]) => {
    fs.mkdirSync(backups(), { recursive: true });
    files.forEach((f) => fs.writeFileSync(path.join(backups(), f), "x"));
  };
  const list = () => (fs.existsSync(backups()) ? fs.readdirSync(backups()).sort() : []);
  const compose = () => callsOf(path.join(tmp, "calls.log"));

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

  it("when Docker is not running: skips quietly (exit 0, one clear line) and never starts anything", () => {
    const r = run("auto-backup.sh", [], env({}, false));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/SKIP.*Docker is not running/);
    expect(list()).toEqual([]);
    expect(compose()).toEqual([]); // compose was not even asked
    expect(fs.existsSync(state())).toBe(false); // a skip is not a result
    expect(fs.readFileSync(logf(), "utf8")).toMatch(/SKIP/);
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
    expect(left).toContain(autos[0] === undefined ? "" : autos[3]); // newest of the old autos (7 days ago)
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
    expect(list()).toHaveLength(1); // the inner run took the lock itself only because the outer one released nothing? it must NOT have: see below
  });

  it("the log keeps only the latest ~1000 lines", () => {
    fs.mkdirSync(path.dirname(logf()), { recursive: true });
    fs.writeFileSync(logf(), Array.from({ length: 1500 }, (_, i) => `old line ${i}`).join("\n") + "\n");
    run("auto-backup.sh", [], env({ FAKE_STACK_DOWN: "1" }));
    const lines = fs.readFileSync(logf(), "utf8").trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(1001);
    expect(lines.at(-1)).toMatch(/SKIP/);
  });

  it("never starts Docker or the stack by itself (static check of the script)", () => {
    const src = fs.readFileSync(script("auto-backup.sh"), "utf8").replace(/^\s*#.*$/gm, "");
    expect(src).not.toMatch(/docker-on|systemctl|\bup -d\b|\bstart\b|sudo/);
  });
});

describe("auto-backup-status.sh", () => {
  const backups = () => path.join(tmp, "backups");
  const stateF = () => path.join(tmp, "backup-auto.state");
  const seed = (...files: string[]) => {
    fs.mkdirSync(backups(), { recursive: true });
    files.forEach((f) => fs.writeFileSync(path.join(backups(), f), "x"));
  };
  function fakeSystemctl(installed: boolean) {
    const bin = path.join(tmp, "fake-systemctl");
    fs.writeFileSync(
      bin,
      `#!/bin/sh
echo "$*" >> "${path.join(tmp, "systemctl.log")}"
case "$*" in
  *is-enabled*) ${installed ? 'echo enabled' : 'echo disabled; exit 1'} ;;
  *"show"*"NextElapseUSecRealtime"*) echo "NextElapseUSecRealtime=Sun 2026-12-06 00:12:00 +07" ;;
  *"show"*"Result"*) echo "Result=success"; echo "ExecMainStatus=0"; echo "ExecMainExitTimestamp=Sat 2026-12-05 00:10:00 +07" ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
    return bin;
  }
  const env = (extra: Record<string, string> = {}, installed = true) => ({
    BACKUP_DIR: backups(),
    DB_NAME: DB,
    STATE_FILE: stateF(),
    UNIT: "ezh-prod-backup",
    SYSTEMCTL: fakeSystemctl(installed),
    ...extra,
  });

  it("shows the newest backup (any kind) and its age", () => {
    seed(fname(hoursAgo(50)), fname(hoursAgo(3), "pre-update"), fname(hoursAgo(26), "auto"));
    const r = run("auto-backup-status.sh", ["--brief"], env());
    expect(r.code).toBe(0);
    expect(r.out).toContain(fname(hoursAgo(3), "pre-update").slice(0, -18)); // name prefix is enough; the time differs by seconds
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
  });

  it("brief mode does not talk to systemd (prod-status stays fast and works without a user session)", () => {
    seed(fname(hoursAgo(2)));
    run("auto-backup-status.sh", ["--brief"], env());
    expect(fs.existsSync(path.join(tmp, "systemctl.log"))).toBe(false);
  });
});

describe("auto-backup-install.sh and the unit templates", () => {
  const unitDir = () => path.join(tmp, "units");
  function fakeSystemctl() {
    const bin = path.join(tmp, "fake-systemctl");
    fs.writeFileSync(bin, `#!/bin/sh\necho "$*" >> "${path.join(tmp, "systemctl.log")}"\nexit 0\n`, { mode: 0o755 });
    return bin;
  }
  const env = (extra: Record<string, string> = {}) => ({ UNIT_DIR: unitDir(), SYSTEMCTL: fakeSystemctl(), REPO: "/home/me/my repo/english zero", MAKE: "/usr/bin/make", ...extra });
  const sctl = () => callsOf(path.join(tmp, "systemctl.log"));

  it("writes a service and a timer with the absolute repo path, enables the timer, never needs sudo", () => {
    const r = run("auto-backup-install.sh", ["install", "ezh_prod"], env());
    expect(r.code).toBe(0);
    const svc = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.service"), "utf8");
    const tim = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "utf8");
    expect(svc).toContain('ExecStart=/usr/bin/make -C "/home/me/my repo/english zero" --no-print-directory prod-backup-auto-run');
    expect(svc).toMatch(/^Type=oneshot$/m);
    expect(tim).toMatch(/^OnCalendar=daily$/m);
    expect(tim).toMatch(/^Persistent=true$/m);
    expect(tim).toMatch(/^RandomizedDelaySec=\d+/m);
    expect(tim).toMatch(/WantedBy=timers\.target/);
    expect(sctl().join("\n")).toMatch(/--user daemon-reload/);
    expect(sctl().join("\n")).toMatch(/--user enable --now ezh-prod-backup\.timer/);
    expect(fs.readFileSync(script("auto-backup-install.sh"), "utf8").replace(/^\s*#.*$/gm, "")).not.toMatch(/sudo|linger/);
  });

  it("escapes characters that systemd treats specially in a path (% and $ and quotes)", () => {
    run("auto-backup-install.sh", ["install", "ezh_prod"], env({ REPO: '/home/me/100% "odd" $HOME dir' }));
    const svc = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.service"), "utf8");
    expect(svc).toContain('-C "/home/me/100%% \\"odd\\" $$HOME dir"');
  });

  it("is idempotent: a second install changes nothing and reports it", () => {
    run("auto-backup-install.sh", ["install", "ezh_prod"], env());
    const before = fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "utf8");
    const r = run("auto-backup-install.sh", ["install", "ezh_prod"], env());
    expect(r.code).toBe(0);
    expect(fs.readFileSync(path.join(unitDir(), "ezh-prod-backup.timer"), "utf8")).toBe(before);
    expect(r.out).toMatch(/already|unchanged/i);
  });

  it("uninstall disables the timer and removes both files (and is fine when nothing is installed)", () => {
    run("auto-backup-install.sh", ["install", "ezh_prod"], env());
    const r = run("auto-backup-install.sh", ["uninstall", "ezh_prod"], env());
    expect(r.code).toBe(0);
    expect(fs.readdirSync(unitDir())).toEqual([]);
    expect(sctl().join("\n")).toMatch(/--user disable --now ezh-prod-backup\.timer/);
    expect(run("auto-backup-install.sh", ["uninstall", "ezh_prod"], env()).code).toBe(0);
  });

  it.each(["ezh_stage", "ezh_ci", "ezh_other", ""])("refuses project '%s' (only the real production project gets a timer)", (project) => {
    const r = run("auto-backup-install.sh", ["install", project], env());
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/ezh_prod/);
    expect(fs.existsSync(unitDir())).toBe(false);
    expect(sctl()).toEqual([]);
  });

  it("the templates are the only source of the unit text (a rendered stage copy is possible for tests: render mode)", () => {
    const out = path.join(tmp, "render");
    const r = run("auto-backup-install.sh", ["render", "ezh_stage", out, "ezh-stage-test-backup"], env());
    expect(r.code).toBe(0);
    expect(fs.readFileSync(path.join(out, "ezh-stage-test-backup.service"), "utf8")).toContain("stage-backup-auto-run");
    expect(fs.existsSync(path.join(unitDir()))).toBe(false);
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
    expect(down.indexOf("auto-backup.sh")).toBeLessThan(down.indexOf("down"));
    expect(mk).toMatch(/AUTO_ON_UP \?= \$\(if \$\(filter ezh_prod,\$\(PROD_PROJECT\)\),1,0\)/);
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
