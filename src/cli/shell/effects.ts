import { recoverScreen } from "./screen.js";
import type { ShellEffect, ShellSession } from "./session.js";
import {
  diffSnapshots,
  generateMetrics,
  loadInspectSnapshots,
  showSnapshot,
} from "./store.js";

type Output = { write(text: string): void; isTTY?: boolean };

export type EffectProps = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  output: Output;
};

async function runInspect(
  session: ShellSession,
  effect: Extract<ShellEffect, { type: "inspect" }>,
  props: EffectProps,
): Promise<void> {
  session.setSnapshots(await loadInspectSnapshots(props.cwd, effect.metric));
}

async function runShow(
  session: ShellSession,
  effect: Extract<ShellEffect, { type: "show" }>,
  props: EffectProps,
): Promise<void> {
  session.openReport(
    await showSnapshot(props.cwd, effect.metric, effect.ref, props.output, props.env),
  );
}

async function runDiff(
  session: ShellSession,
  effect: Extract<ShellEffect, { type: "diff" }>,
  props: EffectProps,
): Promise<void> {
  session.openReport(
    await diffSnapshots(
      props.cwd,
      effect.metric,
      effect.baseline,
      effect.current,
      props.output,
      props.env,
    ),
  );
}

async function runGenerate(
  session: ShellSession,
  effect: Extract<ShellEffect, { type: "generate" }>,
  props: EffectProps,
): Promise<void> {
  const result = await generateMetrics(props.cwd, effect.ids);
  recoverScreen(props.output);
  session.finishGenerate(result.rows, result.errors);
}

function failEffect(session: ShellSession, err: unknown, props: EffectProps): void {
  const message = err instanceof Error ? err.message : String(err);
  recoverScreen(props.output);
  if (session.state.generating) session.failGenerate(message);
  else session.openError(message);
}

export async function applyEffect(
  session: ShellSession,
  effect: ShellEffect,
  props: EffectProps,
  bump: () => void,
): Promise<void> {
  try {
    if (effect.type === "inspect") {
      await runInspect(session, effect, props);
      bump();
      return;
    }
    if (effect.type === "show") {
      await runShow(session, effect, props);
      bump();
      return;
    }
    if (effect.type === "diff") {
      await runDiff(session, effect, props);
      bump();
      return;
    }
    if (effect.type === "generate") {
      await runGenerate(session, effect, props);
      bump();
    }
  } catch (err) {
    failEffect(session, err, props);
    bump();
  }
}
