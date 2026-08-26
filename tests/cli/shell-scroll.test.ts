import { describe, expect, it } from "vitest";
import { scrollAction } from "../../src/cli/shell/scroll.js";

const none = {
  escape: false,
  upArrow: false,
  downArrow: false,
  pageUp: false,
  pageDown: false,
  home: false,
  end: false,
};

describe("scrollAction", () => {
  it("quits on escape or q", () => {
    expect(scrollAction("", { ...none, escape: true }, 0, 10, 5)).toEqual({ type: "quit" });
    expect(scrollAction("q", none, 0, 10, 5)).toEqual({ type: "quit" });
  });

  it("moves up and down by line", () => {
    expect(scrollAction("", { ...none, upArrow: true }, 3, 10, 5)).toEqual({
      type: "offset",
      next: 2,
    });
    expect(scrollAction("", { ...none, downArrow: true }, 3, 10, 5)).toEqual({
      type: "offset",
      next: 4,
    });
  });

  it("moves by page", () => {
    expect(scrollAction("", { ...none, pageUp: true }, 8, 10, 5)).toEqual({
      type: "offset",
      next: 3,
    });
    expect(scrollAction("", { ...none, pageDown: true }, 3, 10, 5)).toEqual({
      type: "offset",
      next: 8,
    });
  });

  it("jumps to home and end", () => {
    expect(scrollAction("", { ...none, home: true }, 8, 10, 5)).toEqual({
      type: "offset",
      next: 0,
    });
    expect(scrollAction("", { ...none, end: true }, 1, 10, 5)).toEqual({
      type: "offset",
      next: 10,
    });
  });

  it("ignores unrelated keys", () => {
    expect(scrollAction("x", none, 1, 10, 5)).toBeNull();
  });
});
