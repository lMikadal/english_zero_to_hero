import { describe, expect, it } from "vitest";
import { buttonClass } from "./button-styles";

describe("buttonClass", () => {
  it.each(["primary", "secondary", "quiet"] as const)("%s is at least 48px tall and full width by default", (kind) => {
    expect(buttonClass(kind)).toMatch(/\bmin-h-12\b/);
    expect(buttonClass(kind)).toMatch(/\bw-full\b/);
  });
  it("primary is the accent button with a disabled look; secondary is outlined", () => {
    expect(buttonClass("primary")).toMatch(/\bbg-accent\b/);
    expect(buttonClass("primary")).toMatch(/\btext-on-accent\b/);
    expect(buttonClass("primary")).toMatch(/disabled:bg-surface/);
    expect(buttonClass("secondary")).toMatch(/\bborder-line\b/);
  });
});
