import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_COOKIE, THEMES, parseTheme, themeCookie } from "./theme";

describe("theme cookie", () => {
  it("is named ezh-theme and offers light, dark and system", () => {
    expect(THEME_COOKIE).toBe("ezh-theme");
    expect([...THEMES]).toEqual(["light", "dark", "system"]);
  });

  it("defaults to system (follow the device)", () => {
    expect(DEFAULT_THEME).toBe("system");
  });

  it("parses known values and falls back to system for anything else", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme("")).toBe("system");
  });

  it("builds a one-year, site-wide, lax cookie string", () => {
    expect(themeCookie("dark")).toBe("ezh-theme=dark; path=/; max-age=31536000; samesite=lax");
  });
});
