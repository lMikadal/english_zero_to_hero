import fs from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainNav } from "./MainNav";
import { NAV_ITEMS } from "./items";

const path_ = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path_.value }));

const show = (p: string) => {
  path_.value = p;
  return render(<MainNav />);
};

describe("MainNav", () => {
  it("lists the four menus in order, as real links", () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.href])).toEqual([["วันนี้", "/"], ["ฝึกเพิ่ม", "/practice"], ["พัฒนาการ", "/progress"], ["ตั้งค่า", "/settings"]]);
    show("/");
    const nav = screen.getByRole("navigation", { name: "เมนูหลัก" });
    expect(within(nav).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/", "/practice", "/progress", "/settings"]);
  });

  it.each(NAV_ITEMS)("on $href only $label is current, and its label is hidden visually but still its accessible name", ({ href, label }) => {
    show(href);
    const nav = screen.getByRole("navigation", { name: "เมนูหลัก" });
    const current = within(nav).getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", href);
    expect(current[0]).toHaveAccessibleName(label);
    expect(within(current[0]).getByText(label)).toHaveClass("sr-only");
  });

  it("other menus show icon and a visible label", () => {
    show("/practice");
    const nav = screen.getByRole("navigation", { name: "เมนูหลัก" });
    for (const label of ["วันนี้", "พัฒนาการ", "ตั้งค่า"]) {
      const link = within(nav).getByRole("link", { name: label });
      expect(link).not.toHaveAttribute("aria-current");
      expect(within(link).getByText(label)).not.toHaveClass("sr-only");
      expect(link.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("a nested route keeps its menu current, and / is not current on other pages", () => {
    show("/practice/anything");
    expect(screen.getByRole("link", { name: "ฝึกเพิ่ม" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "วันนี้" })).not.toHaveAttribute("aria-current");
  });

  it("every link is at least 44px tall (min-h-11) and the bar respects the bottom safe area", () => {
    show("/");
    const nav = screen.getByRole("navigation", { name: "เมนูหลัก" });
    for (const link of within(nav).getAllByRole("link")) expect(link.className).toMatch(/\bmin-h-11\b/);
    expect(nav.className).toMatch(/safe-area-inset-bottom/);
  });

  it("the bar background carries the notch class and the notch centre is set per current menu", () => {
    const { container } = show("/progress");
    const bar = container.querySelector(".nav-notch") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute("style")).toMatch(/--cx:\s*calc\(/);
  });

  it("globals.css cuts the notch with a mask using the --cx variable, no raw colour hidden in a class", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = css.slice(css.indexOf(".nav-notch"));
    expect(rule).toMatch(/mask-image:\s*radial-gradient\([^;]*var\(--cx\)/);
  });

  describe("outline ring around the notch (design 13: the bar's outline follows the notch curve)", () => {
    const ring = (c: HTMLElement) => c.querySelector(".nav-ring") as HTMLElement | null;

    it.each(NAV_ITEMS)("on $href there is one decorative ring layer centred like the notch", ({ href }) => {
      const { container } = show(href);
      const layer = ring(container);
      expect(layer).not.toBeNull();
      expect(container.querySelectorAll(".nav-ring")).toHaveLength(1);
      expect(layer).toHaveAttribute("aria-hidden", "true");
      expect(layer!.textContent).toBe("");
      const notch = container.querySelector(".nav-notch") as HTMLElement;
      expect(layer!.getAttribute("style")).toBe(notch.getAttribute("style")); // same --cx, so the two always line up
    });

    it("is not drawn when no menu is current (there is no notch either)", () => {
      const { container } = show("/somewhere-else");
      expect(container.querySelector(".nav-notch")).toBeNull();
      expect(ring(container)).toBeNull();
    });

    it("globals.css draws it from tokens only: a --line fill, masked to a thin circle band around the notch", () => {
      const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
      const rule = /\.nav-ring\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
      expect(rule).toMatch(/background(-color)?:\s*var\(--line\)/);
      expect(rule).toMatch(/mask-image:\s*radial-gradient\([^;]*var\(--cx\)/);
      // the opaque stop inside mask-image is alpha only (as in .nav-notch), not a colour that is painted
      expect(rule.replace(/#0{3}/g, "")).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i);
    });

    it("sits inside the bar box (same rounded corners), under the links", () => {
      const { container } = show("/");
      const classes = ring(container)!.className;
      expect(classes).toMatch(/\babsolute\b/);
      expect(classes).toMatch(/\binset-0\b/);
      expect(classes).toMatch(/\brounded-3xl\b/);
      expect(classes).toMatch(/\bpointer-events-none\b/);
    });
  });
});
