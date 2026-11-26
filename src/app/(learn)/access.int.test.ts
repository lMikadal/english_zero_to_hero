// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { cleanDatabase, connectTestDb, testDatabaseUrl } from "@/db/test-utils";
import { getAccent, getCurrentDay } from "./access";

const { sql } = connectTestDb();

beforeAll(() => {
  // getCurrentDay() uses the app's own client (getDb), which reads DATABASE_URL: point it at the test database.
  process.env.DATABASE_URL = testDatabaseUrl();
});
beforeEach(() => cleanDatabase(sql));
afterAll(async () => {
  await cleanDatabase(sql);
  await closeDb();
  await sql.end();
});

describe("getCurrentDay", () => {
  it("creates the local learner on first use and returns day 1", async () => {
    expect(await getCurrentDay()).toBe(1);
  });

  it("returns the learner's profiles.current_day", async () => {
    await getCurrentDay();
    await sql`UPDATE profiles SET current_day = 4`;
    expect(await getCurrentDay()).toBe(4);
  });
});

describe("getAccent", () => {
  it("defaults to us", async () => {
    expect(await getAccent()).toBe("us");
  });

  it("returns profiles.accent", async () => {
    await getCurrentDay();
    await sql`UPDATE profiles SET accent = 'uk'`;
    expect(await getAccent()).toBe("uk");
  });
});
