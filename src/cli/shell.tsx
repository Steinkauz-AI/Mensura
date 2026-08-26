import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { catalogChrome, formatLatest, statusColor } from "./shell/catalog.js";
import { applyEffect } from "./shell/effects.js";
import { inspectChrome, inspectRowFocused } from "./shell/inspect-view.js";
import { mapKey } from "./shell/keys.js";
import { ReportScrollView } from "./shell/scroll-view.js";
import { writeStream } from "./shell/io.js";
import { createSession, type ShellKey, type ShellSession } from "./shell/session.js";
import { loadCatalog } from "./shell/store.js";
import { shouldColor } from "./format/index.js";

type Output = { write(text: string): void; isTTY?: boolean };

export type InkShellInput = {
  cwd: string;
  stdout: Output;
  stderr: Output;
  env: NodeJS.ProcessEnv;
};

export async function renderInkShell(input: InkShellInput): Promise<number> {
  const stdout = writeStreamFromOutput(input.stdout) ?? process.stdout;
  const stderr = writeStreamFromOutput(input.stderr) ?? process.stderr;
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

function writeStreamFromOutput(out: Output): NodeJS.WriteStream | undefined {
  return writeStream(out);
}

/** Exported for ink-testing-library coverage of the interactive UI. */
export function Shell(props: {
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
      <ReportScrollView
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
  const chrome = inspectChrome(props.session.state, formatLatest);
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>{chrome.metric}</Text>
          <Text
            color={props.color ? statusColor(chrome.status) : undefined}
            dimColor={props.color && chrome.status === "missing"}
          >
            {chrome.status}
          </Text>
        </Box>
        <Text> </Text>
        {chrome.rows.length === 0 ? (
          <Text dimColor>{chrome.emptyMessage}</Text>
        ) : (
          chrome.rows.map((label, i) => (
            <Text key={props.session.state.snapshots[i]?.file ?? String(i)} inverse={inspectRowFocused(i, props.session.state.inspectCursor)}>
              {label}
            </Text>
          ))
        )}
      </Box>
      {chrome.showNoticeBelow ? <Text color="yellow">{chrome.notice}</Text> : null}
      <Text dimColor>{chrome.footer}</Text>
    </Box>
  );
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

function Cancelable(props: {
  onCancel: () => void;
  children: ReactNode;
}): JSX.Element {
  useInput((input, key) => {
    if (key.escape || input === "q") props.onCancel();
  });
  return <>{props.children}</>;
}
