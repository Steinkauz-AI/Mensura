import { describe, expect, it } from "vitest";
import {
  getMetric,
  listMetrics,
  singleMetric,
} from "../../src/index.js";

describe("metric registry", () => {
  it("lists cyclomatic, cognitive, Halstead, nesting depth, maintainability index, test coverage, CRAP, and structure metrics", () => {
    expect(listMetrics()).toEqual([
      { id: "cyclomatic-complexity", name: "Cyclomatic complexity" },
      { id: "cognitive-complexity", name: "Cognitive complexity" },
      { id: "halstead", name: "Halstead" },
      { id: "nesting-depth", name: "Nesting depth" },
      { id: "maintainability-index", name: "Maintainability index" },
      { id: "test-coverage", name: "Test coverage" },
      { id: "crap", name: "CRAP" },
      { id: "cycles", name: "Cycles" },
      { id: "coupling", name: "Coupling" },
      { id: "encapsulation", name: "Encapsulation" },
      { id: "propagation-cost", name: "Propagation cost" },
    ]);
  });

  it("resolves known ids and rejects unknown ones", () => {
    const metric = getMetric("cyclomatic-complexity");
    expect(metric?.id).toBe("cyclomatic-complexity");
    expect(metric?.analyze).toBeTypeOf("function");
    expect(metric?.diff).toBeTypeOf("function");
    expect(getMetric("cognitive-complexity")?.name).toBe("Cognitive complexity");
    expect(getMetric("halstead")?.name).toBe("Halstead");
    expect(getMetric("nesting-depth")?.name).toBe("Nesting depth");
    expect(getMetric("maintainability-index")?.name).toBe("Maintainability index");
    expect(getMetric("maintainability-index")?.direction).toBe("higher-better");
    expect(getMetric("test-coverage")?.name).toBe("Test coverage");
    expect(getMetric("test-coverage")?.direction).toBe("higher-better");
    expect(getMetric("test-coverage")?.prepare).toBeTypeOf("function");
    expect(getMetric("crap")?.name).toBe("CRAP");
    expect(getMetric("crap")?.direction).toBe("higher-worse");
    expect(getMetric("crap")?.prepare).toBeTypeOf("function");
    expect(getMetric("cycles")?.name).toBe("Cycles");
    expect(getMetric("coupling")?.name).toBe("Coupling");
    expect(getMetric("encapsulation")?.name).toBe("Encapsulation");
    expect(getMetric("propagation-cost")?.name).toBe("Propagation cost");
    expect(getMetric("cyclomatic-complexity")?.direction).toBe("higher-worse");
    expect(getMetric("nope")).toBeUndefined();
  });

  it("has no single-metric default once more than one metric is registered", () => {
    expect(singleMetric()).toBeUndefined();
  });

  it("declares the catalog's two grains on every metric", () => {
    for (const { id } of listMetrics()) {
      const metric = getMetric(id)!;
      expect(["function", "structure"]).toContain(metric.grain);
    }
    expect(getMetric("cyclomatic-complexity")?.grain).toBe("function");
    expect(getMetric("test-coverage")?.grain).toBe("function");
    expect(getMetric("crap")?.grain).toBe("function");
    expect(getMetric("cycles")?.grain).toBe("structure");
    expect(getMetric("coupling")?.grain).toBe("structure");
    expect(getMetric("encapsulation")?.grain).toBe("structure");
    expect(getMetric("propagation-cost")?.grain).toBe("structure");
  });
});
