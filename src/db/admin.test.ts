// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertResettable, databaseName, withDatabaseName } from "./admin";

const base = "postgres://ezh:ezh@postgres:5432";

describe("assertResettable", () => {
  it("accepts a *_dev database when CONFIRM names it", () => {
    expect(() => assertResettable(`${base}/english_zero_to_hero_dev`, "english_zero_to_hero_dev")).not.toThrow();
  });

  it("refuses the real database even with the matching CONFIRM", () => {
    expect(() => assertResettable(`${base}/english_zero_to_hero`, "english_zero_to_hero")).toThrow(/_dev/);
  });

  it("refuses names that do not end in _dev, whatever the host", () => {
    for (const name of ["prod", "english_zero_to_hero_dev_test", "devx", "dev", "my_dev_old"]) {
      expect(() => assertResettable(`${base}/${name}`, name)).toThrow(/_dev/);
    }
    expect(() => assertResettable("postgres://u:p@example.com:5432/app", "app")).toThrow(/_dev/);
  });

  it("refuses a *_test database", () => {
    expect(() => assertResettable(`${base}/english_zero_to_hero_test`, "english_zero_to_hero_test")).toThrow(/_dev/);
  });

  it("refuses a missing CONFIRM and says what to type", () => {
    expect(() => assertResettable(`${base}/ezh_dev`, undefined)).toThrow(/CONFIRM=ezh_dev/);
    expect(() => assertResettable(`${base}/ezh_dev`, "")).toThrow(/CONFIRM=ezh_dev/);
  });

  it("refuses a wrong CONFIRM", () => {
    expect(() => assertResettable(`${base}/ezh_dev`, "ezh")).toThrow(/CONFIRM=ezh_dev/);
    expect(() => assertResettable(`${base}/ezh_dev`, "EZH_DEV")).toThrow(/CONFIRM=ezh_dev/);
  });

  it("compares against the URL-decoded name", () => {
    const url = `${base}/my%20app_dev`;
    expect(databaseName(url)).toBe("my app_dev");
    expect(() => assertResettable(url, "my app_dev")).not.toThrow();
    expect(() => assertResettable(url, "my%20app_dev")).toThrow(/CONFIRM/);
    expect(() => assertResettable(`${base}/real%5Fdb`, "real_db")).toThrow(/_dev/);
  });

  it("refuses a URL with no database name", () => {
    expect(() => assertResettable(`${base}/`, "")).toThrow();
  });
});

describe("withDatabaseName", () => {
  it("round-trips odd names", () => {
    expect(databaseName(withDatabaseName(base + "/x", "a b_dev"))).toBe("a b_dev");
  });
});
