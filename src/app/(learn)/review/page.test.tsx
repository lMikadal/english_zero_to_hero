import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeQueue } from "@/components/review/test-helpers";
import Page from "./page";

const loadReviewQueue = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: () => ({ marker: "db" }) }));
vi.mock("@/lib/server/current-user", () => ({ getCurrentUserId: async () => "local" }));
vi.mock("@/lib/srs/cards", () => ({ loadReviewQueue }));

const show = async () => render(await Page());

describe("review page", () => {
  beforeEach(() => {
    loadReviewQueue.mockReset();
    loadReviewQueue.mockResolvedValue(makeQueue([["country", "en_th"], ["friend", "th_en"]]));
  });

  it("loads the queue for the signed-in learner with the server clock and passes it to the session", async () => {
    await show();
    expect(loadReviewQueue).toHaveBeenCalledWith({ marker: "db" }, "local", expect.any(Date));
    expect(screen.getByRole("heading", { level: 1, name: "ทวนคำศัพท์" })).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("country")).toHaveAttribute("lang", "en");
  });

  it("has no main navigation", async () => {
    await show();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows the empty state when nothing is due", async () => {
    loadReviewQueue.mockResolvedValue(makeQueue([]));
    await show();
    expect(screen.getByText("ยังไม่มีคำที่ถึงกำหนดวันนี้")).toBeInTheDocument();
  });

  it("shows the database error screen with a retry link to /review", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    loadReviewQueue.mockRejectedValue(new Error("db down"));
    await show();
    expect(screen.getByRole("alert")).toHaveTextContent("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/review");
    err.mockRestore();
  });
});
