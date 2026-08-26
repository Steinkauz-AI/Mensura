import {
  bandOfScore,
  catalogDirection,
  defaultMensuraConfig,
  gateForMetric,
  type MensuraConfig,
  type MetricSettings,
} from "../../core/config/index.js";

export type BandScale = {
  bands: readonly [string, string, string, string];
  bandOf: (score: number) => string;
};

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[91m";
const HEAT = [GREEN, YELLOW, MAGENTA, RED] as const;

const DEFAULTS = defaultMensuraConfig();

function buildScale(metricId: string, settings: MetricSettings): BandScale {
  const { cuts, labels } = settings.bands;
  const direction = catalogDirection(metricId);
  return {
    bands: labels,
    bandOf(score: number): string {
      return bandOfScore(score, cuts, labels, direction);
    },
  };
}

function settingsFor(
  metricId: string,
  config: MensuraConfig,
): { id: string; settings: MetricSettings } {
  const settings = config.metrics[metricId] ?? DEFAULTS.metrics[metricId];
  if (settings) return { id: metricId, settings };
  return {
    id: "cyclomatic-complexity",
    settings: DEFAULTS.metrics["cyclomatic-complexity"]!,
  };
}

function defaultScale(metricId: string): BandScale {
  const { id, settings } = settingsFor(metricId, DEFAULTS);
  return buildScale(id, settings);
}

export const CYCLOMATIC_SCALE = defaultScale("cyclomatic-complexity");
export const COGNITIVE_SCALE = defaultScale("cognitive-complexity");
export const HALSTEAD_VOLUME_SCALE = defaultScale("halstead");
export const NESTING_SCALE = defaultScale("nesting-depth");
export const MAINTAINABILITY_SCALE = defaultScale("maintainability-index");
export const COVERAGE_SCALE = defaultScale("test-coverage");
export const CRAP_SCALE = defaultScale("crap");
export const CYCLES_SCALE = defaultScale("cycles");
export const COUPLING_SCALE = defaultScale("coupling");
export const ENCAPSULATION_SCALE = defaultScale("encapsulation");
export const PROPAGATION_SCALE = defaultScale("propagation-cost");

export function scaleFor(
  metricId: string,
  config: MensuraConfig = DEFAULTS,
): BandScale {
  const { id, settings } = settingsFor(metricId, config);
  return buildScale(id, settings);
}

export function bandAnsi(scale: BandScale, band: string): string {
  const index = scale.bands.indexOf(band);
  return HEAT[index === -1 ? 0 : index]!;
}

export function checkDefaultMax(metricId: string): number {
  const gate = checkGate(metricId);
  return gate.gate === "max" ? gate.threshold : 20;
}

export function checkDefaultMin(metricId: string): number {
  const gate = checkGate(metricId);
  return gate.gate === "min" ? gate.threshold : 0;
}

export function checkGate(
  metricId: string,
  config: MensuraConfig = DEFAULTS,
): { gate: "max"; threshold: number } | { gate: "min"; threshold: number } {
  const { id, settings } = settingsFor(metricId, config);
  return gateForMetric(id, settings.threshold);
}
