import { basename } from "node:path";
import {
  checkoutStatus,
  evaluateMetric,
  getMetric,
  hashMetricInputs,
  listMetrics,
  listSnapshots,
  loadMensuraConfigOrDefault,
  loadSnapshot,
  snapshotMatchingInputs,
  type ComplexityDiff,
  type ComplexityReport,
  type MetricStatus,
} from "../../index.js";
import { formatComplexityDiff, formatComplexityView, scaleFor, shouldColor } from "../format/index.js";
import type { CatalogRow, InspectSnapshot } from "./session.js";

type Output = { write(text: string): void; isTTY?: boolean };

export async function loadCatalog(root: string): Promise<CatalogRow[]> {
  const statusById = await statusMap(root);
  const rows: CatalogRow[] = [];
  for (const metric of listMetrics()) {
    const listing = await listSnapshots({ root, metric: metric.id });
    rows.push({
      id: metric.id,
      name: metric.name,
      status: statusById[metric.id] ?? "",
      snapshotCount: listing.length,
      latest: listing[0]?.timestamp ?? null,
    });
  }
  return rows;
}

export async function loadInspectSnapshots(
  root: string,
  metric: string,
): Promise<InspectSnapshot[]> {
  const listing = await listSnapshots({ root, metric });
  const currentFile = await currentSnapshotFile(root, metric);
  return listing.map((meta, i) => ({
    file: meta.file,
    timestamp: meta.timestamp,
    latest: i === 0,
    previous: i === 1,
    current: meta.file === currentFile,
  }));
}

export async function showSnapshot(
  root: string,
  metricId: string,
  ref: string,
  stdout: Output,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const metric = getMetric(metricId);
  if (!metric) throw new Error(`Unknown metric "${metricId}"`);
  const config = await loadMensuraConfigOrDefault(root);
  const store = { root, metric: metricId };
  const loaded = await loadSnapshot<ComplexityReport>(store, ref);
  const note = await outdatedNote(loaded.snapshot.inputsHash, root);
  return `${note}${formatComplexityView(loaded.snapshot.report, {
    root: loaded.snapshot.root,
    at: new Date(loaded.snapshot.timestamp),
    color: shouldColor(stdout, env),
    title: metric.name,
    metric: metricId,
    config,
    scale: scaleFor(metricId, config),
    direction: metric.direction,
  })}`;
}

export async function diffSnapshots(
  root: string,
  metricId: string,
  baselineRef: string,
  currentRef: string,
  stdout: Output,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const metric = getMetric(metricId);
  if (!metric) throw new Error(`Unknown metric "${metricId}"`);
  const store = { root, metric: metricId };
  const baseline = await loadSnapshot<ComplexityReport>(store, baselineRef);
  const current = await loadSnapshot<ComplexityReport>(store, currentRef);
  const diff = metric.diff(baseline.snapshot.report, current.snapshot.report) as ComplexityDiff;
  const note =
    (await outdatedNote(baseline.snapshot.inputsHash, root)) ||
    (await outdatedNote(current.snapshot.inputsHash, root));
  return `${note}${formatComplexityDiff(diff, {
    color: shouldColor(stdout, env),
    direction: metric.direction,
  })}`;
}

export async function generateMetrics(
  root: string,
  ids: string[],
): Promise<{ rows: CatalogRow[]; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  for (const id of ids) {
    const metric = getMetric(id);
    if (!metric) {
      errors[id] = `Unknown metric "${id}"`;
      continue;
    }
    try {
      await evaluateMetric(metric, root, { save: true });
    } catch (err) {
      errors[id] = err instanceof Error ? err.message : String(err);
    }
  }
  return { rows: await loadCatalog(root), errors };
}

async function statusMap(root: string): Promise<Record<string, MetricStatus>> {
  try {
    const status = await checkoutStatus(root);
    const next: Record<string, MetricStatus> = {};
    for (const row of status.metrics) next[row.id] = row.status;
    return next;
  } catch {
    return {};
  }
}

async function currentSnapshotFile(root: string, metric: string): Promise<string | null> {
  try {
    const hash = await hashMetricInputs(root);
    const match = await snapshotMatchingInputs({ root, metric }, hash);
    return match ? basename(match.path) : null;
  } catch {
    return null;
  }
}

async function outdatedNote(inputsHash: string | undefined, root: string): Promise<string> {
  try {
    const hash = await hashMetricInputs(root);
    if (inputsHash === hash) return "";
  } catch {
  }
  return "outdated\n";
}
