import {
  catalogDirection,
  defaultMetricCatalog,
  knownMetricIds,
  labelsFromCuts,
  type BandCuts,
  type BandLabels,
  type MetricBandsConfig,
  type MetricCatalog,
  type MetricSettings,
} from "./catalog.js";

export const MENSURA_DIR = ".mensura";
export const MENSURA_CONFIG_FILE = "config.json";
export const DEFAULT_MAX_SNAPSHOTS = 20;

export type MetricGrain = "function" | "structure";

export type SkipPathRule = {
  path: string;
  grains: MetricGrain[] | "all";
};

export type MensuraConfig = {
  skipDirectories: string[];
  skipPaths: SkipPathRule[];
  maxSnapshots: number;
  metrics: MetricCatalog;
};

export type { MetricBandsConfig, MetricCatalog, MetricSettings };
export type { BandCuts, BandLabels } from "./catalog.js";

export function defaultMensuraConfig(): MensuraConfig {
  return {
    skipDirectories: [],
    skipPaths: [],
    maxSnapshots: DEFAULT_MAX_SNAPSHOTS,
    metrics: defaultMetricCatalog(),
  };
}

export function serializeMensuraConfig(config: MensuraConfig): string {
  return `${JSON.stringify(
    {
      skipDirectories: config.skipDirectories,
      skipPaths: config.skipPaths.map(serializeSkipPath),
      maxSnapshots: config.maxSnapshots,
      metrics: Object.fromEntries(
        Object.entries(config.metrics).map(([id, settings]) => [
          id,
          {
            threshold: settings.threshold,
            bands: {
              cuts: [...settings.bands.cuts],
              labels: [...settings.bands.labels],
            },
          },
        ]),
      ),
    },
    null,
    2,
  )}\n`;
}

function serializeSkipPath(rule: SkipPathRule): string | { path: string; grains: MetricGrain[] } {
  if (rule.grains === "all") return rule.path;
  return { path: rule.path, grains: [...rule.grains] };
}

function normalizeSkipPath(raw: string, source: string): string {
  let path = raw.replaceAll("\\", "/");
  if (path.startsWith("./")) path = path.slice(2);
  for (;;) {
    if (path.endsWith("/")) path = path.slice(0, -1);
    else if (path.endsWith("/**")) path = path.slice(0, -3);
    else break;
  }
  if (path.length === 0) {
    throw new Error(`${source}: skipPaths entries must be non-empty paths`);
  }
  if (path.includes("*")) {
    throw new Error(
      `${source}: skipPaths supports only a trailing /**, found "${raw}"`,
    );
  }
  return path;
}

export function parseMensuraConfig(
  raw: unknown,
  source: string,
): MensuraConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${source} must be a JSON object`);
  }
  let skipDirectories: string[] = [];
  const rawSkipDirectories = (raw as { skipDirectories?: unknown })
    .skipDirectories;
  if (rawSkipDirectories !== undefined) {
    if (
      !Array.isArray(rawSkipDirectories) ||
      rawSkipDirectories.some((name) => typeof name !== "string" || name.length === 0)
    ) {
      throw new Error(
        `${source}: skipDirectories must be an array of non-empty directory names`,
      );
    }
    skipDirectories = rawSkipDirectories;
  }
  let skipPaths: SkipPathRule[] = [];
  const rawSkipPaths = (raw as { skipPaths?: unknown }).skipPaths;
  if (rawSkipPaths !== undefined) {
    if (!Array.isArray(rawSkipPaths)) {
      throw new Error(`${source}: skipPaths must be an array of path rules`);
    }
    skipPaths = rawSkipPaths.map((entry) => parseSkipPathEntry(entry, source));
  }
  const maxSnapshots = parseMaxSnapshots(
    (raw as { maxSnapshots?: unknown }).maxSnapshots,
    source,
  );
  const metrics = parseMetrics(
    (raw as { metrics?: unknown }).metrics,
    source,
  );
  return { skipDirectories, skipPaths, maxSnapshots, metrics };
}

function parseMaxSnapshots(raw: unknown, source: string): number {
  if (raw === undefined) return DEFAULT_MAX_SNAPSHOTS;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new Error(`${source}: maxSnapshots must be an integer >= 1`);
  }
  return raw;
}

function parseMetrics(raw: unknown, source: string): MetricCatalog {
  const metrics = defaultMetricCatalog();
  if (raw === undefined) return metrics;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${source}: metrics must be an object of metric settings`);
  }
  const known = new Set(knownMetricIds());
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(id)) {
      throw new Error(`${source}: unknown metric "${id}" in metrics`);
    }
    metrics[id] = parseMetricSettings(entry, id, source, metrics[id]!);
  }
  return metrics;
}

function parseMetricSettings(
  raw: unknown,
  metricId: string,
  source: string,
  defaults: MetricSettings,
): MetricSettings {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `${source}: metrics.${metricId} must be an object with threshold and/or bands`,
    );
  }
  const obj = raw as { threshold?: unknown; bands?: unknown };
  let threshold = defaults.threshold;
  if (obj.threshold !== undefined) {
    if (typeof obj.threshold !== "number" || !Number.isFinite(obj.threshold)) {
      throw new Error(
        `${source}: metrics.${metricId}.threshold must be a finite number`,
      );
    }
    threshold = obj.threshold;
  }
  const bands =
    obj.bands === undefined
      ? defaults.bands
      : parseBands(obj.bands, metricId, source, defaults.bands);
  return { threshold, bands };
}

function parseBands(
  raw: unknown,
  metricId: string,
  source: string,
  defaults: MetricBandsConfig,
): MetricBandsConfig {
  if (Array.isArray(raw)) {
    return parseBandsArray(raw, metricId, source);
  }
  if (raw === null || typeof raw !== "object") {
    throw new Error(
      `${source}: metrics.${metricId}.bands must be { cuts, labels? } or [c0, c1, c2]`,
    );
  }
  return parseBandsObject(raw as { cuts?: unknown; labels?: unknown }, metricId, source, defaults);
}

function parseBandsArray(
  raw: unknown[],
  metricId: string,
  source: string,
): MetricBandsConfig {
  if (raw.length === 3 && raw.every((n) => typeof n === "number" && Number.isFinite(n))) {
    const cuts = raw as unknown as BandCuts;
    validateCuts(cuts, metricId, source);
    return {
      cuts,
      labels: labelsFromCuts(cuts, catalogDirection(metricId)),
    };
  }
  throw new Error(
    `${source}: metrics.${metricId}.bands array must be three finite cut numbers`,
  );
}

function parseBandsObject(
  obj: { cuts?: unknown; labels?: unknown },
  metricId: string,
  source: string,
  defaults: MetricBandsConfig,
): MetricBandsConfig {
  const cuts = parseCutsField(obj.cuts, metricId, source, defaults.cuts);
  const labels = parseLabelsField(obj, metricId, source, defaults.labels, cuts);
  return { cuts, labels };
}

function parseCutsField(
  raw: unknown,
  metricId: string,
  source: string,
  defaults: BandCuts,
): BandCuts {
  if (raw === undefined) return defaults;
  if (
    !Array.isArray(raw) ||
    raw.length !== 3 ||
    raw.some((n) => typeof n !== "number" || !Number.isFinite(n))
  ) {
    throw new Error(
      `${source}: metrics.${metricId}.bands.cuts must be three finite numbers`,
    );
  }
  const cuts = raw as unknown as BandCuts;
  validateCuts(cuts, metricId, source);
  return cuts;
}

function parseLabelsField(
  obj: { cuts?: unknown; labels?: unknown },
  metricId: string,
  source: string,
  defaults: BandLabels,
  cuts: BandCuts,
): BandLabels {
  if (obj.labels !== undefined) {
    if (
      !Array.isArray(obj.labels) ||
      obj.labels.length !== 4 ||
      obj.labels.some((label) => typeof label !== "string" || label.length === 0)
    ) {
      throw new Error(
        `${source}: metrics.${metricId}.bands.labels must be four non-empty strings`,
      );
    }
    return obj.labels as unknown as BandLabels;
  }
  if (obj.cuts !== undefined) {
    return labelsFromCuts(cuts, catalogDirection(metricId));
  }
  return defaults;
}

function validateCuts(cuts: BandCuts, metricId: string, source: string): void {
  const direction = catalogDirection(metricId);
  if (direction === "higher-better") {
    if (!(cuts[0] > cuts[1] && cuts[1] > cuts[2])) {
      throw new Error(
        `${source}: metrics.${metricId}.bands.cuts must be strictly descending for higher-better metrics`,
      );
    }
    return;
  }
  if (!(cuts[0] < cuts[1] && cuts[1] < cuts[2])) {
    throw new Error(
      `${source}: metrics.${metricId}.bands.cuts must be strictly ascending for higher-worse metrics`,
    );
  }
}

function parseSkipPathEntry(entry: unknown, source: string): SkipPathRule {
  if (typeof entry === "string") {
    return { path: normalizeSkipPath(entry, source), grains: "all" };
  }
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `${source}: skipPaths entry must be a path string or an object`,
    );
  }
  const obj = entry as { path?: unknown; grains?: unknown };
  if (typeof obj.path !== "string") {
    throw new Error(
      `${source}: skipPaths entry must be a path string or an object`,
    );
  }
  const path = normalizeSkipPath(obj.path, source);
  if (obj.grains === undefined) {
    return { path, grains: "all" };
  }
  if (!Array.isArray(obj.grains) || obj.grains.length === 0) {
    throw new Error(
      `${source}: skipPaths grains must be a non-empty array of "function" | "structure"`,
    );
  }
  if (
    obj.grains.some(
      (grain) => grain !== "function" && grain !== "structure",
    )
  ) {
    throw new Error(
      `${source}: skipPaths grains must be "function" | "structure"`,
    );
  }
  return { path, grains: obj.grains as MetricGrain[] };
}
