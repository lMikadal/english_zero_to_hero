import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { checkpointFixture } from "@/lib/answers/test-content";
import { CheckpointApp } from "./CheckpointApp";
import { confirm, DONE_RESPONSE, fakeCheckpointSink, fillIn, fixtureVocab, nextButton } from "./test-support";
import { displayFromResponse, exerciseIds } from "./view";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));
const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./test-support").fakeCheckpointSink> }));
vi.mock("@/lib/offline/http-sink", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/offline/http-sink")>()), getSyncSink: () => fake.current!.sink }));
vi.spyOn(window, "scrollTo").mockImplementation(() => {}); // jsdom has no layout

const all = checkpointFixture.sections.flatMap((s) => s.exercises);
const base = { checkpoint: checkpointFixture, vocab: fixtureVocab, resume: null, last: null, completedToday: false, latest: null, practised: [] as string[] };
const mount = (props: Partial<React.ComponentProps<typeof CheckpointApp>> = {}) => renderWithAudio(<CheckpointApp {...base} {...props} />, fakeAudio(true));

beforeEach(() => { refresh.mockClear(); fake.current = fakeCheckpointSink(); });

describe("CheckpointApp", () => {
  it("opens on the intro, and the start button opens the first exercise with the whole-set counter", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "แบบทดสอบประจำเดือน ครั้งที่ 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "เริ่มแบบทดสอบ" }));
    expect(screen.getByText("ข้อ 1 / 16")).toBeInTheDocument();
  });

  it("resume starts at the first unanswered exercise under the stored session id", async () => {
    const ids = exerciseIds(checkpointFixture);
    mount({ resume: { sessionId: "5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0099", answered: ids.slice(0, 5) } });
    await userEvent.click(screen.getByRole("button", { name: "ทำต่อ (ข้อ 6 / 16)" }));
    expect(screen.getByText("ข้อ 6 / 16")).toBeInTheDocument();
    await fillIn(all[5]);
    await confirm(all[5]);
    expect(fake.current!.sent[0].sessionId).toBe("5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0099");
    expect(fake.current!.sent[0].exerciseId).toBe(ids[5]);
  });

  it("a retake gets a fresh session and every exercise again", async () => {
    mount({ last: { score: 0.5, passed: false } });
    await userEvent.click(screen.getByRole("button", { name: "สอบอีกครั้ง" }));
    expect(screen.getByText("ข้อ 1 / 16")).toBeInTheDocument();
  });

  it("already taken today: opens on the result and the retake line, with no start button", () => {
    mount({ completedToday: true, latest: displayFromResponse(DONE_RESPONSE) });
    expect(screen.getByRole("heading", { level: 1, name: "ผลแบบทดสอบ ครั้งที่ 1" })).toBeInTheDocument();
    expect(screen.getByText("สอบอีกครั้งได้ตั้งแต่พรุ่งนี้")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /เริ่มแบบทดสอบ|สอบอีกครั้ง|ทำต่อ/ })).toBeNull();
  });

  it("refresh guard: after the sitting is done the page refreshes once, and new server props (taken today, a stored result) keep this sitting's result on screen", async () => {
    const view = mount();
    await userEvent.click(screen.getByRole("button", { name: "เริ่มแบบทดสอบ" }));
    for (const e of all) { await fillIn(e); await confirm(e); await userEvent.click(nextButton()); }
    await screen.findByText("คะแนนรวม 78%");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // what router.refresh() delivers: the same page, now with the stored result, taken today and nothing to resume
    const stored = displayFromResponse({ ...DONE_RESPONSE, result: { ...DONE_RESPONSE.result, score: 0.5, passed: false } });
    await act(async () => { view.rerender(<CheckpointApp {...base} completedToday latest={stored} />); });
    expect(screen.getByText("คะแนนรวม 78%")).toBeInTheDocument(); // still this sitting's own result
    expect(screen.queryByText("คะแนนรวม 50%")).toBeNull();
    expect(screen.queryByRole("button", { name: "เริ่มแบบทดสอบ" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "ผลแบบทดสอบ ครั้งที่ 1" })).toBeInTheDocument();
  });

  it("the replay ticks follow the server props live (the refresh brings them)", async () => {
    const weak = displayFromResponse({ ...DONE_RESPONSE, result: { ...DONE_RESPONSE.result, score: 0.55, passed: false, skills: DONE_RESPONSE.result.skills.map((s) => (s.skill === "writing" ? { ...s, score: 0.4 } : s)) } });
    const view = mount({ completedToday: true, latest: weak });
    expect(screen.getByRole("link", { name: "เขียน · วันที่ 1" })).toBeInTheDocument();
    await act(async () => { view.rerender(<CheckpointApp {...base} completedToday latest={weak} practised={["1:writing"]} />); });
    expect(screen.getByRole("link", { name: "เขียน · วันที่ 1 ฝึกแล้ว" })).toBeInTheDocument();
  });

  it("after a 409 the fresh-start button opens a new sitting from exercise 1 with a new session id", async () => {
    fake.current = fakeCheckpointSink({ status: "rejected", code: 409 });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "เริ่มแบบทดสอบ" }));
    for (const e of all) { await fillIn(e); await confirm(e); await userEvent.click(nextButton()); }
    const firstSession = fake.current.sent[0].sessionId;
    await userEvent.click(await screen.findByRole("button", { name: "เริ่มทำใหม่" }));
    expect(screen.getByText("ข้อ 1 / 16")).toBeInTheDocument();
    await fillIn(all[0]);
    await confirm(all[0]);
    expect(fake.current.sent.at(-1)!.sessionId).not.toBe(firstSession);
  });
});
