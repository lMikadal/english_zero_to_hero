// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { profiles, user } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { ensureLocalUser, LOCAL_USER_ID } from "./current-user";

const { sql, db } = connectTestDb();

beforeEach(() => cleanDatabase(sql));
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("ensureLocalUser", () => {
  it("creates the local user and a profile starting today in Asia/Bangkok", async () => {
    // 2026-11-25T18:30Z is already 26 Nov in Bangkok
    const id = await ensureLocalUser(db, new Date("2026-11-25T18:30:00Z"));
    expect(id).toBe(LOCAL_USER_ID);
    expect(LOCAL_USER_ID).toBe("local");
    const [u] = await db.select().from(user);
    expect(u.id).toBe("local");
    const [p] = await db.select().from(profiles);
    expect(p).toMatchObject({ userId: "local", startDate: "2026-11-26", currentDay: 1, timezone: "Asia/Bangkok" });
  });

  it("is idempotent and never resets an existing profile", async () => {
    await ensureLocalUser(db, new Date("2026-11-25T00:00:00Z"));
    await sql`UPDATE profiles SET current_day = 4`;
    await ensureLocalUser(db, new Date("2026-12-30T00:00:00Z"));
    const rows = await db.select().from(profiles);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ currentDay: 4, startDate: "2026-11-25" });
  });

  it("repairs a user that exists without a profile", async () => {
    await sql`INSERT INTO "user" (id, name, email) VALUES ('local', 'x', 'local@local.invalid')`;
    await ensureLocalUser(db, new Date("2026-11-25T00:00:00Z"));
    expect(await db.select().from(profiles)).toHaveLength(1);
  });

  it("leaves one user and one profile after concurrent first calls", async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => ensureLocalUser(db, new Date("2026-11-25T00:00:00Z"))));
    expect(new Set(ids)).toEqual(new Set(["local"]));
    expect(await db.select().from(user)).toHaveLength(1);
    expect(await db.select().from(profiles)).toHaveLength(1);
  });
});
