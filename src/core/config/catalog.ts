export type BandCuts = readonly [number, number, number];
export type BandLabels = readonly [string, string, string, string];

export type MetricBandsConfig = {
  cuts: BandCuts;
  labels: BandLabels;
};

export type MetricSettings = {
  threshold: number;
  bands: MetricBandsConfig;
};

export type MetricCatalog = Record<string, MetricSettings>;

export type MetricGateDirection = "higher-worse" | "higher-better";

type CatalogEntry = {
  threshold: number;
  cuts: BandCuts;
  labels: BandLabels;
  direction: MetricGateDirection;
};

const ENTRIES = {
  "cyclomatic-complexity": {
    threshold: 20,
    cuts: [11, 21, 51],
    labels: ["1-10", "11-20", "21-50", "51+"],
    direction: "higher-worse",
  },
  "cognitive-complexity": {
    threshold: 15,
    cuts: [11, 16, 26],
    labels: ["0-10", "11-15", "16-25", "26+"],
    direction: "higher-worse",
  },
  halstead: {
    threshold: 1000,
    cuts: [21, 101, 1001],
    labels: ["1-20", "21-100", "101-1000", "1001+"],
    direction: "higher-worse",
  },
  "nesting-depth": {
    threshold: 3,
    cuts: [2, 4, 6],
    labels: ["0-1", "2-3", "4-5", "6+"],
    direction: "higher-worse",
  },
  "maintainability-index": {
    threshold: 20,
    cuts: [50, 20, 10],
    labels: ["50-100", "20-49", "10-19", "0-9"],
    direction: "higher-better",
  },
  "test-coverage": {
    threshold: 50,
    cuts: [80, 50, 20],
    labels: ["80-100", "50-79", "20-49", "0-19"],
    direction: "higher-better",
  },
  crap: {
    threshold: 30,
    cuts: [9, 16, 31],
    labels: ["1-8", "9-15", "16-30", "31+"],
    direction: "higher-worse",
  },
  cycles: {
    threshold: 0,
    cuts: [2, 4, 11],
    labels: ["0", "2-3", "4-10", "11+"],
    direction: "higher-worse",
  },
  coupling: {
    threshold: 15,
    cuts: [6, 11, 21],
    labels: ["0-5", "6-10", "11-20", "21+"],
    direction: "higher-worse",
  },
  encapsulation: {
    threshold: 0,
    cuts: [1, 2, 5],
    labels: ["0", "1", "2-4", "5+"],
    direction: "higher-worse",
  },
  "propagation-cost": {
    threshold: 50,
    cuts: [21, 41, 61],
    labels: ["0-20", "21-40", "41-60", "61+"],
    direction: "higher-worse",
  },
} as const satisfies Record<string, CatalogEntry>;

function settingsFrom(entry: CatalogEntry): MetricSettings {
  return {
    threshold: entry.threshold,
    bands: {
      cuts: [...entry.cuts] as unknown as BandCuts,
      labels: [...entry.labels] as unknown as BandLabels,
    },
  };
}

export function defaultMetricCatalog(): MetricCatalog {
  const catalog: MetricCatalog = {};
  for (const [id, entry] of Object.entries(ENTRIES)) {
    catalog[id] = settingsFrom(entry);
  }
  return catalog;
}

export function catalogDirection(metricId: string): MetricGateDirection {
  const entry = (ENTRIES as Record<string, CatalogEntry | undefined>)[metricId];
  return entry?.direction ?? "higher-worse";
}

export function gateForMetric(
  metricId: string,
  threshold: number,
): { gate: "max"; threshold: number } | { gate: "min"; threshold: number } {
  if (catalogDirection(metricId) === "higher-better") {
    return { gate: "min", threshold };
  }
  return { gate: "max", threshold };
}

export function labelsFromCuts(
  cuts: BandCuts,
  direction: MetricGateDirection,
): BandLabels {
  if (direction === "higher-better") {
    return [
      `${cuts[0]}+`,
      `${cuts[1]}-${cuts[0] - 1}`,
      `${cuts[2]}-${cuts[1] - 1}`,
      `0-${cuts[2] - 1}`,
    ];
  }
  return [
    `0-${cuts[0] - 1}`,
    `${cuts[0]}-${cuts[1] - 1}`,
    `${cuts[1]}-${cuts[2] - 1}`,
    `${cuts[2]}+`,
  ];
}

export function bandOfScore(
  score: number,
  cuts: BandCuts,
  labels: BandLabels,
  direction: MetricGateDirection,
): string {
  if (direction === "higher-better") {
    if (score >= cuts[0]) return labels[0]!;
    if (score >= cuts[1]) return labels[1]!;
    if (score >= cuts[2]) return labels[2]!;
    return labels[3]!;
  }
  if (score >= cuts[2]) return labels[3]!;
  if (score >= cuts[1]) return labels[2]!;
  if (score >= cuts[0]) return labels[1]!;
  return labels[0]!;
}

export function knownMetricIds(): readonly string[] {
  return Object.keys(ENTRIES);
}
