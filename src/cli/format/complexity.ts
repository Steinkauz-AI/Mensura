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

type SelectOptions = {
  top: number;
  min?: number;
  file?: string;
  scale?: BandScale;
  direction?: MetricDirection;
};

function withScore(report: ComplexityReport): { score?: number } {
  return report.score !== undefined ? { score: report.score } : {};
}

function passesMin(options: SelectOptions): (unit: ComplexityUnit) => boolean {
  return (unit) => options.min === undefined || unit.complexity >= options.min;
}

function selectFileComplexity(
  report: ComplexityReport,
  filePath: string,
  options: SelectOptions,
  direction: MetricDirection,
  scale: BandScale,
): SelectedComplexity {
  const file = report.files.find((entry) => entry.path === filePath);
  if (!file) throw new Error(`File not found in report: ${filePath}`);
  const filtered = sortUnitsByHeat(unitsOf(report, filePath), direction).filter(passesMin(options));
  return {
    selection: { kind: "file", file: filePath },
    summary: summaryOf(report, scale),
    units: filtered.slice(0, options.top),
    files: [file],
    unparsed: report.unparsed,
    omittedUnits: Math.max(0, filtered.length - options.top),
    omittedFiles: 0,
    ...withScore(report),
  };
}

function selectOverviewComplexity(
  report: ComplexityReport,
  options: SelectOptions,
  direction: MetricDirection,
  scale: BandScale,
): SelectedComplexity {
  const filteredUnits = sortUnitsByHeat(report.units, direction).filter(passesMin(options));
  const sortedFiles = sortFilesByHeat(report.files, direction);
  return {
    selection: { kind: "overview" },
    summary: summaryOf(report, scale),
    units: filteredUnits.slice(0, options.top),
    files: sortedFiles.slice(0, options.top),
    unparsed: report.unparsed,
    omittedUnits: Math.max(0, filteredUnits.length - options.top),
    omittedFiles: Math.max(0, sortedFiles.length - options.top),
    ...withScore(report),
  };
}

export function selectComplexity(
  report: ComplexityReport,
  options: SelectOptions,
): SelectedComplexity {
  const scale = options.scale ?? CYCLOMATIC_SCALE;
  const direction = options.direction ?? "higher-worse";
  if (options.file !== undefined) {
    return selectFileComplexity(report, options.file, options, direction, scale);
  }
  return selectOverviewComplexity(report, options, direction, scale);
}

function emptyBands(scale: BandScale): Record<string, number> {
  return Object.fromEntries(scale.bands.map((band) => [band, 0]));
}

function countBands(scores: number[], scale: BandScale): Record<string, number> {
  const bands = emptyBands(scale);
  for (const score of scores) bands[scale.bandOf(score)]! += 1;
  return bands;
}

function medianOf(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const mid = scores.length / 2;
  if (scores.length % 2 === 1) return scores[Math.floor(mid)]!;
  return round2((scores[mid - 1]! + scores[mid]!) / 2);
}

function extremes(scores: number[]): {
  min: number | null;
  max: number | null;
  mean: number | null;
} {
  if (scores.length === 0) return { min: null, max: null, mean: null };
  const total = scores.reduce((sum, n) => sum + n, 0);
  return {
    min: scores[0]!,
    max: scores[scores.length - 1]!,
    mean: round2(total / scores.length),
  };
}

export function summaryOf(
  report: ComplexityReport,
  scale: BandScale = CYCLOMATIC_SCALE,
): ComplexitySummary {
  const scores = report.units.map((unit) => unit.complexity).sort((a, b) => a - b);
  const { min, max, mean } = extremes(scores);
  return {
    files: report.files.length,
    functions: scores.length,
    min,
    max,
    mean,
    median: medianOf(scores),
    bands: countBands(scores, scale),
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

type PaintBand = (score: number, text: string) => string;

function metaHeader(
  report: ComplexityReport,
  options: { root: string; at: Date } & ComplexityViewOptions,
): string[] {
  return [
    options.title ?? "Cyclomatic complexity",
    table(
      [
        ["root", options.root],
        ["at", options.at.toISOString()],
        ...(report.score !== undefined ? [["score", String(report.score)]] : []),
      ],
      ["left", "left"],
    ),
  ];
}

function paintedStat(value: number | null, paintBand: PaintBand): string {
  return value === null ? "-" : paintBand(value, String(value));
}

function summaryStatTable(summary: ComplexitySummary, paintBand: PaintBand): string {
  return table(
    [
      ["files", "functions", "min", "max", "mean", "median"],
      [
        String(summary.files),
        String(summary.functions),
        paintedStat(summary.min, paintBand),
        paintedStat(summary.max, paintBand),
        summary.mean === null ? "-" : String(summary.mean),
        summary.median === null ? "-" : String(summary.median),
      ],
    ],
    ["right", "right", "right", "right", "right", "right"],
  );
}

function bandCountTable(
  summary: ComplexitySummary,
  scale: BandScale,
  color: boolean,
): string {
  return table(
    [
      ["band", "count"],
      ...scale.bands.map((band) => [
        paint(color, bandAnsi(scale, band), band),
        String(summary.bands[band] ?? 0),
      ]),
    ],
    ["left", "right"],
  );
}

function hottestSection(
  selected: SelectedComplexity,
  direction: MetricDirection,
  paintBand: PaintBand,
): string[] {
  if (selected.files.length === 0) return [];
  return [
    "",
    "Hottest files",
    hottestFilesTable(selected.files, direction, paintBand),
    ...omittedLine(selected.omittedFiles),
  ];
}

function unparsedSection(report: ComplexityReport): string[] {
  if (report.unparsed.length === 0) return [];
  return [
    "",
    "Unparseable files",
    table(
      [
        ["count", "file"],
        ...report.unparsed.map((file) => [String(file.errorCount), file.path]),
      ],
      ["right", "left"],
    ),
  ];
}

function fileViewBody(
  selected: SelectedComplexity,
  direction: MetricDirection,
  paintBand: PaintBand,
  metricId: string | undefined,
): string[] {
  const file = selected.files[0]!;
  return [
    "",
    fileRollupTable(file, direction, paintBand),
    ...unitTable(selected.units, paintBand, metricId),
    ...omittedLine(selected.omittedUnits),
  ];
}

function overviewViewBody(
  selected: SelectedComplexity,
  report: ComplexityReport,
  scale: BandScale,
  color: boolean,
  direction: MetricDirection,
  paintBand: PaintBand,
  metricId: string | undefined,
): string[] {
  const summary = selected.summary;
  return [
    "",
    summaryStatTable(summary, paintBand),
    "",
    bandCountTable(summary, scale, color),
    ...unitTable(selected.units, paintBand, metricId),
    ...omittedLine(selected.omittedUnits),
    ...hottestSection(selected, direction, paintBand),
    ...unparsedSection(report),
  ];
}

function viewBody(
  report: ComplexityReport,
  selected: SelectedComplexity,
  scale: BandScale,
  color: boolean,
  direction: MetricDirection,
  paintBand: PaintBand,
  metricId: string | undefined,
): string[] {
  if (report.units.length === 0) {
    return ["", "No TypeScript or JavaScript functions found."];
  }
  if (selected.selection.kind === "file") {
    return fileViewBody(selected, direction, paintBand, metricId);
  }
  return overviewViewBody(
    selected,
    report,
    scale,
    color,
    direction,
    paintBand,
    metricId,
  );
}

function gateFooter(
  report: ComplexityReport,
  options: ComplexityViewOptions,
  scale: BandScale,
  direction: MetricDirection,
): string[] {
  if (!options.metric) return [];
  const catalog = checkGate(options.metric, options.config);
  const { text } = formatCheck(report, {
    gate: catalog.gate,
    threshold: catalog.threshold,
    color: options.color,
    scale,
    direction,
  });
  return ["", text];
}

export function formatComplexityView(
  report: ComplexityReport,
  options: { root: string; at: Date } & ComplexityViewOptions,
): string {
  const scale = options.scale ?? CYCLOMATIC_SCALE;
  const direction = options.direction ?? "higher-worse";
  const paintBand: PaintBand = (score, text) =>
    paint(options.color, bandAnsi(scale, scale.bandOf(score)), text);
  const selected = selectComplexity(report, {
    top: options.top ?? DEFAULT_TOP,
    min: options.min,
    file: options.file,
    scale,
    direction,
  });
  return [
    ...metaHeader(report, options),
    ...viewBody(report, selected, scale, options.color, direction, paintBand, options.metric),
    ...gateFooter(report, options, scale, direction),
    "",
    legend(scale, options.color),
  ].join("\n");
}

function omittedLine(count: number): string[] {
  return count > 0 ? [`…and ${count} more`] : [];
}

function fileRollupTable(
  file: FileComplexity,
  direction: MetricDirection,
  paintBand: PaintBand,
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
  paintBand: PaintBand,
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

type UnitLayout = {
  heading: string;
  header: string[];
  align: readonly Align[];
  row: (unit: ComplexityUnit, paintBand: PaintBand) => string[];
};

function location(unit: ComplexityUnit): string {
  return `${unit.path}:${unit.startLine}`;
}

function crapLayout(): UnitLayout {
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

function maintainabilityLayout(): UnitLayout {
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

function volumeLayout(): UnitLayout {
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

function couplingLayout(): UnitLayout {
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

function defaultLayout(units: ComplexityUnit[]): UnitLayout {
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

const METRIC_LAYOUTS: Record<string, () => UnitLayout> = {
  crap: crapLayout,
  "maintainability-index": maintainabilityLayout,
  halstead: volumeLayout,
  coupling: couplingLayout,
};

function unitLayout(metricId: string | undefined, units: ComplexityUnit[]): UnitLayout {
  if (metricId && METRIC_LAYOUTS[metricId]) {
    return METRIC_LAYOUTS[metricId]();
  }
  return defaultLayout(units);
}

function unitTable(
  units: ComplexityUnit[],
  paintBand: PaintBand,
  metricId: string | undefined,
): string[] {
  if (units.length === 0) return ["", "No functions match."];
  const layout = unitLayout(metricId, units);
  return [
    "",
    layout.heading,
    table(
      [layout.header, ...units.map((unit) => layout.row(unit, paintBand))],
      [...layout.align],
    ),
  ];
}

function diffChangedSection(
  diff: ComplexityDiff,
  color: boolean,
  direction: MetricDirection,
): string[] {
  if (diff.changed.length === 0) return [];
  return [
    "",
    "changed",
    table(
      [
        ["score", "function", "location"],
        ...diff.changed.map((entry) => [
          paint(
            color,
            deltaColor(entry.delta, direction),
            `${entry.before} → ${entry.after}`,
          ),
          entry.name,
          `${entry.path}:${entry.startLine}`,
        ]),
      ],
      ["right", "left", "left"],
    ),
  ];
}

function diffAddedSection(diff: ComplexityDiff): string[] {
  if (diff.added.length === 0) return [];
  return [
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
  ];
}

function diffRemovedSection(diff: ComplexityDiff): string[] {
  if (diff.removed.length === 0) return [];
  return [
    "",
    "removed",
    table(
      [
        ["score", "function"],
        ...diff.removed.map((entry) => [String(entry.complexity), entry.name]),
      ],
      ["right", "left"],
    ),
  ];
}

export function formatComplexityDiff(
  diff: ComplexityDiff,
  options: { color: boolean; direction?: MetricDirection },
): string {
  const direction = options.direction ?? "higher-worse";
  const empty =
    diff.changed.length + diff.added.length + diff.removed.length === 0
      ? ["", "No changes."]
      : [];
  return [
    "Complexity diff",
    `Δ total  ${paintDelta(diff.totalDelta, options.color, direction)}`,
    ...empty,
    ...diffChangedSection(diff, options.color, direction),
    ...diffAddedSection(diff),
    ...diffRemovedSection(diff),
  ].join("\n");
}

function checkViolations(
  report: ComplexityReport,
  gate: "max" | "min",
  threshold: number,
  direction: MetricDirection,
): ComplexityUnit[] {
  return sortUnitsByHeat(report.units, direction).filter((unit) =>
    gate === "min" ? unit.complexity < threshold : unit.complexity > threshold,
  );
}

function checkViolationTable(
  shown: ComplexityUnit[],
  color: boolean,
  scale: BandScale,
): string {
  return table(
    [
      ["score", "function", "location"],
      ...shown.map((unit) => [
        paint(
          color,
          bandAnsi(scale, scale.bandOf(unit.complexity)),
          String(unit.complexity),
        ),
        unit.name,
        `${unit.path}:${unit.startLine}`,
      ]),
    ],
    ["right", "left", "left"],
  );
}

function checkDirection(
  gate: "max" | "min",
  direction: MetricDirection | undefined,
): MetricDirection {
  return direction ?? (gate === "min" ? "higher-better" : "higher-worse");
}

function checkHeader(
  report: ComplexityReport,
  gate: "max" | "min",
  threshold: number,
  violations: ComplexityUnit[],
): string[] {
  const relation = gate === "min" ? "below" : "above";
  return [
    `threshold  ${gate} ${threshold}`,
    `${violations.length} of ${report.units.length} functions ${relation} ${threshold}`,
  ];
}

function checkShownLines(
  violations: ComplexityUnit[],
  shown: ComplexityUnit[],
  color: boolean,
  scale: BandScale,
): string[] {
  if (shown.length === 0) return [];
  const extra =
    violations.length > shown.length
      ? [`…and ${violations.length - shown.length} more`]
      : [];
  return ["", checkViolationTable(shown, color, scale), ...extra];
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
  const direction = checkDirection(options.gate, options.direction);
  const violations = checkViolations(report, options.gate, options.threshold, direction);
  const shown = violations.slice(0, limit);
  const lines = [
    ...checkHeader(report, options.gate, options.threshold, violations),
    ...checkShownLines(violations, shown, options.color, scale),
  ];
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
