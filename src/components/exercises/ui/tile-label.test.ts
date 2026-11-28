import { describe, expect, it } from "vitest";
import { tileLabel } from "./tile-label";

describe("tileLabel", () => {
  it("keeps a day or month capitalised when it stands in the middle of the answer", () => {
    expect(tileLabel("Saturday", ["I play football on Saturday"])).toBe("Saturday");
    expect(tileLabel("May", ["My birthday is in May"])).toBe("May");
  });
  it("shows a day in lower case when it only starts the sentence, and keeps I", () => {
    expect(tileLabel("Monday", ["Monday is a school day"])).toBe("monday");
    expect(tileLabel("I", ["I play football"])).toBe("I");
  });
});
