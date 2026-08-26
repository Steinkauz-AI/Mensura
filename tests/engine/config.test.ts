import { describe, expect, it } from "vitest";
import {
  buildGrainPathSkipper,
  parseMensuraConfig,
  pathMatchesRule,
} from "../../src/core/config/index.js";

describe("parseMensuraConfig", () => {
  it("treats missing skip lists as empty and fills catalog defaults", () => {
    const config = parseMensuraConfig({}, ".mensura/config.json");
    expect(config.skipDirectories).toEqual([]);
    expect(config.skipPaths).toEqual([]);
    expect(config.metrics["cyclomatic-complexity"]).toEqual({
      threshold: 20,
      bands: {
        cuts: [11, 21, 51],
        labels: ["1-10", "11-20", "21-50", "51+"],
      },
    });
    expect(config.metrics["test-coverage"]?.threshold).toBe(50);
  });

  it("reads skipDirectories", () => {
    expect(
      parseMensuraConfig(
        { skipDirectories: ["_generated", "generated"] },
        ".mensura/config.json",
      ),
    ).toMatchObject({ skipDirectories: ["_generated", "generated"], skipPaths: [] });
  });

  it("rejects a non-object and a bad skip list", () => {
    expect(() => parseMensuraConfig([], "cfg")).toThrow(/JSON object/);
    expect(() =>
      parseMensuraConfig({ skipDirectories: [""] }, "cfg"),
    ).toThrow(/non-empty directory names/);
    expect(() =>
      parseMensuraConfig({ skipDirectories: "not-a-list" }, "cfg"),
    ).toThrow(/non-empty directory names/);
  });

  it("reads skipPaths as all-grains rules", () => {
    expect(
      parseMensuraConfig({ skipPaths: ["packages/alpha"] }, ".mensura/config.json"),
    ).toMatchObject({
      skipDirectories: [],
      skipPaths: [{ path: "packages/alpha", grains: "all" }],
    });
  });

  it("reads grain-scoped skipPaths objects", () => {
    expect(
      parseMensuraConfig(
        {
          skipPaths: [
            { path: "packages/beta", grains: ["function"] },
            { path: "gen", grains: ["function", "structure"] },
          ],
        },
        ".mensura/config.json",
      ),
    ).toMatchObject({
      skipDirectories: [],
      skipPaths: [
        { path: "packages/beta", grains: ["function"] },
        { path: "gen", grains: ["function", "structure"] },
      ],
    });
  });

  it("normalizes separators, leading ./, and a trailing /** or /", () => {
    const { skipPaths } = parseMensuraConfig(
      {
        skipPaths: [
          ".\\packages\\alpha\\",
          "./packages/beta/**",
          "gen/",
          "packages/alpha/**//",
        ],
      },
      "cfg",
    );
    expect(skipPaths.map((rule) => rule.path)).toEqual([
      "packages/alpha",
      "packages/beta",
      "gen",
      "packages/alpha",
    ]);
  });

  it("rejects malformed skipPaths entries", () => {
    expect(() =>
      parseMensuraConfig({ skipPaths: "packages/alpha" }, "cfg"),
    ).toThrow(/skipPaths must be an array/);
    expect(() => parseMensuraConfig({ skipPaths: [3] }, "cfg")).toThrow(
      /path string or an object/,
    );
    expect(() =>
      parseMensuraConfig({ skipPaths: [{ grains: ["function"] }] }, "cfg"),
    ).toThrow(/path string or an object/);
    expect(() => parseMensuraConfig({ skipPaths: [""] }, "cfg")).toThrow(
      /non-empty paths/,
    );
    expect(() => parseMensuraConfig({ skipPaths: ["/"] }, "cfg")).toThrow(
      /non-empty paths/,
    );
    expect(() =>
      parseMensuraConfig({ skipPaths: ["src/*/generated.ts"] }, "cfg"),
    ).toThrow(/trailing \/\*\*/);
    expect(() =>
      parseMensuraConfig(
        { skipPaths: [{ path: "p", grains: ["metrics"] }] },
        "cfg",
      ),
    ).toThrow(/"function" \| "structure"/);
    expect(() =>
      parseMensuraConfig({ skipPaths: [{ path: "p", grains: [] }] }, "cfg"),
    ).toThrow(/non-empty array/);
  });

  it("overrides a metric threshold and keeps default bands", () => {
    const config = parseMensuraConfig(
      { metrics: { "cyclomatic-complexity": { threshold: 10 } } },
      "cfg",
    );
    expect(config.metrics["cyclomatic-complexity"]).toEqual({
      threshold: 10,
      bands: {
        cuts: [11, 21, 51],
        labels: ["1-10", "11-20", "21-50", "51+"],
      },
    });
  });

  it("overrides band cuts and derives labels when labels are omitted", () => {
    const config = parseMensuraConfig(
      { metrics: { "cyclomatic-complexity": { bands: [5, 10, 20] } } },
      "cfg",
    );
    expect(config.metrics["cyclomatic-complexity"]?.bands).toEqual({
      cuts: [5, 10, 20],
      labels: ["0-4", "5-9", "10-19", "20+"],
    });
  });

  it("rejects unknown metrics and malformed band cuts", () => {
    expect(() =>
      parseMensuraConfig({ metrics: { "not-a-metric": { threshold: 1 } } }, "cfg"),
    ).toThrow(/unknown metric/);
    expect(() =>
      parseMensuraConfig(
        { metrics: { "cyclomatic-complexity": { bands: [20, 10, 5] } } },
        "cfg",
      ),
    ).toThrow(/strictly ascending/);
    expect(() =>
      parseMensuraConfig(
        { metrics: { "test-coverage": { bands: { cuts: [20, 50, 80] } } } },
        "cfg",
      ),
    ).toThrow(/strictly descending/);
  });
});

describe("pathMatchesRule", () => {
  it("matches the rule path itself and every descendant", () => {
    expect(pathMatchesRule("packages/alpha", "packages/alpha")).toBe(true);
    expect(pathMatchesRule("packages/alpha/src/widget.tsx", "packages/alpha")).toBe(true);
  });

  it("does not match a different basename elsewhere in the tree", () => {
    expect(pathMatchesRule("lib/alpha/widget.tsx", "packages/alpha")).toBe(false);
  });

  it("respects segment boundaries", () => {
    expect(pathMatchesRule("packages/alpha-x/a.ts", "packages/alpha")).toBe(false);
    expect(pathMatchesRule("packages/alphakit/a.ts", "packages/alpha")).toBe(false);
  });
});

describe("buildGrainPathSkipper", () => {
  const rules = parseMensuraConfig(
    {
      skipPaths: [
        "vendored",
        { path: "packages/alpha", grains: ["function"] },
      ],
    },
    "cfg",
  ).skipPaths;

  it("excludes all-grains rules for every grain", () => {
    const skip = buildGrainPathSkipper(rules, "structure");
    expect(skip("vendored/lib/x.ts")).toBe(true);
  });

  it("excludes grain-scoped rules only for their listed grains", () => {
    const fn = buildGrainPathSkipper(rules, "function");
    const structure = buildGrainPathSkipper(rules, "structure");
    expect(fn("packages/alpha/src/a.ts")).toBe(true);
    expect(structure("packages/alpha/src/a.ts")).toBe(false);
  });

  it("returns a never-matching predicate when no rule applies to the grain", () => {
    const skip = buildGrainPathSkipper(
      [{ path: "a", grains: ["function"] }],
      "structure",
    );
    expect(skip("a/deep/file.ts")).toBe(false);
  });
});
