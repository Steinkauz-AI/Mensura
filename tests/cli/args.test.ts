import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { parseMensuraArgs } from "../../src/cli/args.js";

const cwd = resolve("/tmp", "factory");

describe("parseMensuraArgs", () => {
  it("prints help for a bare invocation, same text as --help", () => {
    const bare = parseMensuraArgs([], cwd);
    const help = parseMensuraArgs(["--help"], cwd);
    expect(bare).toMatchObject({ name: "help" });
    expect(help).toMatchObject({ name: "help" });
    if (bare.name !== "help" || help.name !== "help") return;
    expect(bare.text).toBe(help.text);
    expect(bare.text).toContain("mensura -i");
  });

  it("parses list, help, and interactive", () => {
    expect(parseMensuraArgs(["list"], cwd)).toEqual({ name: "list" });
    expect(() => parseMensuraArgs(["list", "--json"], cwd)).toThrow(/Unknown flag "--json"/);
    expect(parseMensuraArgs(["--help"], cwd)).toMatchObject({ name: "help" });
    expect(parseMensuraArgs(["-h"], cwd)).toMatchObject({ name: "help" });
    expect(parseMensuraArgs(["-i"], cwd)).toEqual({ name: "interactive" });
    expect(parseMensuraArgs(["--interactive"], cwd)).toEqual({ name: "interactive" });
  });

  it("rejects interactive combined with extra arguments", () => {
    expect(() => parseMensuraArgs(["-i", "--json"], cwd)).toThrow(
      /does not accept a command/,
    );
    expect(() => parseMensuraArgs(["-i", "list"], cwd)).toThrow(
      /does not accept a command/,
    );
    expect(() => parseMensuraArgs(["--interactive", "run", "cyclomatic-complexity"], cwd)).toThrow(
      /does not accept a command/,
    );
  });

  it("parses run with id, root, and flags", () => {
    const command = parseMensuraArgs(
      ["run", "cyclomatic-complexity", "src/repo", "--top", "5", "--min", "11", "--file", "src/a.ts", "--no-save"],
      cwd,
    );
    expect(command).toEqual({
      name: "run",
      metric: "cyclomatic-complexity",
      root: resolve(cwd, "src/repo"),
      top: 5,
      min: 11,
      file: "src/a.ts",
      save: false,
      check: false,
    });
  });

  it("parses each registered metric id on run", () => {
    for (const id of [
      "cognitive-complexity",
      "halstead",
      "nesting-depth",
      "maintainability-index",
      "test-coverage",
      "crap",
    ]) {
      expect(parseMensuraArgs(["run", id, "--no-save"], cwd)).toMatchObject({
        name: "run",
        metric: id,
        root: cwd,
        save: false,
      });
    }
  });

  it("requires an explicit metric id; a path in the id slot is an unknown metric", () => {
    expect(() => parseMensuraArgs(["run"], cwd)).toThrow(/Specify a metric id/);
    expect(() => parseMensuraArgs(["run", "some/checkout"], cwd)).toThrow(
      /Unknown metric "some\/checkout"/,
    );
    expect(() => parseMensuraArgs(["run", "--check"], cwd)).toThrow(/Specify a metric id/);
    expect(() => parseMensuraArgs(["snapshot", "diff"], cwd)).toThrow(/Specify a metric id/);
    expect(() => parseMensuraArgs(["snapshot", "show"], cwd)).toThrow(
      /needs a metric id and a snapshot ref/,
    );
    expect(() => parseMensuraArgs(["snapshot", "show", "latest"], cwd)).toThrow(
      /Unknown metric "latest"/,
    );
  });

  it("rejects an unknown metric in the id slot listing the available ones", () => {
    expect(() => parseMensuraArgs(["run", "nope", "somewhere"], cwd)).toThrow(
      /Unknown metric "nope". Available: cyclomatic-complexity, cognitive-complexity, halstead, nesting-depth, maintainability-index, test-coverage, crap, cycles, coupling, encapsulation, propagation-cost/,
    );
  });

  it("rejects unknown commands and flags", () => {
    expect(() => parseMensuraArgs(["nope"], cwd)).toThrow(/Unknown command "nope"/);
    expect(() => parseMensuraArgs(["run", "--wat"], cwd)).toThrow(/Unknown flag "--wat"/);
  });

  it("rejects legacy aliases", () => {
    expect(() => parseMensuraArgs(["metric", "halstead"], cwd)).toThrow(/Unknown command "metric"/);
    expect(() => parseMensuraArgs(["check", "cyclomatic-complexity"], cwd)).toThrow(
      /Unknown command "check"/,
    );
    expect(() => parseMensuraArgs(["show", "cyclomatic-complexity", "latest"], cwd)).toThrow(
      /Unknown command "show"/,
    );
    expect(() => parseMensuraArgs(["diff", "cyclomatic-complexity"], cwd)).toThrow(
      /Unknown command "diff"/,
    );
  });

  it("requires values for flags that take one", () => {
    expect(() => parseMensuraArgs(["run", "--top"], cwd)).toThrow(/needs a value/);
    expect(() => parseMensuraArgs(["run", "--top", "abc"], cwd)).toThrow(
      /non-negative integer/,
    );
  });

  it("parses snapshot diff refs with an explicit id", () => {
    expect(parseMensuraArgs(["snapshot", "diff", "cyclomatic-complexity"], cwd)).toEqual({
      name: "diff",
      metric: "cyclomatic-complexity",
      baseline: "previous",
      current: "latest",
    });
    expect(
      parseMensuraArgs(
        ["snapshot", "diff", "cognitive-complexity", "--baseline", "x.json", "--current", "y.json"],
        cwd,
      ),
    ).toMatchObject({
      metric: "cognitive-complexity",
      baseline: "x.json",
      current: "y.json",
    });
  });

  it("parses snapshot show with an explicit id and ref", () => {
    expect(
      parseMensuraArgs(["snapshot", "show", "cyclomatic-complexity", "latest"], cwd),
    ).toMatchObject({
      name: "show",
      metric: "cyclomatic-complexity",
      ref: "latest",
    });
    expect(
      parseMensuraArgs(["snapshot", "show", "cognitive-complexity", "previous"], cwd),
    ).toMatchObject({ name: "show", metric: "cognitive-complexity", ref: "previous" });
    expect(() => parseMensuraArgs(["snapshot", "show", "cyclomatic-complexity"], cwd)).toThrow(
      /needs a snapshot ref/,
    );
  });

  it("parses run --check as the same run command with check true", () => {
    expect(parseMensuraArgs(["run", "cyclomatic-complexity", "--check"], cwd)).toEqual({
      name: "run",
      metric: "cyclomatic-complexity",
      root: cwd,
      top: 10,
      min: undefined,
      file: undefined,
      save: true,
      check: true,
    });
  });

  it("rejects --max; --min on --check is a listing slice, not a gate", () => {
    expect(() =>
      parseMensuraArgs(["run", "cyclomatic-complexity", "--check", "--max", "5"], cwd),
    ).toThrow(/Unknown flag "--max"/);
    expect(
      parseMensuraArgs(["run", "maintainability-index", "--check", "--min", "50"], cwd),
    ).toMatchObject({
      name: "run",
      check: true,
      min: 50,
    });
    expect(parseMensuraArgs(["run", "test-coverage", "--check"], cwd)).toMatchObject({
      name: "run",
      check: true,
      min: undefined,
    });
  });

  it("rejects extra positionals", () => {
    expect(() => parseMensuraArgs(["snapshot", "diff", "a", "b"], cwd)).toThrow(/Too many arguments/);
    expect(() => parseMensuraArgs(["list", "extra"], cwd)).toThrow(/Too many arguments/);
  });

  it("parses canonical run", () => {
    const command = parseMensuraArgs(
      ["run", "cyclomatic-complexity", "src/repo", "--top", "5", "--no-save"],
      cwd,
    );
    expect(command).toEqual({
      name: "run",
      metric: "cyclomatic-complexity",
      root: resolve(cwd, "src/repo"),
      top: 5,
      min: undefined,
      file: undefined,
      save: false,
      check: false,
    });
  });

  it("parses run --all as run-all", () => {
    expect(parseMensuraArgs(["run", "--all"], cwd)).toEqual({
      name: "run-all",
      root: cwd,
      check: false,
      save: true,
    });
    expect(parseMensuraArgs(["run", "--all", "src/repo", "--no-save"], cwd)).toEqual({
      name: "run-all",
      root: resolve(cwd, "src/repo"),
      check: false,
      save: false,
    });
    expect(parseMensuraArgs(["run", "--all", "--check"], cwd)).toMatchObject({
      name: "run-all",
      check: true,
      save: true,
    });
  });

  it("rejects a metric id as the run --all positional", () => {
    expect(() => parseMensuraArgs(["run", "--all", "cyclomatic-complexity"], cwd)).toThrow(
      /does not take a metric id/,
    );
  });

  it("rejects extra positionals for run --all", () => {
    expect(() => parseMensuraArgs(["run", "--all", "a", "b"], cwd)).toThrow(/Too many arguments/);
  });

  it("returns subcommand help for run --help and snapshot show --help", () => {
    const runHelp = parseMensuraArgs(["run", "--help"], cwd);
    expect(runHelp).toMatchObject({ name: "help" });
    expect(runHelp.name === "help" && runHelp.text).toContain("run");
    expect(runHelp.name === "help" && runHelp.text).toContain("catalog threshold");
    expect(runHelp.name === "help" && runHelp.text).not.toContain("--max");

    const showHelp = parseMensuraArgs(["snapshot", "show", "--help"], cwd);
    expect(showHelp).toMatchObject({ name: "help" });
    expect(showHelp.name === "help" && showHelp.text).toContain("snapshot show");
  });

  it("root usage is the agent-facing map, not Commander's dump", async () => {
    const { usage } = await import("../../src/cli/args.js");
    const text = usage();
    expect(text).toContain("mensura -i");
    expect(text).toContain("Humans:");
    expect(text).toContain("Agents:");
    expect(text).toContain("--file");
    expect(text).not.toContain("--json");
    expect(text).toContain("list");
    expect(text).toContain("run <id>");
    expect(text).toContain("run --all");
    expect(text).toContain("snapshot show");
    expect(text).toContain("snapshot diff");
    expect(text).toContain("completion");
    expect(text).toContain("Exit codes");
    expect(text).toContain("2 gate failed");
    expect(text).not.toMatch(/^  snapshot\s+Read persisted/m);
    expect(text).not.toContain("mensura metric");
    expect(text).not.toContain("mensura check");
  });

  it("parses completion shells and rejects unknown ones", () => {
    expect(parseMensuraArgs(["completion", "bash"], cwd)).toEqual({
      name: "completion",
      shell: "bash",
    });
    expect(parseMensuraArgs(["completion", "zsh"], cwd)).toEqual({
      name: "completion",
      shell: "zsh",
    });
    expect(parseMensuraArgs(["completion", "fish"], cwd)).toEqual({
      name: "completion",
      shell: "fish",
    });
    expect(() => parseMensuraArgs(["completion", "powershell"], cwd)).toThrow(
      /Unknown shell "powershell"/,
    );
    expect(() => parseMensuraArgs(["completion"], cwd)).toThrow(/Specify a shell/);
  });
});
