// Machine check for the main navigation (docs/ARCHITECTURE.md): every page file under the (main) route group renders
// inside its layout with exactly one nav "เมนูหลัก" containing exactly one aria-current="page" link that matches the
// route; the lesson player (/day/[day]) must not get the nav. A new page added to the group is covered automatically.
import fs from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NAV_ITEMS } from "@/components/nav/items";
import MainLayout from "./layout";

const route = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
// What the pages read (see page.test.tsx files for the cases); fixed values are enough to render them.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/components/player/UnsavedNote", () => ({ UnsavedNote: () => null }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/server/current-user", () => ({ getCurrentUserId: async () => "local" }));
vi.mock("@/db/queries/home", () => ({
  getLearnerHome: async () => ({ currentDay: 1, streak: { current: 0, longest: 0 }, activeToday: false, courseComplete: false, blockingCheckpoint: null, checkpointNote: null }),
}));
vi.mock("@/db/queries/practice", () => ({ listDoneDays: async () => [{ day: 1, score: 0.9, completedAt: new Date("2026-11-25T10:00:00Z") }] }));
vi.mock("@/lib/content/repo", () => ({ getLesson: () => null }));
vi.mock("@/lib/srs/cards", () => ({ getReviewSummary: async () => ({ due: 3, withCard: 5 }) }));
vi.mock("@/app/(learn)/access", () => ({ getAccent: async () => "us" }));

const pages = import.meta.glob<{ default: () => Promise<ReactNode> | ReactNode }>("./**/page.tsx");
const routeOf = (file: string) => file.replace(/^\./, "").replace(/\/?page\.tsx$/, "") || "/";

describe("(main) route group", () => {
  it("contains exactly the four menu pages", () => {
    expect(Object.keys(pages).map(routeOf).sort()).toEqual(NAV_ITEMS.map((i) => i.href).sort());
  });

  it.each(Object.keys(pages).map((f) => [routeOf(f), f] as const))("%s renders inside the nav layout with its own menu current", async (r, file) => {
    route.path = r;
    const Page = (await pages[file]()).default;
    render(await MainLayout({ children: await Page() }));
    const navs = screen.getAllByRole("navigation", { name: "เมนูหลัก" });
    expect(navs).toHaveLength(1);
    const current = within(navs[0]).getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", r);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("keeps page content clear of the floating bar with bottom padding that includes the safe area", async () => {
    route.path = "/settings";
    const Page = (await pages["./settings/page.tsx"]()).default;
    const { container } = render(await MainLayout({ children: await Page() }));
    expect((container.firstElementChild as HTMLElement).className).toMatch(/pb-\[calc\([^\]]*safe-area-inset-bottom/);
  });
});

describe("lesson player has no main nav", () => {
  it("/day/[day] is not in the (main) group", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/(learn)/day/[day]/page.tsx"))).toBe(true);
    expect(Object.keys(pages).some((f) => f.includes("day"))).toBe(false);
  });

  it("the (learn) layout renders no nav", async () => {
    const { default: LearnLayout } = await import("../(learn)/layout");
    render(await LearnLayout({ children: <main>lesson</main> }));
    expect(screen.queryByRole("navigation", { name: "เมนูหลัก" })).toBeNull();
  });
});
