import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import { catalogChrome, formatLatest, statusColor } from "./shell/catalog.js";
import { recoverScreen } from "./shell/screen.js";
import { createSession, type ShellKey, type ShellSession } from "./shell/session.js";
import {
  diffSnapshots,
  generateMetrics,
  loadCatalog,
  loadInspectSnapshots,
  showSnapshot,
} from "./shell/store.js";
import { shouldColor } from "./format/index.js";

type Output = { write(text: string): void; isTTY?: boolean };

export type InkShellInput = {
  cwd: string;
  stdout: Output;
  stderr: Output;
  env: NodeJS.ProcessEnv;
};


export async function renderInkShell(input: InkShellInput): Promise<number> {
  const stdout = writeStream(input.stdout) ?? process.stdout;
  const stderr = writeStream(input.stderr) ?? process.stderr;
  const instance = render(
    <Shell cwd={input.cwd} env={input.env} output={input.stdout} />,
    { stdout, stderr, exitOnCtrlC: true, patchConsole: true },
  );
  try {
    await instance.waitUntilExit();
    return 0;
  } catch {
    return 1;
  }
}

function writeStream(out: Output): NodeJS.WriteStream | undefined {
  if ("fd" in out || "on" in out) return out as NodeJS.WriteStream;
  return undefined;
}

function Shell(props: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  output: Output;
}): JSX.Element {
  const { exit } = useApp();
  const sessionRef = useRef<ShellSession | null>(null);
  const [, bump] = useState(0);
  const color = shouldColor(props.output, props.env);

  useEffect(() => {
    let cancelled = false;
    void loadCatalog(props.cwd).then(
      (rows) => {
        if (cancelled) return;
        sessionRef.current = createSession(rows);
        bump((n) => n + 1);
      },
      (err: unknown) => {
        if (cancelled) return;
        sessionRef.current = createSession([]);
        sessionRef.current.openError(err instanceof Error ? err.message : String(err));
        bump((n) => n + 1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [props.cwd]);

  const session = sessionRef.current;
  if (!session) {
    return (
      <Cancelable onCancel={() => exit()}>
        <Text>Loading…</Text>
      </Cancelable>
    );
  }

  const dispatch = (key: ShellKey): void => {
    const effect = session.handle(key);
    if (effect.type === "quit") {
      exit();
      return;
    }
    bump((n) => n + 1);
    void applyEffect(session, effect, props, () => bump((n) => n + 1));
  };

  if (session.state.screen === "report") {
    return (
      <Scrollable
        text={session.state.reportText}
        footer="↑↓ scroll  q back"
        onQuit={() => {
          session.handle("quit");
          bump((n) => n + 1);
        }}
      />
    );
  }
  if (session.state.screen === "error") {
    return (
      <Cancelable
        onCancel={() => {
          session.handle("quit");
          bump((n) => n + 1);
        }}
      >
        <Box flexDirection="column">
          <Text color="red">{session.state.errorMessage}</Text>
          <Text dimColor>q back</Text>
        </Box>
      </Cancelable>
    );
  }
  if (session.state.screen === "inspect") {
    return <InspectView session={session} onKey={dispatch} color={color} />;
  }
  return <CatalogView session={session} onKey={dispatch} color={color} />;
}

async function applyEffect(
  session: ShellSession,
  effect: ReturnType<ShellSession["handle"]>,
  props: { cwd: string; env: NodeJS.ProcessEnv; output: Output },
  bump: () => void,
): Promise<void> {
  try {
    if (effect.type === "inspect") {
      session.setSnapshots(await loadInspectSnapshots(props.cwd, effect.metric));
      bump();
      return;
    }
    if (effect.type === "show") {
      session.openReport(
        await showSnapshot(props.cwd, effect.metric, effect.ref, props.output, props.env),
      );
      bump();
      return;
    }
    if (effect.type === "diff") {
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
      bump();
      return;
    }
    if (effect.type === "generate") {
      const result = await generateMetrics(props.cwd, effect.ids);
      recoverScreen(props.output);
      session.finishGenerate(result.rows, result.errors);
      bump();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recoverScreen(props.output);
    if (session.state.generating) session.failGenerate(message);
    else session.openError(message);
    bump();
  }
}

function CatalogView(props: {
  session: ShellSession;
  onKey: (key: ShellKey) => void;
  color: boolean;
}): JSX.Element {
  const chrome = catalogChrome(props.session.state);
  useMappedKeys(props.onKey);
  const statusIndex = chrome.columns.findIndex((cell) => cell.trim() === "status");
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Box flexWrap="nowrap">
          <Text bold>{chrome.title}</Text>
          <Text>  </Text>
          <ModeTab label="View" active={chrome.viewActive} />
          <Text dimColor> │ </Text>
          <ModeTab label="Run" active={chrome.runActive} />
        </Box>
        <Text dimColor>{chrome.rollup}</Text>
        <Text> </Text>
        <Box>
          {chrome.header.map((cell, i) => (
            <Text key={`h-${String(i)}`} bold>
              {cell}
              {"  "}
            </Text>
          ))}
        </Box>
        {chrome.lines.map((line, rowIndex) => (
          <Box key={props.session.state.rows[rowIndex]?.id ?? String(rowIndex)}>
            {line.cells.map((cell, i) => (
              <Text
                key={`${String(rowIndex)}-${String(i)}`}
                inverse={line.focused}
                color={props.color ? statusColor(i === statusIndex ? line.status : "") : undefined}
                dimColor={props.color && i === statusIndex && line.status === "missing"}
              >
                {cell}
                {"  "}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      {props.session.state.notice ? <Text color="red">{props.session.state.notice}</Text> : null}
      <Text dimColor>{chrome.footer}</Text>
    </Box>
  );
}

function InspectView(props: {
  session: ShellSession;
  onKey: (key: ShellKey) => void;
  color: boolean;
}): JSX.Element {
  useMappedKeys(props.onKey);
  const { metric, snapshots, inspectCursor, marked, notice, rows } = props.session.state;
  const status = rows.find((row) => row.id === metric)?.status ?? "";
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>{metric}</Text>
          <Text
            color={props.color ? statusColor(status) : undefined}
            dimColor={props.color && status === "missing"}
          >
            {status}
          </Text>
        </Box>
        <Text> </Text>
        {snapshots.length === 0 ? (
          <Text dimColor>{notice ?? "No snapshot"}</Text>
        ) : (
          snapshots.map((snapshot, i) => (
            <Text key={snapshot.file} inverse={i === inspectCursor}>
              {`${marked.includes(snapshot.file) ? "•" : " "} ${snapshotTags(snapshot)}  ${formatLatest(snapshot.timestamp)}  ${snapshot.file}`}
            </Text>
          ))
        )}
      </Box>
      {notice && snapshots.length > 0 ? <Text color="yellow">{notice}</Text> : null}
      <Text dimColor>enter show  d diff vs previous  space mark  q back</Text>
    </Box>
  );
}

function snapshotTags(snapshot: {
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

function ModeTab(props: { label: string; active: boolean }): JSX.Element {
  return (
    <Text inverse={props.active} bold={props.active} dimColor={!props.active}>
      {` ${props.label} `}
    </Text>
  );
}

function useMappedKeys(onKey: (key: ShellKey) => void): void {
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useInput((input, key) => {
    const mapped = mapKey(input, key);
    if (mapped) onKeyRef.current(mapped);
  });
}

function mapKey(input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean; escape: boolean; tab?: boolean }): ShellKey | null {
  if (key.escape || input === "q") return "quit";
  if (key.upArrow) return "up";
  if (key.downArrow) return "down";
  if (key.return) return "enter";
  if (key.tab === true || input === "\t") return "tab";
  if (input === " ") return "space";
  if (input === "a") return "a";
  if (input === "o") return "o";
  if (input === "d") return "d";
  return null;
}

function Scrollable(props: {
  text: string;
  footer: string;
  onQuit: () => void;
}): JSX.Element {
  const { stdout } = useStdout();
  const lines = props.text.split("\n");
  const rows = stdout.rows && stdout.rows > 2 ? stdout.rows : 24;
  const height = rows - 1;
  const maxOffset = Math.max(0, lines.length - height);
  const [offset, setOffset] = useState(0);
  const maxOffsetRef = useRef(maxOffset);
  const heightRef = useRef(height);
  maxOffsetRef.current = maxOffset;
  heightRef.current = height;

  useInput((input, key) => {
    if (key.escape || input === "q") {
      props.onQuit();
      return;
    }
    if (key.upArrow) {
      setOffset((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setOffset((current) => Math.min(maxOffsetRef.current, current + 1));
      return;
    }
    if (key.pageUp) {
      setOffset((current) => Math.max(0, current - heightRef.current));
      return;
    }
    if (key.pageDown) {
      setOffset((current) => Math.min(maxOffsetRef.current, current + heightRef.current));
      return;
    }
    if (key.home) {
      setOffset(0);
      return;
    }
    if (key.end) {
      setOffset(maxOffsetRef.current);
    }
  });

  const view = lines.slice(offset, offset + height);
  return (
    <Box flexDirection="column">
      {view.map((line, i) => (
        <Text key={i} wrap="truncate">
          {line === "" ? " " : line}
        </Text>
      ))}
      <Text dimColor>{props.footer}</Text>
    </Box>
  );
}

function Cancelable(props: {
  onCancel: () => void;
  children: ReactNode;
}): JSX.Element {
  useInput((input, key) => {
    if (key.escape || input === "q") props.onCancel();
  });
  return <>{props.children}</>;
}
