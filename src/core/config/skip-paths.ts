import type { MetricGrain, SkipPathRule } from "./config.js";

export function pathMatchesRule(rel: string, rulePath: string): boolean {
  return rel === rulePath || rel.startsWith(`${rulePath}/`);
}

export function buildGrainPathSkipper(
  rules: readonly SkipPathRule[],
  grain: MetricGrain,
): (rel: string) => boolean {
  const active = rules.filter(
    (rule) => rule.grains === "all" || rule.grains.includes(grain),
  );
  if (active.length === 0) return () => false;
  return (rel) => active.some((rule) => pathMatchesRule(rel, rule.path));
}
