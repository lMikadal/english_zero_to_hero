import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MixedText } from "./MixedText";

describe("MixedText", () => {
  it("wraps runs of English words in lang=en and leaves Thai alone", () => {
    const { container } = render(<p><MixedText text="เช่น sit กับ seat (ที่นั่ง) และ Good morning/afternoon" /></p>);
    const en = Array.from(container.querySelectorAll("[lang=en]")).map((n) => n.textContent);
    expect(en).toEqual(["sit", "seat", "Good morning/afternoon"]);
    expect(container.textContent).toBe("เช่น sit กับ seat (ที่นั่ง) และ Good morning/afternoon");
  });

  it("renders plain Thai as it is", () => {
    const { container } = render(<p><MixedText text="สวัสดี" /></p>);
    expect(container.querySelector("[lang]")).toBeNull();
  });
});
