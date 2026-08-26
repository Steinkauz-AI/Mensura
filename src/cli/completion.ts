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

export function completionScript(shell: CompletionShell): string {
  const tree = inspect(mensuraProgram());
  const metrics = listMetrics().map((metric) => metric.id);
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

function bashScript(tree: Tree, metrics: string[], refs: string[]): string {
  const run = find(tree, "run");
  const list = find(tree, "list");
  const snapshot = find(tree, "snapshot");
  const show = snapshot ? find(snapshot, "show") : undefined;
  const diff = snapshot ? find(snapshot, "diff") : undefined;
  const completion = find(tree, "completion");
  const commands = tree.commands.map((child) => child.name);
  const rootFlags = "-i --interactive -h --help";
  const snapshotSubs = snapshot?.commands.map((child) => child.name) ?? [];
  const shells = completion ? [...COMPLETION_SHELLS] : [];
  const refFlags = allFlags(tree)
    .filter((flag) => flag.kind === "ref")
    .map((flag) => flag.long);
  const pathFlags = allFlags(tree)
    .filter((flag) => flag.kind === "path")
    .map((flag) => flag.long);
  const countFlags = allFlags(tree)
    .filter((flag) => flag.kind === "count")
    .map((flag) => flag.long);

  return [
    "_mensura() {",
    "  local cur prev c1 c2",
    "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    "  prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
    "  c1=\"${COMP_WORDS[1]}\"",
    "  c2=\"${COMP_WORDS[2]}\"",
    "  case \"$prev\" in",
    `    ${flagCase(refFlags)}) COMPREPLY=( $(compgen -W "${words(refs)}" -- "$cur") ); return ;;`,
    `    ${flagCase(pathFlags)}) COMPREPLY=( $(compgen -f -- "$cur") ); return ;;`,
    `    ${flagCase(countFlags)}) return ;;`,
    "  esac",
    "  if [[ \"$cur\" == -* ]]; then",
    "    local flags=\"\"",
    "    case \"$c1\" in",
    `      run) flags="${words(flagNames(run))}" ;;`,
    `      list) flags="${words(flagNames(list))}" ;;`,
    "      snapshot)",
    "        case \"$c2\" in",
    `          show) flags="${words(flagNames(show))}" ;;`,
    `          diff) flags="${words(flagNames(diff))}" ;;`,
    "        esac",
    "        ;;",
    "    esac",
    "    COMPREPLY=( $(compgen -W \"$flags\" -- \"$cur\") )",
    "    return",
    "  fi",
    "  if [[ $COMP_CWORD -eq 1 ]]; then",
    `    if [[ "$cur" == -* ]]; then COMPREPLY=( $(compgen -W "${rootFlags}" -- "$cur") ); return; fi`,
    `    COMPREPLY=( $(compgen -W "${words(commands)}" -- "$cur") )`,
    "    return",
    "  fi",
    "  case \"$c1\" in",
    `    run) COMPREPLY=( $(compgen -W "${words(metrics)}" -- "$cur") ) ;;`,
    "    snapshot)",
    "      if [[ $COMP_CWORD -eq 2 ]]; then",
    `        COMPREPLY=( $(compgen -W "${words(snapshotSubs)}" -- "$cur") )`,
    "      elif [[ \"$c2\" == \"show\" ]]; then",
    "        if [[ $COMP_CWORD -eq 3 ]]; then",
    `          COMPREPLY=( $(compgen -W "${words(metrics)}" -- "$cur") )`,
    "        else",
    `          COMPREPLY=( $(compgen -W "${words(refs)}" -- "$cur") )`,
    "        fi",
    "      elif [[ \"$c2\" == \"diff\" ]]; then",
    `        COMPREPLY=( $(compgen -W "${words(metrics)}" -- "$cur") )`,
    "      fi",
    "      ;;",
    `    completion) COMPREPLY=( $(compgen -W "${words(shells)}" -- "$cur") ) ;;`,
    "  esac",
    "}",
    "complete -F _mensura mensura",
  ].join("\n");
}

function flagCase(flags: string[]): string {
  return flags.length > 0 ? flags.join("|") : "__mensura_none__";
}

function allFlags(node: Tree): Flag[] {
  return [...node.flags, ...node.commands.flatMap(allFlags)];
}

function zshScript(tree: Tree, metrics: string[], refs: string[]): string {
  const commands = tree.commands.map((child) => child.name);
  const snapshot = find(tree, "snapshot");
  const snapshotSubs = snapshot?.commands.map((child) => child.name) ?? [];
  const run = find(tree, "run");
  const list = find(tree, "list");
  const show = snapshot ? find(snapshot, "show") : undefined;
  const diff = snapshot ? find(snapshot, "diff") : undefined;
  const completion = find(tree, "completion");
  const shells = completion ? [...COMPLETION_SHELLS] : [];
  const rootFlags = "-i --interactive -h --help";
  const refFlags = allFlags(tree)
    .filter((flag) => flag.kind === "ref")
    .map((flag) => flag.long);
  const pathFlags = allFlags(tree)
    .filter((flag) => flag.kind === "path")
    .map((flag) => flag.long);
  const countFlags = allFlags(tree)
    .filter((flag) => flag.kind === "count")
    .map((flag) => flag.long);

  return [
    "#compdef mensura",
    "local cur prev c1 c2",
    "cur=${words[CURRENT]}",
    "prev=${words[CURRENT-1]}",
    "c1=${words[2]}",
    "c2=${words[3]}",
    "case $prev in",
    `  ${flagCase(refFlags)}) _values 'ref' ${words(refs)}; return ;;`,
    `  ${flagCase(pathFlags)}) _files; return ;;`,
    `  ${flagCase(countFlags)}) return ;;`,
    "esac",
    "if [[ $cur == -* ]]; then",
    "  if (( CURRENT == 2 )); then",
    `    _values 'flag' ${rootFlags}`,
    "    return",
    "  fi",
    "  case $c1 in",
    `    run) _values 'flag' ${words(flagNames(run))} ;;`,
    `    list) _values 'flag' ${words(flagNames(list))} ;;`,
    "    snapshot)",
    "      case $c2 in",
    `        show) _values 'flag' ${words(flagNames(show))} ;;`,
    `        diff) _values 'flag' ${words(flagNames(diff))} ;;`,
    "      esac",
    "      ;;",
    "  esac",
    "  return",
    "fi",
    "if (( CURRENT == 2 )); then",
    `  _values 'command' ${words(commands)}`,
    "  return",
    "fi",
    "case $c1 in",
    `  run) _values 'metric' ${words(metrics)} ;;`,
    "  snapshot)",
    "    if (( CURRENT == 3 )); then",
    `      _values 'subcommand' ${words(snapshotSubs)}`,
    "    elif [[ $c2 == show ]]; then",
    "      if (( CURRENT == 4 )); then",
    `        _values 'metric' ${words(metrics)}`,
    "      else",
    `        _values 'ref' ${words(refs)}`,
    "      fi",
    "    elif [[ $c2 == diff ]]; then",
    `      _values 'metric' ${words(metrics)}`,
    "    fi",
    "    ;;",
    `  completion) _values 'shell' ${words(shells)} ;;`,
    "esac",
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

function emitFishCommand(
  lines: string[],
  node: Tree,
  metrics: string,
  refs: string,
): void {
  const condition = `__fish_seen_subcommand_from ${node.name}`;
  for (const flag of node.flags) {
    const long = flag.long.replace(/^--/, "");
    if (flag.kind === "ref") {
      lines.push(
        `complete -c mensura -n "${condition}" -l ${long} -r -a "${refs}"`,
      );
    } else if (flag.kind === "path") {
      lines.push(`complete -c mensura -n "${condition}" -l ${long} -r -F`);
    } else if (flag.kind === "count") {
      lines.push(`complete -c mensura -n "${condition}" -l ${long} -r`);
    } else {
      lines.push(`complete -c mensura -n "${condition}" -l ${long}`);
    }
  }
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
  for (const child of node.commands) {
    lines.push(`complete -c mensura -n "${condition} && not __fish_seen_subcommand_from ${child.name}" -a "${child.name}"`);
    emitFishCommand(lines, child, metrics, refs);
  }
}
