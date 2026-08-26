import type { MetricStatus } from "../../index.js";
import type { InspectSnapshot } from "./session.js";

export function snapshotTags(snapshot: {
  current: boolean;
  latest: boolean;
  previous: boolean;
}): string {
  const tags: string[] = [];
  if (snapshot.current) tags.push("current");
  if (snapshot.latest) tags.push("latest");
  if (snapshot.previous) tags.push("previous");
  return tags.join(" ").padEnd(24);
}

export function inspectStatus(
  rows: Array<{ id: string; status: MetricStatus | "" }>,
  metric: string | null,
): MetricStatus | "" {
  return rows.find((row) => row.id === metric)?.status ?? "";
}

export function inspectRowLabel(
  snapshot: InspectSnapshot,
  marked: string[],
  formatTimestamp: (iso: string) => string,
): string {
  const mark = marked.includes(snapshot.file) ? "•" : " ";
  return `${mark} ${snapshotTags(snapshot)}  ${formatTimestamp(snapshot.timestamp)}  ${snapshot.file}`;
}
