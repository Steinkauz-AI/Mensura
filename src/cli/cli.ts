import {
  checkoutStatus,
  ensureMensuraConfigFile,
  evaluateAllMetrics,
  evaluateMetric,
  getMetric,
  hashMetricInputs,
  listMetrics,
  loadMensuraConfig,
  loadMensuraConfigOrDefault,
  loadSnapshot,
  type AnyMetric,
  type ComplexityDiff,
  type ComplexityReport,
  type EvaluateAllMetricOutcome,
  type EvaluateMetricResult,
  type MensuraConfig,
  type Snapshot,
} from "../index.js";
import { parseMensuraArgs, usage, type MensuraCommand } from "./args.js";
import { completionScript } from "./completion.js";
import type { InkShellInput } from "./shell.js";
import {
  checkGate,
  formatCheck,
  formatComplexityDiff,
  formatComplexityView,
  formatStatusRollup,
  formatMetricList,
  scaleFor,
  shouldColor,
} from "./format/index.js";
import {
  batchSummary,
  emptySummary,
  formatRunAllDashboard,
  formatThresholdLabel,
  thresholdViolationCount,
  type RunAllRow,
} from "./format/run-all.js";

type Output = { write(text: string): void; isTTY?: boolean };

export type { InkShellInput };

export type RunMensuraCliOptions = {
  
  isTTY?: boolean;
  
  runInkShell?: (input: InkShellInput) => Promise<number>;
};


export async function runMensuraCli(
  argv: string[],
  cwd: string,
  stdout: Output = process.stdout,
  stderr: Output = process.stderr,
  env: NodeJS.ProcessEnv = process.env,
  options: RunMensuraCliOptions = {},
): Promise<number> {
  const isTTY = options.isTTY ?? stdout.isTTY === true;
  let command: MensuraCommand;
  try {
    command = parseMensuraArgs(argv, cwd);
  } catch (err) {
    stderr.write(`${message(err)}\n`);
    return 1;
  }
  if (command.name === "interactive") {
    if (!isTTY) {
      stderr.write(
        "Interactive mode requires a TTY. Drop -i to run a command, or run mensura for help.\n",
      );
      return 1;
    }
    await ensureMensuraConfigFile(cwd);
    const runInk = options.runInkShell ?? (await import("./shell.js")).renderInkShell;
    return runInk({ cwd, stdout, stderr, env });
  }
  try {
    return await executeCommand(command, cwd, stdout, stderr, env);
  } catch (err) {
    stderr.write(`${message(err)}\n`);
    return 1;
  }
}

async function executeCommand(
  command: Exclude<MensuraCommand, { name: "interactive" }>,
  cwd: string,
  stdout: Output,
  stderr: Output,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  if (command.name === "completion") {
    stdout.write(`${completionScript(command.shell)}\n`);
    return 0;
  }
  const root = checkoutRoot(command, cwd);
  await ensureMensuraConfigFile(root);
  if (command.name === "help" || command.name === "list") {
    return runInfo(command, cwd, stdout);
  }
  const config =
    command.name === "show" || command.name === "diff"
      ? await loadMensuraConfigOrDefault(root)
      : await loadMensuraConfig(root);
  return runAnalysis(command, cwd, stdout, stderr, env, config);
}

function checkoutRoot(
  command: Exclude<MensuraCommand, { name: "interactive" }>,
  cwd: string,
): string {
  if (command.name === "run" || command.name === "run-all") return command.root;
  return cwd;
}

async function runInfo(
  command: Extract<MensuraCommand, { name: "help" | "list" }>,
  cwd: string,
  stdout: Output,
): Promise<number> {
  if (command.name === "help") {
    const map = command.text ?? usage();
    stdout.write(`${map}\n${await helpStatusSuffix(cwd)}`);
    return 0;
  }
  const status = await checkoutStatusSafe(cwd);
  if (status === null) {
    stdout.write(
      `${formatMetricList(listMetrics().map((metric) => ({ ...metric, status: "" })))}\nstatus unavailable\n`,
    );
    return 0;
  }
  stdout.write(`${formatMetricList(status.metrics)}\n`);
  return 0;
}

async function helpStatusSuffix(cwd: string): Promise<string> {
  try {
    const status = await checkoutStatus(cwd);
    return `\n${formatStatusRollup(status)}. See mensura list.\n`;
  } catch {
    return "\nstatus unavailable. See mensura list.\n";
  }
}

async function checkoutStatusSafe(cwd: string) {
  try {
    return await checkoutStatus(cwd);
  } catch {
    return null;
  }
}

async function runAnalysis(
  command: Exclude<MensuraCommand, { name: "help" | "list" | "completion" | "interactive" }>,
  cwd: string,
  stdout: Output,
  stderr: Output,
  env: NodeJS.ProcessEnv,
  config: MensuraConfig,
): Promise<number> {
  if (command.name === "run-all") return runAll(command, stdout, stderr, env, config);
  if (command.name === "run") return runMetric(command, stdout, stderr, env, config);
  if (command.name === "diff") return runDiff(command, cwd, stdout, env);
  return runShow(command, cwd, stdout, env, config);
}

async function runMetric(
  command: Extract<MensuraCommand, { name: "run" }>,
  stdout: Output,
  stderr: Output,
  env: NodeJS.ProcessEnv,
  config: MensuraConfig,
): Promise<number> {
  const metric = getMetric(command.metric)!;
  const at = new Date();
  const result = await evaluateMetric<ComplexityReport>(metric, command.root, {
    save: command.save,
    now: () => at,
  });
  writeMetricOutput(command, metric, result, at, stdout, stderr, env, config);
  if (!command.check) return 0;
  const catalog = checkGate(command.metric, config);
  const { violations } = formatCheck(result.report, {
    gate: catalog.gate,
    threshold: catalog.threshold,
    color: false,
    scale: scaleFor(command.metric, config),
    direction: metric.direction,
  });
  return violations.length > 0 ? 2 : 0;
}

function writeMetricOutput(
  command: Extract<MensuraCommand, { name: "run" }>,
  metric: AnyMetric,
  result: EvaluateMetricResult<ComplexityReport>,
  at: Date,
  stdout: Output,
  stderr: Output,
  env: NodeJS.ProcessEnv,
  config: MensuraConfig,
): void {
  const viewedAt = viewedTimestamp(result, at);
  stdout.write(
    `${formatComplexityView(result.report, {
      root: command.root,
      at: viewedAt,
      color: shouldColor(stdout, env),
      title: metric.name,
      metric: command.metric,
      config,
      scale: scaleFor(command.metric, config),
      direction: metric.direction,
      top: command.top,
      min: command.min,
      file: command.file,
    })}\n`,
  );
  const saved = savedPath(command, result);
  if (saved) stderr.write(`${result.reused ? "reused" : "saved"} ${saved}\n`);
  writePiggybackSavedLines(result, stderr);
}

function viewedTimestamp(
  result: EvaluateMetricResult<ComplexityReport>,
  at: Date,
): Date {
  if (result.reused && result.snapshot) {
    return new Date(result.snapshot.snapshot.timestamp);
  }
  return at;
}

function savedPath(
  command: Extract<MensuraCommand, { name: "run" }>,
  result: EvaluateMetricResult<ComplexityReport>,
): string | null {
  if (!command.save) return null;
  return result.snapshot?.path ?? null;
}

function writePiggybackSavedLines(
  result: EvaluateMetricResult<ComplexityReport>,
  stderr: Output,
): void {
  for (const entry of result.piggyback) {
    const path = entry.result.snapshot?.path;
    if (!path) continue;
    stderr.write(`${entry.result.reused ? "reused" : "saved"} ${path}\n`);
  }
}

async function outdatedLine(snapshot: Snapshot, root: string): Promise<string> {
  try {
    const hash = await hashMetricInputs(root);
    if (snapshot.inputsHash === hash) return "";
  } catch {
  }
  return "outdated\n";
}

async function runDiff(
  command: Extract<MensuraCommand, { name: "diff" }>,
  cwd: string,
  stdout: Output,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const store = { root: cwd, metric: command.metric };
  const baseline = await loadSnapshot<ComplexityReport>(store, command.baseline);
  const current = await loadSnapshot<ComplexityReport>(store, command.current);
  const diff = getMetric(command.metric)!.diff(
    baseline.snapshot.report,
    current.snapshot.report,
  ) as ComplexityDiff;
  const color = shouldColor(stdout, env);
  const note =
    (await outdatedLine(baseline.snapshot, store.root)) ||
    (await outdatedLine(current.snapshot, store.root));
  stdout.write(
    `${note}${formatComplexityDiff(diff, {
      color,
      direction: getMetric(command.metric)?.direction,
    })}\n`,
  );
  return 0;
}

async function runShow(
  command: Extract<MensuraCommand, { name: "show" }>,
  cwd: string,
  stdout: Output,
  env: NodeJS.ProcessEnv,
  config: MensuraConfig,
): Promise<number> {
  const store = { root: cwd, metric: command.metric };
  const loaded = await loadSnapshot<ComplexityReport>(store, command.ref);
  const color = shouldColor(stdout, env);
  const note = await outdatedLine(loaded.snapshot, store.root);
  stdout.write(
    `${note}${formatComplexityView(loaded.snapshot.report, {
      root: loaded.snapshot.root,
      at: new Date(loaded.snapshot.timestamp),
      color,
      title: getMetric(command.metric)?.name,
      metric: command.metric,
      config,
      scale: scaleFor(command.metric, config),
      direction: getMetric(command.metric)?.direction,
      top: command.top,
      min: command.min,
      file: command.file,
    })}\n`,
  );
  return 0;
}

async function runAll(
  command: Extract<MensuraCommand, { name: "run-all" }>,
  stdout: Output,
  stderr: Output,
  env: NodeJS.ProcessEnv,
  config: MensuraConfig,
): Promise<number> {
  const at = new Date();
  const outcomes = await evaluateAllMetrics<ComplexityReport>(command.root, {
    save: command.save,
    now: () => at,
  });
  const rows = outcomes.map((outcome) => buildRunAllRow(outcome, config));
  const counts = countRunAllRows(rows);
  writeRunAllSavedLines(command, outcomes, stderr);
  stdout.write(`${formatRunAllDashboard(command.root, rows, counts)}\n`);
  if (!command.check) return 0;
  if (counts.errors > 0) return 1;
  return counts.failed > 0 ? 2 : 0;
}

function buildRunAllRow(
  outcome: EvaluateAllMetricOutcome<ComplexityReport>,
  config: MensuraConfig,
): RunAllRow {
  const threshold = formatThresholdLabel(checkGate(outcome.metric.id, config));
  if ("error" in outcome) {
    return {
      id: outcome.metric.id,
      name: outcome.metric.name,
      status: "error",
      violationCount: 0,
      summary: emptySummary(),
      error: outcome.error.message,
      threshold,
    };
  }
  const report = outcome.result.report;
  const summary = batchSummary(outcome.metric.id, report, config);
  const violationCount = thresholdViolationCount(
    outcome.metric.id,
    report,
    outcome.metric.direction,
    config,
  );
  return {
    id: outcome.metric.id,
    name: outcome.metric.name,
    status: violationCount > 0 ? "fail" : "pass",
    violationCount,
    summary,
    error: null,
    threshold,
  };
}

function countRunAllRows(rows: RunAllRow[]): { passed: number; failed: number; errors: number } {
  let passed = 0;
  let failed = 0;
  let errors = 0;
  for (const row of rows) {
    if (row.status === "error") errors += 1;
    else if (row.status === "fail") failed += 1;
    else passed += 1;
  }
  return { passed, failed, errors };
}

function writeRunAllSavedLines(
  command: Extract<MensuraCommand, { name: "run-all" }>,
  outcomes: EvaluateAllMetricOutcome<ComplexityReport>[],
  stderr: Output,
): void {
  if (!command.save) return;
  for (const outcome of outcomes) {
    if (!("result" in outcome)) continue;
    const path = outcome.result.snapshot?.path;
    if (!path) continue;
    stderr.write(`${outcome.result.reused ? "reused" : "saved"} ${path}\n`);
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
