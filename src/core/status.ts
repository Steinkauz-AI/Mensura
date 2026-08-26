import { ensureBuiltinMetrics } from "./builtins.js";
import { hashMetricInputs } from "./inputs.js";
import { listMetrics } from "./registry.js";
import { listSnapshots, snapshotMatchingInputs } from "./snapshot.js";


export type MetricStatus = "up-to-date" | "outdated" | "missing";

export type MetricStatusRow = {
  id: string;
  name: string;
  status: MetricStatus;
};

export type CheckoutStatus = {
  upToDate: number;
  outdated: number;
  missing: number;
  metrics: MetricStatusRow[];
};


export async function checkoutStatus(root: string): Promise<CheckoutStatus> {
  await ensureBuiltinMetrics();
  const metrics = listMetrics();
  const listings = await Promise.all(
    metrics.map(async (metric) => ({
      metric,
      listing: await listSnapshots({ root, metric: metric.id }),
    })),
  );
  const anyStore = listings.some((entry) => entry.listing.length > 0);
  const inputsHash = anyStore ? await hashMetricInputs(root) : "";
  const rows: MetricStatusRow[] = [];
  for (const { metric, listing } of listings) {
    if (listing.length === 0) {
      rows.push({ id: metric.id, name: metric.name, status: "missing" });
      continue;
    }
    const match = await snapshotMatchingInputs({ root, metric: metric.id }, inputsHash);
    rows.push({
      id: metric.id,
      name: metric.name,
      status: match ? "up-to-date" : "outdated",
    });
  }
  return {
    upToDate: rows.filter((row) => row.status === "up-to-date").length,
    outdated: rows.filter((row) => row.status === "outdated").length,
    missing: rows.filter((row) => row.status === "missing").length,
    metrics: rows,
  };
}
