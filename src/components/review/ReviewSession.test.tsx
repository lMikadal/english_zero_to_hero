import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { NO_AUDIO_NOTE } from "@/components/audio/AudioControls";
import type { CompleteReviewResponse, ReviewInput, WireCardState } from "@/lib/srs/contract";
import { toWire } from "@/lib/srs/contract";
import { ratingIntervalLabels } from "@/lib/srs/format";
import { RATINGS } from "@/lib/srs/scheduler";
import { ReviewSession, type ServerCardFeed } from "./ReviewSession";
import { NOW, TZ, fakeSink, makeQueue, newState, reviewState, type CardSpec, type FakeSink } from "./test-helpers";

vi.spyOn(window, "scrollTo").mockImplementation(() => {}); // jsdom has no layout

const FIVE: CardSpec[] = [["country", "en_th"], ["friend", "th_en"], ["water", "en_th"], ["hello", "th_en"], ["book", "en_th"]];
const clock = () => NOW;
type Props = Partial<React.ComponentProps<typeof ReviewSession>>;
function show(specs: CardSpec[], props: Props = {}, sink: FakeSink = fakeSink(), audio = fakeAudio()) {
  const queue = props.queue ?? makeQueue(specs);
  const el = (p: Props = {}): ReactElement => <ReviewSession queue={queue} sink={sink} now={clock} {...props} {...p} />;
  return { sink, audio, queue, ...renderWithAudio(el(), audio), again: (p: Props = {}) => el(p) };
}
const reveal = (name: RegExp | string = /^ดู/) => userEvent.click(screen.getByRole("button", { name }));
const rate = (label: string) => userEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
const reviewsSent = (sink: FakeSink) => sink.sendReview.mock.calls.map((c) => c[0] as ReviewInput);
const DONE: CompleteReviewResponse = { sessionDate: "2026-11-27", reviewed: 5, remainingDue: 0, streak: { current: 5, longest: 7 }, countedForStreak: true };

describe("front of an en_th card (screen 23)", () => {
  it("shows the header, the direction, the word with IPA and audio, the hint and only the reveal button", () => {
    show(FIVE);
    expect(screen.getByRole("heading", { level: 1, name: "ทวนคำศัพท์" })).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    expect(screen.getByText("อังกฤษ → ไทย")).toBeInTheDocument();
    expect(screen.getByText("country")).toHaveAttribute("lang", "en");
    expect(screen.getByText("/ˈkʌntri/")).toHaveAttribute("lang", "en-fonipa");
    expect(screen.getByRole("button", { name: "ฟัง" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ฟังช้า 0.75×" })).toBeInTheDocument();
    expect(screen.getByText("นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู")).toBeInTheDocument();
    expect(screen.queryByText("ประเทศ")).toBeNull();
    expect(screen.getByRole("button", { name: "ดูความหมาย" })).toBeInTheDocument();
    expect(screen.queryByText("จำได้แค่ไหน")).toBeNull();
  });

  it("has a progress bar and no main navigation", () => {
    show(FIVE);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(document.querySelector("main")).not.toBeNull();
  });
});

describe("back of an en_th card (screen 24)", () => {
  it("shows the Thai meaning, the example, and the four rating buttons with their intervals", async () => {
    show(FIVE);
    await reveal("ดูความหมาย");
    expect(screen.getByText("ประเทศ")).toBeInTheDocument();
    expect(screen.getByText("Thailand is a big country.")).toHaveAttribute("lang", "en");
    expect(screen.getByText("ไทยเป็นประเทศที่ใหญ่")).not.toHaveAttribute("lang", "en");
    expect(screen.getByText("จำได้แค่ไหน")).toBeInTheDocument();
    const labels = ratingIntervalLabels(reviewState("2026-11-27T03:00:00Z"), NOW, TZ);
    for (const [label, r] of [["จำไม่ได้", 1], ["ยาก", 2], ["ได้", 3], ["ง่าย", 4]] as const) {
      expect(screen.getByRole("button", { name: `${label} ${labels[r]}` })).toBeInTheDocument();
    }
    expect(labels[1]).toBe("10 นาที"); // a Review card that is forgotten comes back in 10 minutes
    expect(screen.queryByRole("button", { name: /^ดู/ })).toBeNull();
  });

  it("moves focus to ได้ after the reveal", async () => {
    show(FIVE);
    await reveal();
    expect(screen.getByRole("button", { name: /^ได้/ })).toHaveFocus();
  });
});

describe("a th_en card", () => {
  const start = async () => {
    const v = show([["friend", "th_en"], ["water", "en_th"]]);
    return v;
  };
  it("front: only the Thai meaning, the th_en hint and 'ดูคำศัพท์'; the answer is nowhere and no audio is used", async () => {
    const { audio, container } = await start();
    expect(screen.getByText("ไทย → อังกฤษ")).toBeInTheDocument();
    expect(screen.getByText("เพื่อน")).toBeInTheDocument();
    expect(screen.getByText("นึกคำภาษาอังกฤษให้ออกก่อน แล้วค่อยเปิดดู")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ดูคำศัพท์" })).toBeInTheDocument();
    for (const secret of ["friend", "frend", "She is my friend"]) expect(container.innerHTML).not.toContain(secret);
    expect(container.querySelector('[lang="en"], [lang="en-fonipa"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /ฟัง/ })).toBeNull();
    expect(screen.queryByText("จำได้แค่ไหน")).toBeNull();
    expect(audio.canPlay).not.toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("back: the English word (lang=en), IPA, ฟัง / ฟังช้า, the example and the four buttons; audio only works now", async () => {
    const { audio } = await start();
    await reveal("ดูคำศัพท์");
    expect(screen.getByText("friend")).toHaveAttribute("lang", "en");
    expect(screen.getByText("/frend/")).toHaveAttribute("lang", "en-fonipa");
    expect(screen.getByText("She is my friend.")).toHaveAttribute("lang", "en");
    expect(screen.getByText("เธอเป็นเพื่อนของฉัน")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2 + 4);
    await userEvent.click(await screen.findByRole("button", { name: "ฟัง" }));
    await waitFor(() => expect(audio.play).toHaveBeenCalledWith("friend", expect.anything()));
    expect(audio.canPlay).toHaveBeenCalledWith("friend");
  });
});

describe("rating", () => {
  it("sends one review {rating, direction, sessionId, id, vocabId, reviewedAt} and goes to the next card", async () => {
    const { sink } = show(FIVE);
    await reveal();
    await rate("ได้");
    expect(sink.sendReview).toHaveBeenCalledTimes(1);
    const [r] = reviewsSent(sink);
    expect(r).toMatchObject({ rating: 3, direction: "en_th", vocabId: "v-country", reviewedAt: NOW.toISOString() });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("เพื่อน")).toBeInTheDocument(); // the th_en card is next
    expect(sink.completeReview).not.toHaveBeenCalled();
  });

  it("every review has its own id; the session id is made once at mount (rerender keeps it)", async () => {
    const v = show(FIVE);
    await reveal();
    await rate("ได้");
    v.rerender(v.again());
    await reveal();
    await rate("ง่าย");
    const [a, b] = reviewsSent(v.sink);
    expect(a.id).not.toBe(b.id);
    expect(a.sessionId).toBe(b.sessionId);
    expect(b.direction).toBe("th_en");
  });

  it("Again brings the card back later in the session and the counter n stays the same", async () => {
    const { sink } = show(FIVE);
    await reveal();
    await rate("จำไม่ได้");
    expect(screen.getByText("1 / 5")).toBeInTheDocument(); // nothing has passed yet
    for (const word of ["เพื่อน", "น้ำ", "สวัสดี"]) {
      expect(screen.getByText(word)).toBeInTheDocument();
      await reveal();
      await rate("ได้");
    }
    expect(screen.getByText("country")).toBeInTheDocument(); // after REQUEUE_GAP = 3 others
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
    expect(reviewsSent(sink).map((r) => r.rating)).toEqual([1, 3, 3, 3]);
  });

  it("announces the result in one always-mounted status region and moves focus to the heading", async () => {
    show(FIVE);
    const status = screen.getByRole("status");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status).toBeEmptyDOMElement();
    await reveal();
    await rate("จำไม่ได้");
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("จำไม่ได้");
    expect(status).toHaveTextContent("10 นาที");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("uses the injected clock (reviewedAt) and not the real one", async () => {
    const other = new Date("2026-11-27T06:30:00Z");
    const { sink } = show(FIVE, { now: () => other });
    await reveal();
    await rate("ได้");
    expect(reviewsSent(sink)[0].reviewedAt).toBe(other.toISOString());
  });
});

describe("one primary action at a time", () => {
  it("front: only the reveal button; back: only the four ratings; never together (whole session)", async () => {
    show(FIVE);
    for (let i = 0; i < 5; i++) {
      const reveals = screen.queryAllByRole("button", { name: /^ดู/ });
      const ratings = screen.queryAllByRole("button", { name: /^(จำไม่ได้|ยาก|ได้|ง่าย)/ });
      expect(reveals).toHaveLength(1);
      expect(ratings).toHaveLength(0);
      await userEvent.click(reveals[0]);
      expect(screen.queryAllByRole("button", { name: /^ดู/ })).toHaveLength(0);
      expect(screen.queryAllByRole("button", { name: /^(จำไม่ได้|ยาก|ได้|ง่าย)/ })).toHaveLength(RATINGS.length);
      await rate("ง่าย");
    }
  });
});

describe("no sound", () => {
  it("shows the note and the card can still be revealed", async () => {
    show(FIVE, {}, fakeSink(), fakeAudio(false));
    expect(await screen.findByText(NO_AUDIO_NOTE)).toBeInTheDocument();
    await reveal();
    expect(screen.getByText("ประเทศ")).toBeInTheDocument();
  });
});

describe("the end of the session", () => {
  const ONE: CardSpec[] = [["country", "en_th"]];
  const finish = async () => { await reveal(); await rate("ง่าย"); };

  it("asks the sink once to complete, with the session id and the clock's times, then shows the done screen", async () => {
    const sink = fakeSink({ status: "done", response: DONE });
    show(ONE, {}, sink);
    await finish();
    await waitFor(() => expect(sink.completeReview).toHaveBeenCalledTimes(1));
    const [c] = sink.completeReview.mock.calls[0];
    expect(c).toEqual({ sessionId: reviewsSent(sink)[0].sessionId, startedAt: NOW.toISOString(), completedAt: NOW.toISOString() });
    expect(await screen.findByRole("heading", { level: 1, name: "ทวนครบแล้ว" })).toBeInTheDocument();
    expect(screen.getByText("ทวน 1 ใบ")).toBeInTheDocument();
    expect(screen.getByText("สตรีค 5 วัน (นานที่สุด 7 วัน)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับไปหน้าฝึกเพิ่ม" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: /^ดู/ })).toBeNull();
  });

  it("counts the buttons pressed", async () => {
    const sink = fakeSink({ status: "done", response: DONE });
    show([["country", "en_th"], ["friend", "th_en"]], {}, sink);
    await reveal(); await rate("ง่าย");
    await reveal(); await rate("ได้");
    expect(await screen.findByText(/จำไม่ได้ 0/)).toHaveTextContent("จำไม่ได้ 0 · ยาก 0 · ได้ 1 · ง่าย 1");
  });

  it("queued: says it will be saved when online, and asks again when the queue drains", async () => {
    const sink = fakeSink({ status: "queued" });
    show(ONE, {}, sink);
    await finish();
    expect(await screen.findByText("จะบันทึกเมื่อออนไลน์")).toBeInTheDocument();
    sink.completeReview.mockResolvedValue({ status: "done", response: DONE });
    sink.setPending(0);
    expect(await screen.findByText("สตรีค 5 วัน (นานที่สุด 7 วัน)")).toBeInTheDocument();
    expect(screen.queryByText("จะบันทึกเมื่อออนไลน์")).toBeNull();
    expect(sink.completeReview.mock.calls.every((c) => c[0].sessionId === sink.completeReview.mock.calls[0][0].sessionId)).toBe(true);
  });

  it("does not count for the streak while cards are still due: says how many and offers to go on", async () => {
    const sink = fakeSink({ status: "done", response: { ...DONE, countedForStreak: false, remainingDue: 2 } });
    show(ONE, {}, sink);
    await finish();
    expect(await screen.findByText("ยังมีคำถึงกำหนดอีก 2 ใบ")).toBeInTheDocument();
    expect(screen.queryByText(/^สตรีค/)).toBeNull();
    expect(screen.getByRole("link", { name: "ทวนต่อ" })).toHaveAttribute("href", "/review");
  });

  it("a rejected or failed completion says so; failed can be retried", async () => {
    const sink = fakeSink({ status: "rejected", code: 400 });
    show(ONE, {}, sink);
    await finish();
    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
  });

  it("retries after an error with the same request", async () => {
    const sink = fakeSink({ status: "done", response: DONE });
    sink.completeReview.mockRejectedValueOnce(new Error("boom"));
    show(ONE, {}, sink);
    await finish();
    await userEvent.click(await screen.findByRole("button", { name: "ลองอีกครั้ง" }));
    expect(await screen.findByText("สตรีค 5 วัน (นานที่สุด 7 วัน)")).toBeInTheDocument();
    expect(sink.completeReview).toHaveBeenCalledTimes(2);
    expect(sink.completeReview.mock.calls[1][0]).toEqual(sink.completeReview.mock.calls[0][0]);
  });
});

describe("nothing is due", () => {
  it("says so, offers the way back, and never talks to the sink", () => {
    const { sink } = show([]);
    expect(screen.getByRole("heading", { level: 1, name: "ยังไม่มีคำที่ถึงกำหนดวันนี้" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับไปหน้าฝึกเพิ่ม" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
    expect(sink.completeReview).not.toHaveBeenCalled();
    expect(sink.sendReview).not.toHaveBeenCalled();
  });
});

describe("the server's card replaces the local one (plan 4.4 item 13)", () => {
  it("a later preview is computed from the card the server answered, not from the local calculation", async () => {
    let push: (r: { id: string; card: WireCardState }) => void = () => {};
    const feed: ServerCardFeed = (cb) => { push = cb; return () => {}; };
    const { sink } = show(FIVE, { serverCards: feed });
    await reveal();
    await rate("จำไม่ได้");
    const sent = reviewsSent(sink)[0];
    // The server's answer: a card that is not what the client calculated (here: a Learning card due in 10 min with other numbers).
    const server = { ...reviewState("2026-11-27T05:10:00Z"), stability: 40, scheduledDays: 12 };
    act(() => push({ id: sent.id, card: toWire(server) }));
    for (const _ of [1, 2, 3]) { await reveal(); await rate("ง่าย"); }
    expect(screen.getByText("country")).toBeInTheDocument(); // the card is back
    await reveal();
    const expected = ratingIntervalLabels({ ...server, due: new Date("2026-11-27T05:10:00Z") }, NOW, TZ);
    expect(screen.getByRole("button", { name: /^ง่าย/ })).toHaveTextContent(expected[4]);
    expect(screen.getByRole("button", { name: /^ได้/ })).toHaveTextContent(expected[3]);
  });

  it("an answer for an unknown review id is ignored", async () => {
    let push: (r: { id: string; card: WireCardState }) => void = () => {};
    show(FIVE, { serverCards: (cb) => { push = cb; return () => {}; } });
    await reveal();
    act(() => push({ id: "00000000-0000-4000-8000-000000000000", card: toWire(newState()) }));
    expect(screen.getByRole("button", { name: /^จำไม่ได้/ })).toBeInTheDocument();
  });

  it("unsubscribes on unmount", () => {
    const off = vi.fn();
    const v = show(FIVE, { serverCards: () => off });
    v.unmount();
    expect(off).toHaveBeenCalled();
  });
});
