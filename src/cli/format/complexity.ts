import type {
  ComplexityDiff,
  ComplexityReport,
  ComplexityUnit,
  MensuraConfig,
  MetricStatus,
  FileComplexity,
  MetricDirection,
} from "../../index.js";
import { bandAnsi, checkGate, CYCLOMATIC_SCALE, type BandScale } from "./bands.js";
import { table } from "./table.js";

export type { BandScale } from "./bands.js";
export {
  checkDefaultMax,
  checkDefaultMin,
  checkGate,
  COGNITIVE_SCALE,
  CYCLOMATIC_SCALE,
  HALSTEAD_VOLUME_SCALE,
  MAINTAINABILITY_SCALE,
  COVERAGE_SCALE,
  CRAP_SCALE,
  CYCLES_SCALE,
  COUPLING_SCALE,
  ENCAPSULATION_SCALE,
  PROPAGATION_SCALE,
  NESTING_SCALE,
  scaleFor,
} from "./bands.js";

export const DEFAULT_TOP = 10;
export const CHECK_LIMIT = 20;

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[91m";

function paint(color: boolean, code: string, text: string): string {
  return color ? `${code}${text}${RESET}` : text;
}

export function sortUnitsByHeat(
  units: ComplexityUnit[],
  direction: MetricDirection = "higher-worse",
): ComplexityUnit[] {
  return [...units].sort(
    (a, b) =>
      heatOf(b, direction) - heatOf(a, direction) ||
      a.path.localeCompare(b.path) ||
      a.name.localeCompare(b.name) ||
      a.startLine - b.startLine,
  );
}


function heatOf(unit: ComplexityUnit, direction: MetricDirection): number {
  if (direction === "higher-better") return -unit.complexity;
  return unit.effort ?? unit.complexity;
}

export function sortFilesByHeat(
  files: FileComplexity[],
  direction: MetricDirection = "higher-worse",
): FileComplexity[] {
  return [...files].sort((a, b) => {
    const heat = fileHeat(b, direction) - fileHeat(a, direction);
    if (heat !== 0) return heat;
    if (direction === "higher-better") {
      return fileMean(a) - fileMean(b) || a.path.localeCompare(b.path);
    }
    return b.sumComplexity - a.sumComplexity || a.path.localeCompare(b.path);
  });
}

function fileHeat(file: FileComplexity, direction: MetricDirection): number {
  return direction === "higher-better" ? -file.minComplexity : file.maxComplexity;
}

function fileMean(file: FileComplexity): number {
  return file.functionCount === 0 ? 0 : file.sumComplexity / file.functionCount;
}

function unitsOf(report: ComplexityReport, path: string): ComplexityUnit[] {
  return report.units.filter((unit) => unit.path === path);
}

export type ComplexitySelection = {
  kind: "overview" | "file";
  file?: string;
};

export type ComplexitySummary = {
  files: number;
  functions: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  bands: Record<string, number>;
};

export type SelectedComplexity = {
  selection: ComplexitySelection;
  summary: ComplexitySummary;
  units: ComplexityUnit[];
  files: FileComplexity[];
  unparsed: ComplexityReport["unparsed"];
  omittedUnits: number;
  omittedFiles: number;
  score?: number;
};


export function selectComplexity(
  report: ComplexityReport,
  options: {
    top: number;
    min?: number;
    file?: string;
    scale?: BandScale;
    direction?: MetricDirection;
  },
): SelectedComplexity {
  const scale = options.scale ?? CYCLOMATIC_SCALE;
  const direction = options.direction ?? "higher-worse";
  const min = (unit: ComplexityUnit): boolean =>
    options.min === undefined || unit.complexity >= options.min;
  if (options.file !== undefined) {
    const file = report.files.find((entry) => entry.path === options.file);
    if (!file) throw new Error(`File not found in report: ${options.file}`);
    const filtered = sortUnitsByHeat(unitsOf(report, options.file), direction).filter(min);
    return {
      selection: { kind: "file", file: options.file },
      summary: summaryOf(report, scale),
      units: filtered.slice(0, options.top),
      files: [file],
      unparsed: report.unparsed,
      omittedUnits: Math.max(0, filtered.length - options.top),
      omittedFiles: 0,
      ...(report.score !== undefined ? { score: report.score } : {}),
    };
  }
  const filteredUnits = sortUnitsByHeat(report.units, direction).filter(min);
  const sortedFiles = sortFilesByHeat(report.files, direction);
  return {
    selection: { kind: "overview" },
    summary: summaryOf(report, scale),
    units: filteredUnits.slice(0, options.top),
    files: sortedFiles.slice(0, options.top),
    unparsed: report.unparsed,
    omittedUnits: Math.max(0, filteredUnits.length - options.top),
    omittedFiles: Math.max(0, sortedFiles.length - options.top),
    ...(report.score !== undefined ? { score: report.score } : {}),
  };
}

export function summaryOf(
  report: ComplexityReport,
  scale: BandScale = CYCLOMATIC_SCALE,
): ComplexitySummary {
  const scores = report.units.map((unit) => unit.complexity).sort((a, b) => a - b);
  const bands: Record<string, number> = Object.fromEntries(
    scale.bands.map((band) => [band, 0]),
  );
  for (const score of scores) bands[scale.bandOf(score)]! += 1;
  const total = scores.reduce((sum, n) => sum + n, 0);
  const mid = scores.length / 2;
  return {
    files: report.files.length,
    functions: scores.length,
    min: scores.length > 0 ? scores[0]! : null,
    max: scores.length > 0 ? scores[scores.length - 1]! : null,
    mean: scores.length > 0 ? round2(total / scores.length) : null,
    median:
      scores.length === 0
        ? null
        : scores.length % 2 === 1
          ? scores[Math.floor(mid)]!
          : round2((scores[mid - 1]! + scores[mid]!) / 2),
    bands,
  };
}

export type ComplexityViewOptions = {
  color: boolean;
  title?: string;
  metric?: string;
  config?: MensuraConfig;
  scale?: BandScale;
  direction?: MetricDirection;
  top?: number;
  min?: number;
  file?: string;
};


export function formatComplexityView(
  report: ComplexityReport,
  options: { root: string; at: Date } & ComplexityViewOptions,
): string {
  const scale = options.scale ?? CYCLOMATIC_SCALE;
  const direction = options.direction ?? "higher-worse";
  const paintBand = (score: number, text: string): string =>
    paint(options.color, bandAnsi(scale, scale.bandOf(score)), text);
  const selected = selectComplexity(report, {
    top: options.top ?? DEFAULT_TOP,
    min: options.min,
    file: options.file,
    scale,
    direction,
  });
  const lines: string[] = [options.title ?? "Cyclomatic complexity"];
  lines.push(
    table(
      [
        ["root", options.root],
        ["at", options.at.toISOString()],
        ...(report.score !== undefined ? [["score", String(report.score)]] : []),
      ],
      ["left", "left"],
    ),
  );
  if (report.units.length === 0) {
    lines.push("", "No TypeScript or JavaScript functions found.");
  } else if (selected.selection.kind === "file") {
    const file = selected.files[0]!;
    lines.push("", fileRollupTable(file, direction, paintBand));
    lines.push(...unitTable(selected.units, paintBand));
    lines.push(...omittedLine(selected.omittedUnits));
  } else {
    const summary = selected.summary;
    lines.push(
      "",
      table(
        [
          ["files", "functions", "min", "max", "mean", "median"],
          [
            String(summary.files),
            String(summary.functions),
            summary.min === null ? "-" : paintBand(summary.min, String(summary.min)),
            summary.max === null ? "-" : paintBand(summary.max, String(summary.max)),
            summary.mean === null ? "-" : String(summary.mean),
            summary.median === null ? "-" : String(summary.median),
          ],
        ],
        ["right", "right", "right", "right", "right", "right"],
      ),
      "",
      table(
        [
          ["band", "count"],
          ...scale.bands.map((band) => [
            paint(options.color, bandAnsi(scale, band), band),
            String(summary.bands[band] ?? 0),
          ]),
        ],
        ["left", "right"],
      ),
    );
    lines.push(...unitTable(selected.units, paintBand));
    lines.push(...omittedLine(selected.omittedUnits));
    if (selected.files.length > 0) {
      lines.push("", "Hottest files", hottestFilesTable(selected.files, direction, paintBand));
      lines.push(...omittedLine(selected.omittedFiles));
    }
    if (report.unparsed.length > 0) {
      lines.push(
        "",
        "Unparseable files",
        table(
          [
            ["count", "file"],
            ...report.unparsed.map((file) => [String(file.errorCount), file.path]),
          ],
          ["right", "left"],
        ),
      );
    }
  }
  if (options.metric) {
    const catalog = checkGate(options.metric, options.config);
    const { text } = formatCheck(report, {
      gate: catalog.gate,
      threshold: catalog.threshold,
      color: options.color,
      scale,
      direction,
    });
    lines.push("", text);
  }
  lines.push("", legend(scale, options.color));
  return lines.join("\n");
}

function omittedLine(count: number): string[] {
  return count > 0 ? [`…and ${count} more`] : [];
}

function fileRollupTable(
  file: FileComplexity,
  direction: MetricDirection,
  paintBand: (score: number, text: string) => string,
): string {
  if (direction === "higher-better") {
    const mean = round2(fileMean(file));
    return table(
      [
        ["file", "functions", "min", "mean"],
        [
          file.path,
          String(file.functionCount),
          paintBand(file.minComplexity, String(file.minComplexity)),
          String(mean),
        ],
      ],
      ["left", "right", "right", "right"],
    );
  }
  return table(
    [
      ["file", "functions", "max", "sum"],
      [
        file.path,
        String(file.functionCount),
        paintBand(file.maxComplexity, String(file.maxComplexity)),
        String(file.sumComplexity),
      ],
    ],
    ["left", "right", "right", "right"],
  );
}

function hottestFilesTable(
  files: FileComplexity[],
  direction: MetricDirection,
  paintBand: (score: number, text: string) => string,
): string {
  if (direction === "higher-better") {
    return table(
      [
        ["min", "mean", "fns", "file"],
        ...files.map((file) => [
          paintBand(file.minComplexity, String(file.minComplexity)),
          String(round2(fileMean(file))),
          String(file.functionCount),
          file.path,
        ]),
      ],
      ["right", "right", "right", "left"],
    );
  }
  return table(
    [
      ["max", "sum", "fns", "file"],
      ...files.map((file) => [
        paintBand(file.maxComplexity, String(file.maxComplexity)),
        String(file.sumComplexity),
        String(file.functionCount),
        file.path,
      ]),
    ],
    ["right", "right", "right", "left"],
  );
}

type Align = "left" | "right";
type PaintBand = (score: number, text: string) => string;

type UnitLayout = {
  heading: string;
  header: string[];
  align: readonly Align[];
  row: (unit: ComplexityUnit, paintBand: PaintBand) => string[];
};

function location(unit: ComplexityUnit): string {
  return `${unit.path}:${unit.startLine}`;
}


function unitLayout(units: ComplexityUnit[]): UnitLayout {
  if (units.some((unit) => unit.coverage !== undefined)) {
    return {
      heading: "Functions",
      header: ["crap", "cyclomatic", "coverage", "function", "location"],
      align: ["right", "right", "right", "left", "left"],
      row: (unit, paintBand) => [
        paintBand(unit.complexity, String(unit.complexity)),
        String(unit.cyclomatic ?? 0),
        String(unit.coverage ?? 0),
        unit.name,
        location(unit),
      ],
    };
  }
  if (units.some((unit) => unit.loc !== undefined)) {
    return {
      heading: "Functions",
      header: ["index", "volume", "cyclomatic", "loc", "function", "location"],
      align: ["right", "right", "right", "right", "left", "left"],
      row: (unit, paintBand) => [
        paintBand(unit.complexity, String(unit.complexity)),
        String(unit.volume ?? 0),
        String(unit.cyclomatic ?? 0),
        String(unit.loc ?? 0),
        unit.name,
        location(unit),
      ],
    };
  }
  if (units.some((unit) => unit.effort !== undefined)) {
    return {
      heading: "Functions",
      header: ["volume", "difficulty", "effort", "function", "location"],
      align: ["right", "right", "right", "left", "left"],
      row: (unit, paintBand) => [
        paintBand(unit.complexity, String(unit.complexity)),
        String(unit.difficulty ?? 0),
        String(unit.effort ?? 0),
        unit.name,
        location(unit),
      ],
    };
  }
  if (units.some((unit) => unit.ca !== undefined)) {
    return {
      heading: "Files",
      header: ["ce", "ca", "I", "file", "location"],
      align: ["right", "right", "right", "left", "left"],
      row: (unit, paintBand) => [
        paintBand(unit.complexity, String(unit.complexity)),
        String(unit.ca ?? 0),
        String(unit.instability ?? 0),
        unit.name,
        location(unit),
      ],
    };
  }
  return {
    heading: units.some((unit) => unit.kind === "file") ? "Files" : "Functions",
    header: ["score", "function", "location"],
    align: ["right", "left", "left"],
    row: (unit, paintBand) => [
      paintBand(unit.complexity, String(unit.complexity)),
      unit.name,
      location(unit),
    ],
  };
}

function unitTable(units: ComplexityUnit[], paintBand: PaintBand): string[] {
  if (units.length === 0) return ["", "No functions match."];
  const layout = unitLayout(units);
  return [
    "",
    layout.heading,
    table(
      [layout.header, ...units.map((unit) => layout.row(unit, paintBand))],
      [...layout.align],
    ),
  ];
}

export function formatComplexityDiff(
  diff: ComplexityDiff,
  options: { color: boolean; direction?: MetricDirection },
): string {
  const direction = options.direction ?? "higher-worse";
  const lines: string[] = [
    "Complexity diff",
    `Δ total  ${paintDelta(diff.totalDelta, options.color, direction)}`,
  ];
  if (diff.changed.length + diff.added.length + diff.removed.length === 0) {
    lines.push("", "No changes.");
  }
  if (diff.changed.length > 0) {
    lines.push(
      "",
      "changed",
      table(
        [
          ["score", "function", "location"],
          ...diff.changed.map((entry) => [
            paint(
              options.color,
              deltaColor(entry.delta, direction),
              `${entry.before} → ${entry.after}`,
            ),
            entry.name,
            `${entry.path}:${entry.startLine}`,
          ]),
        ],
        ["right", "left", "left"],
      ),
    );
  }
  if (diff.added.length > 0) {
    lines.push(
      "",
      "added",
      table(
        [
          ["score", "function", "location"],
          ...diff.added.map((entry) => [
            String(entry.complexity),
            entry.name,
            `${entry.path}:${entry.startLine}`,
          ]),
        ],
        ["right", "left", "left"],
      ),
    );
  }
  if (diff.removed.length > 0) {
    lines.push(
      "",
      "removed",
      table(
        [
          ["score", "function"],
          ...diff.removed.map((entry) => [String(entry.complexity), entry.name]),
        ],
        ["right", "left"],
      ),
    );
  }
  return lines.join("\n");
}

export function formatCheck(
  report: ComplexityReport,
  options: {
    gate: "max" | "min";
    threshold: number;
    color: boolean;
    limit?: number;
    scale?: BandScale;
    direction?: MetricDirection;
  },
): { text: string; violations: ComplexityUnit[] } {
  const scale = options.scale ?? CYCLOMATIC_SCALE;
  const limit = options.limit ?? CHECK_LIMIT;
  const direction = options.direction ?? (options.gate === "min" ? "higher-better" : "higher-worse");
  const violations = sortUnitsByHeat(report.units, direction).filter((unit) =>
    options.gate === "min"
      ? unit.complexity < options.threshold
      : unit.complexity > options.threshold,
  );
  const shown = violations.slice(0, limit);
  const relation = options.gate === "min" ? "below" : "above";
  const lines: string[] = [
    `threshold  ${options.gate} ${options.threshold}`,
    `${violations.length} of ${report.units.length} functions ${relation} ${options.threshold}`,
  ];
  if (shown.length > 0) {
    lines.push(
      "",
      table(
        [
          ["score", "function", "location"],
          ...shown.map((unit) => [
            paint(
              options.color,
              bandAnsi(scale, scale.bandOf(unit.complexity)),
              String(unit.complexity),
            ),
            unit.name,
            `${unit.path}:${unit.startLine}`,
          ]),
        ],
        ["right", "left", "left"],
      ),
    );
    if (violations.length > shown.length) {
      lines.push(`…and ${violations.length - shown.length} more`);
    }
  }
  return { text: lines.join("\n"), violations };
}

export function formatMetricList(
  metrics: Array<{ id: string; name: string; status: MetricStatus | "" }>,
): string {
  return [
    "Metrics",
    table(
      [
        ["id", "name", "status"],
        ...metrics.map((metric) => [metric.id, metric.name, metric.status]),
      ],
      ["left", "left", "left"],
    ),
  ].join("\n");
}

export function formatStatusRollup(counts: {
  upToDate: number;
  outdated: number;
  missing: number;
}): string {
  return `${counts.upToDate} up-to-date, ${counts.outdated} outdated, ${counts.missing} missing`;
}

function deltaColor(delta: number, direction: MetricDirection): string {
  const worse = direction === "higher-better" ? delta < 0 : delta > 0;
  return worse ? RED : GREEN;
}

function paintDelta(delta: number, color: boolean, direction: MetricDirection): string {
  const text = `${delta > 0 ? "+" : ""}${delta}`;
  return paint(color, deltaColor(delta, direction), text);
}

function legend(scale: BandScale, color: boolean): string {
  const parts = scale.bands.map((band) => paint(color, bandAnsi(scale, band), band));
  return `bands  ${parts.join("  ")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
