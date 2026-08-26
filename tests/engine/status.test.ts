import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkoutStatus, evaluateMetric, listMetrics } from "../../src/index.js";
import type { AnyMetric } from "../../src/core/registry.js";
import type { ComplexityReport } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "status-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source);
  }
  return root;
}

const emptyReport: ComplexityReport = { units: [], files: [], unparsed: [] };

function stubMetric(): AnyMetric {
  return {
    id: "cyclomatic-complexity",
    name: "Cyclomatic complexity",
    direction: "higher-worse",
    grain: "function",
    analyze: async () => emptyReport,
    diff: () => ({ added: [], removed: [], changed: [], totalDelta: 0 }),
  };
}

describe("checkoutStatus", () => {
  it("reports missing when no snapshots exist, without needing a hash of empty stores", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    const status = await checkoutStatus(root);
    const registered = listMetrics();
    expect(status.missing).toBe(registered.length);
    expect(status.upToDate).toBe(0);
    expect(status.outdated).toBe(0);
    expect(status.metrics.every((row) => row.status === "missing")).toBe(true);
  });

  it("reports up-to-date for a saved metric and missing for the rest", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    await evaluateMetric(stubMetric(), root);
    const status = await checkoutStatus(root);
    const cyclomatic = status.metrics.find((row) => row.id === "cyclomatic-complexity");
    expect(cyclomatic?.status).toBe("up-to-date");
    expect(status.upToDate).toBe(1);
    expect(status.outdated).toBe(0);
    expect(status.missing).toBe(listMetrics().length - 1);
  });

  it("reports outdated after the checkout changes", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    await evaluateMetric(stubMetric(), root);
    await writeFile(join(root, "src", "a.ts"), "export function a() { return 2; }\n");
    const status = await checkoutStatus(root);
    expect(status.metrics.find((row) => row.id === "cyclomatic-complexity")?.status).toBe(
      "outdated",
    );
    expect(status.outdated).toBe(1);
    expect(status.upToDate).toBe(0);
  });
});
