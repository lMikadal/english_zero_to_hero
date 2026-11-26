// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { progress } from "@/db/schema";
import { seedLocal } from "@/lib/server/test-helpers";
import { getDayStatus, listDoneDays } from "./practice";

const { sql, db } = connectTestDb();
let userId: string;

const done = (day: number, completedAt: string, score: number | null = 1) =>
  db.insert(progress).values({ userId, day, status: "done", score, startedAt: new Date(completedAt), completedAt: new Date(completedAt) });

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("listDoneDays", () => {
  it("is empty when nothing is finished", async () => {
    expect(await listDoneDays(db, userId)).toEqual([]);
  });

  it("returns only done days, newest day first, with score and completedAt", async () => {
    await done(1, "2026-11-20T10:00:00Z", 0.5);
    await done(3, "2026-11-22T10:00:00Z", null);
    await done(2, "2026-11-21T10:00:00Z", 1);
    await db.insert(progress).values({ userId, day: 4, status: "in_progress", startedAt: new Date() });
    await db.insert(progress).values({ userId, day: 5, status: "not_started" });
    expect(await listDoneDays(db, userId)).toEqual([
      { day: 3, score: null, completedAt: new Date("2026-11-22T10:00:00Z") },
      { day: 2, score: 1, completedAt: new Date("2026-11-21T10:00:00Z") },
      { day: 1, score: 0.5, completedAt: new Date("2026-11-20T10:00:00Z") },
    ]);
  });

  it("does not list another user's days", async () => {
    await done(1, "2026-11-20T10:00:00Z");
    expect(await listDoneDays(db, "someone-else")).toEqual([]);
  });
});

describe("getDayStatus", () => {
  it("is not_started when there is no row", async () => {
    expect(await getDayStatus(db, userId, 9)).toBe("not_started");
  });
  it("returns the stored status", async () => {
    await done(1, "2026-11-20T10:00:00Z");
    await db.insert(progress).values({ userId, day: 2, status: "in_progress", startedAt: new Date() });
    expect(await getDayStatus(db, userId, 1)).toBe("done");
    expect(await getDayStatus(db, userId, 2)).toBe("in_progress");
  });
});
