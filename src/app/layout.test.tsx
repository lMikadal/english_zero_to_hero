import { beforeEach, describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "ezh-theme" && jar.value ? { name: n, value: jar.value } : undefined) }),
}));

const attr = async () => {
  const html = (await RootLayout({ children: null })) as { props: Record<string, unknown> };
  return html.props["data-theme"];
};

describe("RootLayout theme", () => {
  beforeEach(() => {
    jar.value = undefined;
  });
  it("puts the cookie's theme on <html data-theme> so the first paint is right", async () => {
    jar.value = "dark";
    expect(await attr()).toBe("dark");
    jar.value = "light";
    expect(await attr()).toBe("light");
  });
  it("is system without a cookie or with a bad one", async () => {
    expect(await attr()).toBe("system");
    jar.value = "bogus";
    expect(await attr()).toBe("system");
  });
});
