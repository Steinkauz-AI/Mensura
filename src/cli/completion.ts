import { listMetrics } from "../index.js";
import type { Argument, Command, Option } from "commander";
import {
  COMPLETION_SHELLS,
  mensuraProgram,
  type CompletionShell,
} from "./args.js";

const SNAPSHOT_REFS = ["latest", "previous"] as const;

type FlagKind = "none" | "ref" | "path" | "count";

type Flag = {
  long: string;
  kind: FlagKind;
};

type Tree = {
  name: string;
  args: string[];
  flags: Flag[];
  commands: Tree[];
};

type ScriptCtx = {
  commands: string[];
  rootFlags: string;
  snapshotSubs: string[];
  shells: string[];
  metrics: string[];
  refs: string[];
  runFlags: string;
  listFlags: string;
  showFlags: string;
  diffFlags: string;
  refFlags: string[];
  pathFlags: string[];
  countFlags: string[];
};

export function completionScript(shell: CompletionShell): string {
  const tree = inspect(mensuraProgram());
  const metrics = listMetrics().map((metric) => metric.id);
  if (metrics.length === 0) {
    throw new Error(
      "completionScript: no metrics registered — call ensureBuiltinMetrics() first",
    );
  }
  const refs = [...SNAPSHOT_REFS];
  switch (shell) {
    case "bash":
      return bashScript(tree, metrics, refs);
    case "zsh":
      return zshScript(tree, metrics, refs);
    case "fish":
      return fishScript(tree, metrics, refs);
  }
}

function inspect(command: Command): Tree {
  return {
    name: command.name(),
    args: command.registeredArguments.map((argument: Argument) => argument.name()),
    flags: command.options.map(flagOf),
    commands: command.commands
      .filter((child) => child.name() !== "help")
      .map(inspect),
  };
}

function flagOf(option: Option): Flag {
  return { long: option.long ?? option.flags.split(/\s+/)[0]!, kind: kindOf(option.flags) };
}

function kindOf(flags: string): FlagKind {
  if (flags.includes("<ref>")) return "ref";
  if (flags.includes("<path>")) return "path";
  if (flags.includes("<n>")) return "count";
  return "none";
}

function find(node: Tree, name: string): Tree | undefined {
  return node.commands.find((child) => child.name === name);
}

function flagNames(node: Tree | undefined): string[] {
  return node?.flags.map((flag) => flag.long) ?? [];
}

function words(values: readonly string[]): string {
  return values.join(" ");
}

function flagCase(flags: string[]): string {
  return flags.length > 0 ? flags.join("|") : "__mensura_none__";
}

function allFlags(node: Tree): Flag[] {
  return [...node.flags, ...node.commands.flatMap(allFlags)];
}

function longsOfKind(tree: Tree, kind: FlagKind): string[] {
  return allFlags(tree)
    .filter((flag) => flag.kind === kind)
    .map((flag) => flag.long);
}

function commandFlagWords(tree: Tree, name: string): string {
  return words(flagNames(find(tree, name)));
}

function snapshotFlagWords(snapshot: Tree | undefined, name: string): string {
  return words(flagNames(snapshot ? find(snapshot, name) : undefined));
}

function scriptCtx(tree: Tree, metrics: string[], refs: string[]): ScriptCtx {
  const snapshot = find(tree, "snapshot");
  const completion = find(tree, "completion");
  return {
    commands: tree.commands.map((child) => child.name),
    rootFlags: "-i --interactive -h --help",
    snapshotSubs: snapshot?.commands.map((child) => child.name) ?? [],
    shells: completion ? [...COMPLETION_SHELLS] : [],
    metrics,
    refs,
    runFlags: commandFlagWords(tree, "run"),
    listFlags: commandFlagWords(tree, "list"),
    showFlags: snapshotFlagWords(snapshot, "show"),
    diffFlags: snapshotFlagWords(snapshot, "diff"),
    refFlags: longsOfKind(tree, "ref"),
    pathFlags: longsOfKind(tree, "path"),
    countFlags: longsOfKind(tree, "count"),
  };
}

function prevCaseSpec(ctx: ScriptCtx) {
  return {
    refCase: flagCase(ctx.refFlags),
    pathCase: flagCase(ctx.pathFlags),
    countCase: flagCase(ctx.countFlags),
    refsWord: words(ctx.refs),
  };
}

function flagSwitchSpec(ctx: ScriptCtx) {
  return {
    runFlags: ctx.runFlags,
    listFlags: ctx.listFlags,
    showFlags: ctx.showFlags,
    diffFlags: ctx.diffFlags,
  };
}

function snapshotCommandSpec(ctx: ScriptCtx) {
  return {
    snapshotSubs: words(ctx.snapshotSubs),
    metrics: words(ctx.metrics),
    refs: words(ctx.refs),
    shells: words(ctx.shells),
    commands: words(ctx.commands),
  };
}

function bashPrevBlock(ctx: ScriptCtx): string[] {
  const prev = prevCaseSpec(ctx);
  return [
    "  case \"$prev\" in",
    `    ${prev.refCase}) COMPREPLY=( $(compgen -W "${prev.refsWord}" -- "$cur") ); return ;;`,
    `    ${prev.pathCase}) COMPREPLY=( $(compgen -f -- "$cur") ); return ;;`,
    `    ${prev.countCase}) return ;;`,
    "  esac",
  ];
}

function bashFlagBlock(ctx: ScriptCtx): string[] {
  const flags = flagSwitchSpec(ctx);
  return [
    "  if [[ \"$cur\" == -* ]]; then",
    "    local flags=\"\"",
    "    case \"$c1\" in",
    `      run) flags="${flags.runFlags}" ;;`,
    `      list) flags="${flags.listFlags}" ;;`,
    "      snapshot)",
    "        case \"$c2\" in",
    `          show) flags="${flags.showFlags}" ;;`,
    `          diff) flags="${flags.diffFlags}" ;;`,
    "        esac",
    "        ;;",
    "    esac",
    "    COMPREPLY=( $(compgen -W \"$flags\" -- \"$cur\") )",
    "    return",
    "  fi",
  ];
}

function bashRootBlock(ctx: ScriptCtx): string[] {
  return [
    "  if [[ $COMP_CWORD -eq 1 ]]; then",
    `    if [[ "$cur" == -* ]]; then COMPREPLY=( $(compgen -W "${ctx.rootFlags}" -- "$cur") ); return; fi`,
    `    COMPREPLY=( $(compgen -W "${words(ctx.commands)}" -- "$cur") )`,
    "    return",
    "  fi",
  ];
}

function bashSnapshotBlock(spec: ReturnType<typeof snapshotCommandSpec>): string[] {
  return [
    "    snapshot)",
    "      if [[ $COMP_CWORD -eq 2 ]]; then",
    `        COMPREPLY=( $(compgen -W "${spec.snapshotSubs}" -- "$cur") )`,
    "      elif [[ \"$c2\" == \"show\" ]]; then",
    "        if [[ $COMP_CWORD -eq 3 ]]; then",
    `          COMPREPLY=( $(compgen -W "${spec.metrics}" -- "$cur") )`,
    "        else",
    `          COMPREPLY=( $(compgen -W "${spec.refs}" -- "$cur") )`,
    "        fi",
    "      elif [[ \"$c2\" == \"diff\" ]]; then",
    `        COMPREPLY=( $(compgen -W "${spec.metrics}" -- "$cur") )`,
    "      fi",
    "      ;;",
  ];
}

function bashCommandBlock(ctx: ScriptCtx): string[] {
  const spec = snapshotCommandSpec(ctx);
  return [
    "  case \"$c1\" in",
    `    run) COMPREPLY=( $(compgen -W "${spec.metrics}" -- "$cur") ) ;;`,
    ...bashSnapshotBlock(spec),
    `    completion) COMPREPLY=( $(compgen -W "${spec.shells}" -- "$cur") ) ;;`,
    "  esac",
  ];
}

function bashScript(tree: Tree, metrics: string[], refs: string[]): string {
  const ctx = scriptCtx(tree, metrics, refs);
  return [
    "_mensura() {",
    "  local cur prev c1 c2",
    "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    "  prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
    "  c1=\"${COMP_WORDS[1]}\"",
    "  c2=\"${COMP_WORDS[2]}\"",
    ...bashPrevBlock(ctx),
    ...bashFlagBlock(ctx),
    ...bashRootBlock(ctx),
    ...bashCommandBlock(ctx),
    "}",
    "complete -F _mensura mensura",
  ].join("\n");
}

function zshPrevBlock(ctx: ScriptCtx): string[] {
  const prev = prevCaseSpec(ctx);
  return [
    "case $prev in",
    `  ${prev.refCase}) _values 'ref' ${prev.refsWord}; return ;;`,
    `  ${prev.pathCase}) _files; return ;;`,
    `  ${prev.countCase}) return ;;`,
    "esac",
  ];
}

function zshFlagBlock(ctx: ScriptCtx): string[] {
  const flags = flagSwitchSpec(ctx);
  return [
    "if [[ $cur == -* ]]; then",
    "  if (( CURRENT == 2 )); then",
    `    _values 'flag' ${ctx.rootFlags}`,
    "    return",
    "  fi",
    "  case $c1 in",
    `    run) _values 'flag' ${flags.runFlags} ;;`,
    `    list) _values 'flag' ${flags.listFlags} ;;`,
    "    snapshot)",
    "      case $c2 in",
    `        show) _values 'flag' ${flags.showFlags} ;;`,
    `        diff) _values 'flag' ${flags.diffFlags} ;;`,
    "      esac",
    "      ;;",
    "  esac",
    "  return",
    "fi",
  ];
}

function zshSnapshotBlock(spec: ReturnType<typeof snapshotCommandSpec>): string[] {
  return [
    "  snapshot)",
    "    if (( CURRENT == 3 )); then",
    `      _values 'subcommand' ${spec.snapshotSubs}`,
    "    elif [[ $c2 == show ]]; then",
    "      if (( CURRENT == 4 )); then",
    `        _values 'metric' ${spec.metrics}`,
    "      else",
    `        _values 'ref' ${spec.refs}`,
    "      fi",
    "    elif [[ $c2 == diff ]]; then",
    `      _values 'metric' ${spec.metrics}`,
    "    fi",
    "    ;;",
  ];
}

function zshCommandBlock(ctx: ScriptCtx): string[] {
  const spec = snapshotCommandSpec(ctx);
  return [
    "if (( CURRENT == 2 )); then",
    `  _values 'command' ${spec.commands}`,
    "  return",
    "fi",
    "case $c1 in",
    `  run) _values 'metric' ${spec.metrics} ;;`,
    ...zshSnapshotBlock(spec),
    `  completion) _values 'shell' ${spec.shells} ;;`,
    "esac",
  ];
}

function zshScript(tree: Tree, metrics: string[], refs: string[]): string {
  const ctx = scriptCtx(tree, metrics, refs);
  return [
    "#compdef mensura",
    "local cur prev c1 c2",
    "cur=${words[CURRENT]}",
    "prev=${words[CURRENT-1]}",
    "c1=${words[2]}",
    "c2=${words[3]}",
    ...zshPrevBlock(ctx),
    ...zshFlagBlock(ctx),
    ...zshCommandBlock(ctx),
  ].join("\n");
}

function fishScript(tree: Tree, metrics: string[], refs: string[]): string {
  const lines: string[] = [
    "complete -c mensura -f",
    'complete -c mensura -s i -l interactive -d "Interactive View/Run shell"',
    "complete -c mensura -s h -l help",
  ];
  const metricsWord = words(metrics);
  const refsWord = words(refs);

  for (const command of tree.commands) {
    lines.push(
      `complete -c mensura -n "__fish_use_subcommand" -a "${command.name}"`,
    );
    emitFishCommand(lines, command, metricsWord, refsWord);
  }
  return lines.join("\n");
}

function fishFlagLine(condition: string, flag: Flag, refs: string): string {
  const long = flag.long.replace(/^--/, "");
  if (flag.kind === "ref") {
    return `complete -c mensura -n "${condition}" -l ${long} -r -a "${refs}"`;
  }
  if (flag.kind === "path") {
    return `complete -c mensura -n "${condition}" -l ${long} -r -F`;
  }
  if (flag.kind === "count") {
    return `complete -c mensura -n "${condition}" -l ${long} -r`;
  }
  return `complete -c mensura -n "${condition}" -l ${long}`;
}

function emitFishFlags(lines: string[], node: Tree, condition: string, refs: string): void {
  for (const flag of node.flags) {
    lines.push(fishFlagLine(condition, flag, refs));
  }
}

function emitFishArgs(
  lines: string[],
  node: Tree,
  condition: string,
  metrics: string,
  refs: string,
): void {
  for (const argument of node.args) {
    if (argument === "id") {
      lines.push(`complete -c mensura -n "${condition}" -a "${metrics}"`);
    } else if (argument === "ref") {
      lines.push(`complete -c mensura -n "${condition}" -a "${refs}"`);
    } else if (argument === "shell") {
      lines.push(`complete -c mensura -n "${condition}" -a "${words(COMPLETION_SHELLS)}"`);
    } else if (argument === "root") {
      lines.push(`complete -c mensura -n "${condition}" -a "(__fish_complete_directories)"`);
    }
  }
}

function emitFishChildren(
  lines: string[],
  node: Tree,
  condition: string,
  metrics: string,
  refs: string,
): void {
  for (const child of node.commands) {
    lines.push(
      `complete -c mensura -n "${condition} && not __fish_seen_subcommand_from ${child.name}" -a "${child.name}"`,
    );
    emitFishCommand(lines, child, metrics, refs);
  }
}

function emitFishCommand(
  lines: string[],
  node: Tree,
  metrics: string,
  refs: string,
): void {
  const condition = `__fish_seen_subcommand_from ${node.name}`;
  emitFishFlags(lines, node, condition, refs);
  emitFishArgs(lines, node, condition, metrics, refs);
  emitFishChildren(lines, node, condition, metrics, refs);
}
