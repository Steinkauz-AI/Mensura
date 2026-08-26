import { useInput, useStdout } from "ink";
import { Box, Text } from "ink";
import { useRef, useState, type JSX } from "react";
import { scrollAction, scrollViewport } from "./scroll.js";

export function ReportScrollView(props: {
  text: string;
  footer: string;
  onQuit: () => void;
}): JSX.Element {
  const { stdout } = useStdout();
  const viewport = scrollViewport(props.text, stdout.rows);
  const [offset, setOffset] = useState(0);
  const maxOffsetRef = useRef(viewport.maxOffset);
  const heightRef = useRef(viewport.height);
  maxOffsetRef.current = viewport.maxOffset;
  heightRef.current = viewport.height;
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  useInput((input, key) => {
    const action = scrollAction(
      input,
      key,
      offsetRef.current,
      maxOffsetRef.current,
      heightRef.current,
    );
    if (!action) return;
    if (action.type === "quit") {
      props.onQuit();
      return;
    }
    setOffset(action.next);
  });

  const view = viewport.lines.slice(offset, offset + viewport.height);
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
