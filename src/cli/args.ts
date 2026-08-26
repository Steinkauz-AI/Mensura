import { resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { getMetric, listMetrics } from "../index.js";
import { DEFAULT_TOP } from "./format/complexity.js";

export const CHECK_DEFAULT_MAX = 20;

export const COMPLETION_SHELLS = ["bash", "zsh", "fish"] as const;
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

export function isCompletionShell(value: string): value is CompletionShell {
  return (COMPLETION_SHELLS as readonly string[]).includes(value);
}

export type MensuraCommand =
  | { name: "list" }
  | { name: "help"; text?: string }
  | { name: "interactive" }
  | {
      name: "run";
      metric: string;
      root: string;
      top: number;
      min: number | undefined;
      file: string | undefined;
      save: boolean;
      check: boolean;
    }
  | {
      name: "diff";
      metric: string;
      baseline: string;
      current: string;
    }
  | {
      name: "show";
      metric: string;
      ref: string;
      top: number;
      min: number | undefined;
      file: string | undefined;
    }
  | {
      name: "run-all";
      root: string;
      check: boolean;
      save: boolean;
    }
  | {
      name: "completion";
      shell: CompletionShell;
    };

type RunOptions = {
  all?: boolean;
  check?: boolean;
  save?: boolean;
  top?: number;
  min?: number;
  file?: string;
};

type ShowOptions = {
  top?: number;
  min?: number;
  file?: string;
};

type DiffOptions = {
  baseline?: string;
  current?: string;
};

type Capture = { command?: MensuraCommand };

const CHECK_HELP = [
  "The overview always includes the configured threshold (defaults: cyclomatic max 20,",
  "cognitive 15, halstead 1000, nesting 3, CRAP 30, cycles 0, coupling 15,",
  "encapsulation 0, propagation-cost 50; maintainability min 20, coverage 50).",
  "--check exits 2 when any unit misses that threshold; stdout is unchanged.",
].join(" ");

function nonNegInt(flag: string) {
  return (value: string): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Flag ${flag} expects a non-negative integer, got "${value}".`);
    }
    return parsed;
  };
}

function configureProgram(
  program: Command,
  output: { writeOut: (text: string) => void } = { writeOut: () => {} },
): void {
  program.exitOverride();
  program.configureOutput({
    writeOut: output.writeOut,
    writeErr: () => {},
  });
  for (const command of program.commands) {
    configureProgram(command, output);
  }
}

function registerList(program: Command, capture: Capture): void {
  program
    .command("list")
    .description("List registered metrics")
    .allowExcessArguments(false)
    .action(() => {
      capture.command = { name: "list" };
    });
}

function registerRun(program: Command, capture: Capture, cwd: string): void {
  program
    .command("run [id] [root]")
    .description("Analyze a checkout, save a snapshot, print the overview")
    .option("--all", "Evaluate every registered metric")
    .option("--check", "Exit 2 when any unit misses the catalog threshold")
    .option("--no-save", "Do not save a snapshot")
    .option("--top <n>", "Units to list", nonNegInt("--top"))
    .option("--min <n>", "Only list units with score >= N", nonNegInt("--min"))
    .option("--file <path>", "Restrict the listing to one checkout-relative file")
    .addHelpText("after", CHECK_HELP)
    .allowExcessArguments(false)
    .action((id: string | undefined, root: string | undefined, options: RunOptions) => {
      if (options.all) {
        capture.command = buildRunAllCommand(id, root, options, cwd);
        return;
      }
      capture.command = buildMetricCommand("run", id, root, options, cwd);
    });
}

function registerSnapshot(program: Command, capture: Capture): void {
  const snapshot = program
    .command("snapshot")
    .description("Read persisted snapshot refs and diff");

  snapshot
    .command("show <id> <ref>")
    .description("View a saved snapshot (latest | previous | file name | timestamp)")
    .option("--top <n>", "Units to list", nonNegInt("--top"))
    .option("--min <n>", "Only list units with score >= N", nonNegInt("--min"))
    .option("--file <path>", "Restrict the listing to one checkout-relative file")
    .allowExcessArguments(false)
    .action((id: string, ref: string, options: ShowOptions) => {
      capture.command = buildShowCommand(id, ref, options);
    });

  snapshot
    .command("diff [id]")
    .description("Diff two saved snapshots (default: previous vs latest)")
    .option("--baseline <ref>", "Baseline ref (default previous)")
    .option("--current <ref>", "Current ref (default latest)")
    .allowExcessArguments(false)
    .action((id: string | undefined, options: DiffOptions) => {
      capture.command = buildDiffCommand(id, options);
    });
}

function registerCompletion(program: Command, capture: Capture): void {
  program
    .command("completion [shell]")
    .description("Print a shell completion script (bash, zsh, or fish)")
    .allowExcessArguments(false)
    .action((shell: string | undefined) => {
      capture.command = buildCompletionCommand(shell);
    });
}

function createProgram(cwd: string, capture: Capture): Command {
  const program = new Command()
    .name("mensura")
    .description("Mensura metrics CLI")
    .allowExcessArguments(false);
  registerList(program, capture);
  registerRun(program, capture, cwd);
  registerSnapshot(program, capture);
  registerCompletion(program, capture);
  configureProgram(program);
  return program;
}

const ROOT_USAGE = `\
Usage: mensura [options] [command]
       mensura -i

Mensura metrics CLI.

  Humans:  mensura -i
  Agents:  mensura <command>            # never waits for input

Commands:
  list                         List registered metrics and status
  run <id> [root]              Analyze a checkout, save a snapshot, print the overview
  run --all [root]             Every registered metric; one summary row each
  run <id> --check [root]      Same overview; exit 2 if the catalog threshold is missed
  snapshot show <id> <ref>     View a saved snapshot (latest | previous | file | timestamp)
  snapshot diff <id>           Diff two refs (default: previous vs latest)
  completion <shell>           Print a completion script (bash | zsh | fish)

Options:
  -i, --interactive            Interactive View/Run shell (requires a TTY)
  -h, --help                   Show this help

  mensura list
  mensura run --all
  mensura run cyclomatic-complexity --file src/cli.ts

run saves a snapshot unless --no-save. Drill down with --top / --min / --file; the full report is the snapshot on disk. The overview always includes the catalog threshold. Piped and non-interactive TTY share the same commands.

Exit codes: 0 success (including help); 1 usage or runtime; 2 gate failed (run --check / run --all --check).`;

export function usage(): string {
  return ROOT_USAGE;
}


export function mensuraProgram(): Command {
  return createProgram(".", {});
}

function isHelpDisplayed(err: unknown): err is CommanderError {
  return (
    err instanceof CommanderError &&
    (err.code === "commander.help" || err.code === "commander.helpDisplayed")
  );
}

export function parseMensuraArgs(argv: string[], cwd: string): MensuraCommand {
  if (argv.length === 0 || isRootHelp(argv)) {
    return { name: "help", text: usage() };
  }
  const interactive = peelInteractive(argv);
  if (interactive.wanted) {
    return parseInteractive(interactive.rest);
  }

  const capture: Capture = {};
  let helpText = "";
  const program = createProgram(cwd, capture);
  configureProgram(program, { writeOut: (text) => (helpText += text) });

  try {
    program.parse(argv, { from: "user" });
  } catch (err) {
    if (isHelpDisplayed(err)) {
      return { name: "help", text: helpText.trimEnd() || usage() };
    }
    throw mapCommanderError(err);
  }

  if (!capture.command) {
    throw new Error(`Unknown command "${argv[0]!}".\n\n${usage()}`);
  }
  return capture.command;
}

function isRootHelp(argv: string[]): boolean {
  if (argv.length !== 1) return false;
  const arg = argv[0]!;
  return arg === "-h" || arg === "--help" || arg === "help";
}

const INTERACTIVE_FLAGS = new Set(["-i", "--interactive"]);

function peelInteractive(argv: string[]): { wanted: boolean; rest: string[] } {
  const rest = argv.filter((arg) => !INTERACTIVE_FLAGS.has(arg));
  return { wanted: rest.length !== argv.length, rest };
}

function parseInteractive(rest: string[]): MensuraCommand {
  if (rest.length === 0) {
    return { name: "interactive" };
  }
  if (rest.every((arg) => arg === "-h" || arg === "--help")) {
    return { name: "help", text: usage() };
  }
  throw new Error("Interactive mode does not accept a command. Use mensura -i alone.");
}

function matchGroup(message: string, pattern: RegExp, fallback: string): string {
  return message.match(pattern)?.[1] ?? fallback;
}

function unknownCommandError(err: CommanderError): Error {
  const unknown = matchGroup(err.message, /unknown command '([^']+)'/, "command");
  return new Error(`Unknown command "${unknown}".\n\n${usage()}`);
}

function excessArgumentsError(err: CommanderError): Error {
  const command = matchGroup(err.message, /error: too many arguments for '([^']+)'/, "command");
  return new Error(`Too many arguments for "${command}".\n\n${usage()}`);
}

function missingArgumentError(err: CommanderError): Error | undefined {
  const name = matchGroup(err.message, /error: missing required argument '([^']+)'/, "");
  if (name === "ref") {
    return new Error(
      `"snapshot show" needs a snapshot ref (latest | previous | file name | timestamp).\n\n${usage()}`,
    );
  }
  if (name === "id") {
    return new Error(
      `"snapshot show" needs a metric id and a snapshot ref (latest | previous | file name | timestamp).\n\n${usage()}`,
    );
  }
  return undefined;
}

function unknownOptionError(err: CommanderError): Error {
  const flag = matchGroup(err.message, /error: unknown option '([^']+)'/, "option");
  return new Error(`Unknown flag "${flag}".\n\n${usage()}`);
}

function optionMissingArgumentError(err: CommanderError): Error {
  const flag = matchGroup(err.message, /error: option '([^']+)' argument missing/, "flag");
  return new Error(`Flag ${flag} needs a value.\n\n${usage()}`);
}

const COMMANDER_ERROR_MAP: Record<string, (err: CommanderError) => Error | undefined> = {
  "commander.unknownCommand": unknownCommandError,
  "commander.excessArguments": excessArgumentsError,
  "commander.missingArgument": missingArgumentError,
  "commander.unknownOption": unknownOptionError,
  "commander.optionMissingArgument": optionMissingArgumentError,
};

function mapCommanderError(err: unknown): Error {
  if (err instanceof CommanderError) {
    const mapped = COMMANDER_ERROR_MAP[err.code]?.(err);
    if (mapped) return mapped;
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function availableMetrics(): string {
  return listMetrics().map((metric) => metric.id).join(", ");
}


function metricId(id: string | undefined): string {
  if (id === undefined) {
    throw new Error(`Specify a metric id. Available: ${availableMetrics()}`);
  }
  if (!getMetric(id)) {
    throw new Error(`Unknown metric "${id}". Available: ${availableMetrics()}`);
  }
  return id;
}

function rejectExtra(command: string, positionals: string[], allowed: number): void {
  if (positionals.length > allowed) {
    throw new Error(`Too many arguments for "${command}".\n\n${usage()}`);
  }
}


function idAndRoot(
  command: string,
  positionals: string[],
  cwd: string,
): { metric: string; root: string } {
  rejectExtra(command, positionals, 2);
  const [id, root] = positionals;
  return { metric: metricId(id), root: resolve(cwd, root ?? ".") };
}

function positionalsFrom(id: string | undefined, root: string | undefined): string[] {
  const positionals: string[] = [];
  if (id !== undefined) positionals.push(id);
  if (root !== undefined) positionals.push(root);
  return positionals;
}

function buildRunAllCommand(
  id: string | undefined,
  root: string | undefined,
  options: RunOptions,
  cwd: string,
): Extract<MensuraCommand, { name: "run-all" }> {
  rejectExtra("run --all", positionalsFrom(id, root), 1);
  const positional = root ?? id;
  if (positional !== undefined && getMetric(positional)) {
    throw new Error(
      `"run --all" does not take a metric id. Pass a checkout path or omit it.\n\n${usage()}`,
    );
  }
  const resolvedRoot = positional !== undefined ? resolve(cwd, positional) : resolve(cwd, ".");
  return {
    name: "run-all",
    root: resolvedRoot,
    check: options.check ?? false,
    save: options.save ?? true,
  };
}

function buildMetricCommand(
  command: string,
  id: string | undefined,
  root: string | undefined,
  options: RunOptions,
  cwd: string,
): Extract<MensuraCommand, { name: "run" }> {
  const { metric, root: resolvedRoot } = idAndRoot(command, positionalsFrom(id, root), cwd);
  return {
    name: "run",
    metric,
    root: resolvedRoot,
    top: options.top ?? DEFAULT_TOP,
    min: options.min,
    file: options.file,
    save: options.save ?? true,
    check: options.check ?? false,
  };
}

function buildDiffCommand(
  id: string | undefined,
  options: DiffOptions,
): Extract<MensuraCommand, { name: "diff" }> {
  const positionals = id !== undefined ? [id] : [];
  rejectExtra("diff", positionals, 1);
  return {
    name: "diff",
    metric: metricId(positionals[0]),
    baseline: options.baseline ?? "previous",
    current: options.current ?? "latest",
  };
}

function buildCompletionCommand(
  shell: string | undefined,
): Extract<MensuraCommand, { name: "completion" }> {
  if (shell === undefined) {
    throw new Error(`Specify a shell. Supported: bash, zsh, fish.\n\n${usage()}`);
  }
  if (!isCompletionShell(shell)) {
    throw new Error(
      `Unknown shell "${shell}". Supported: bash, zsh, fish.\n\n${usage()}`,
    );
  }
  return { name: "completion", shell };
}

function buildShowCommand(
  id: string,
  ref: string,
  options: ShowOptions,
): Extract<MensuraCommand, { name: "show" }> {
  rejectExtra("show", [], 0);
  return {
    name: "show",
    metric: metricId(id),
    ref,
    top: options.top ?? DEFAULT_TOP,
    min: options.min,
    file: options.file,
  };
}
