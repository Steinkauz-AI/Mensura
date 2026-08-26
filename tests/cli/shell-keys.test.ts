import { describe, expect, it } from "vitest";
import { mapKey } from "../../src/cli/shell/keys.js";

describe("mapKey", () => {
  it("maps escape to quit", () => {
    expect(mapKey("", { upArrow: false, downArrow: false, return: false, escape: true })).toBe(
      "quit",
    );
  });

  it("maps q input to quit", () => {
    expect(mapKey("q", { upArrow: false, downArrow: false, return: false, escape: false })).toBe(
      "quit",
    );
  });

  it("maps up arrow to up", () => {
    expect(mapKey("", { upArrow: true, downArrow: false, return: false, escape: false })).toBe(
      "up",
    );
  });

  it("maps down arrow to down", () => {
    expect(mapKey("", { upArrow: false, downArrow: true, return: false, escape: false })).toBe(
      "down",
    );
  });

  it("maps return to enter", () => {
    expect(mapKey("", { upArrow: false, downArrow: false, return: true, escape: false })).toBe(
      "enter",
    );
  });

  it("maps tab key and tab input to tab", () => {
    expect(
      mapKey("", { upArrow: false, downArrow: false, return: false, escape: false, tab: true }),
    ).toBe("tab");
    expect(mapKey("\t", { upArrow: false, downArrow: false, return: false, escape: false })).toBe(
      "tab",
    );
  });

  it("maps space and letter shortcuts", () => {
    const base = { upArrow: false, downArrow: false, return: false, escape: false };
    expect(mapKey(" ", base)).toBe("space");
    expect(mapKey("a", base)).toBe("a");
    expect(mapKey("o", base)).toBe("o");
    expect(mapKey("d", base)).toBe("d");
  });

  it("returns null for unrecognized input", () => {
    expect(mapKey("x", { upArrow: false, downArrow: false, return: false, escape: false })).toBe(
      null,
    );
  });
});
