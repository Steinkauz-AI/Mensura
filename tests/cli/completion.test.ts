import { describe, expect, it } from "vitest";
import { ensureBuiltinMetrics, listMetrics } from "../../src/index.js";
import { completionScript } from "../../src/cli/completion.js";

await ensureBuiltinMetrics();

const COMMANDS = ["list", "run", "snapshot", "completion"];
const METRIC_IDS = listMetrics().map((metric) => metric.id);
const REFS = ["latest", "previous"];
const SHELLS = ["bash", "zsh", "fish"] as const;

function quotedLists(script: string): string[][] {
  return [...script.matchAll(/"([^"]*)"/g)]
    .map((match) => match[1]!)
    .filter((text) => !text.includes("$") && !text.includes("("))
    .map((text) => text.trim().split(/\s+/));
}

function sameWords(list: string[], expected: string[]): boolean {
  return (
    list.length === expected.length &&
    [...list].sort().join("\u0000") === [...expected].sort().join("\u0000")
  );
}

function offersWordList(script: string, expected: string[]): boolean {
  return quotedLists(script).some((list) => sameWords(list, expected));
}

function zshValues(script: string, kind: string): string[] {
  const match = script.match(new RegExp(`_values '${kind}' ([^;\\n]+)`));
  return match ? match[1]!.trim().split(/\s+/) : [];
}

function fishSubcommands(script: string): string[] {
  return [...script.matchAll(/-n "__fish_use_subcommand" -a "([^"]+)"/g)].map(
    (match) => match[1]!,
  );
}

describe("completionScript bash", () => {
  const script = completionScript("bash");

  it("registers a _mensura function hooked to the mensura command", () => {
    expect(script).toContain("_mensura() {");
    expect(script.trimEnd().endsWith("complete -F _mensura mensura")).toBe(true);
  });

  it("offers every top-level command at the first word", () => {
    expect(offersWordList(script, COMMANDS)).toBe(true);
  });

  it("offers every registered metric id as the run argument", () => {
    expect(offersWordList(script, METRIC_IDS)).toBe(true);
    expect(script).toMatch(/run\) COMPREPLY=\( \$\(compgen -W "/);
  });

  it("completes snapshot refs after ref flags like --baseline and --current", () => {
    expect(script).toMatch(
      /--baseline(?:\|--current)+\) COMPREPLY=\( \$\(compgen -W "latest previous" -- "\$cur"\) \); return ;;/,
    );
  });

  it("falls back to file completion for path flags like --file", () => {
    expect(script).toMatch(
      /--file(?:\|--file)*\) COMPREPLY=\( \$\(compgen -f -- "\$cur"\) \); return ;;/,
    );
  });

  it("suggests nothing for count flags like --top and --min", () => {
    expect(script).toMatch(/--top(?:\|--[\w-]+)*\) return ;;/);
    expect(script).toMatch(/--min(?:\|--[\w-]+)*\) return ;;/);
  });

  it("offers the supported shells for the completion command", () => {
    expect(script).toContain('completion) COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )');
  });

  it("offers the root flags -i and -h before the first word", () => {
    expect(script).toContain("-i --interactive -h --help");
  });
});

describe("completionScript zsh", () => {
  const script = completionScript("zsh");

  it("carries the #compdef header and words-based position markers", () => {
    expect(script.startsWith("#compdef mensura\n")).toBe(true);
    expect(script).toContain("cur=${words[CURRENT]}");
  });

  it("offers every top-level command at the first word", () => {
    expect(sameWords(zshValues(script, "command"), COMMANDS)).toBe(true);
  });

  it("offers every registered metric id as the run argument", () => {
    expect(zshValues(script, "metric").length).toBeGreaterThan(0);
    expect(sameWords(zshValues(script, "metric"), METRIC_IDS)).toBe(true);
  });

  it("completes refs after ref flags, files after path flags, and nothing for count flags", () => {
    expect(script).toMatch(/--baseline(?:\|--current)+\) _values 'ref' latest previous; return ;;/);
    expect(script).toMatch(/--file(?:\|--file)*\) _files; return ;;/);
    expect(script).toMatch(/--top(?:\|--[\w-]+)*\) return ;;/);
  });

  it("offers snapshot subcommands, the supported shells, and root flags", () => {
    expect(sameWords(zshValues(script, "subcommand"), ["show", "diff"])).toBe(true);
    expect(sameWords(zshValues(script, "shell"), [...SHELLS])).toBe(true);
    expect(script).toContain("_values 'flag' -i --interactive -h --help");
  });
});

describe("completionScript fish", () => {
  const script = completionScript("fish");

  it("registers one subcommand completion per top-level command", () => {
    expect(script.startsWith("complete -c mensura -f\n")).toBe(true);
    expect([...fishSubcommands(script)].sort()).toEqual([...COMMANDS].sort());
  });

  it("offers metric ids under run, shells under completion, and directories for run's root argument", () => {
    expect(offersWordList(script, METRIC_IDS)).toBe(true);
    expect(offersWordList(script, [...SHELLS])).toBe(true);
    expect(script).toContain('-a "(__fish_complete_directories)"');
  });

  it("offers refs on ref flags and plain long flags without values", () => {
    expect(script).toMatch(/-l baseline -r -a "latest previous"/);
    expect(script).toMatch(/-l no-save\n/);
  });
});

describe("completionScript consistency across shells", () => {
  function offersCommands(shell: (typeof SHELLS)[number]): boolean {
    const script = completionScript(shell);
    if (shell === "zsh") return sameWords(zshValues(script, "command"), COMMANDS);
    if (shell === "fish") {
      return sameWords(fishSubcommands(script), COMMANDS);
    }
    return offersWordList(script, COMMANDS);
  }

  function offersMetrics(shell: (typeof SHELLS)[number]): boolean {
    const script = completionScript(shell);
    if (shell === "zsh") return sameWords(zshValues(script, "metric"), METRIC_IDS);
    return offersWordList(script, METRIC_IDS);
  }

  it("offers the identical top-level command set in every shell", () => {
    for (const shell of SHELLS) {
      expect(offersCommands(shell), shell).toBe(true);
      expect(completionScript(shell), shell).not.toContain('"help"');
    }
  });

  it("offers every registered metric id in every shell", () => {
    for (const shell of SHELLS) {
      expect(offersMetrics(shell), shell).toBe(true);
    }
  });

  it("offers both snapshot refs in every shell", () => {
    expect(offersWordList(completionScript("bash"), REFS)).toBe(true);
    expect(sameWords(zshValues(completionScript("zsh"), "ref"), REFS)).toBe(true);
    expect(offersWordList(completionScript("fish"), REFS)).toBe(true);
  });

  it("throws when no metrics are registered", async () => {
    const { clearMetrics } = await import("../../src/index.js");
    clearMetrics();
    expect(() => completionScript("bash")).toThrow(
      /no metrics registered.*ensureBuiltinMetrics/i,
    );
    await ensureBuiltinMetrics();
  });
});
