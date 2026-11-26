import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "ezh-theme" && jar.value ? { name: n, value: jar.value } : undefined) }),
}));

describe("Settings page", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("has the title as h1, the theme picker, and no redundant back link (the main nav is in the layout)", async () => {
    render(await SettingsPage());
    expect(screen.getByRole("heading", { level: 1, name: "ตั้งค่า" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "ธีม" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("defaults to ตามเครื่อง without a cookie", async () => {
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "ตามเครื่อง" })).toBeChecked();
  });

  it("shows the stored choice from the cookie", async () => {
    jar.value = "dark";
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "มืด" })).toBeChecked();
  });

  it("ignores a garbage cookie", async () => {
    jar.value = "neon";
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "ตามเครื่อง" })).toBeChecked();
  });
});
