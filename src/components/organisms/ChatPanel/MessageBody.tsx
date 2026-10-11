import ThemedText from "@/components/atoms/ThemedText/ThemedText";
import styles from "./chatPanel.module.scss";

type Segment = { kind: "text" | "code"; value: string };

const FENCE = /```[^\n`]*\n?([\s\S]*?)```/g;

/** Splits "text ```code``` text" into renderable segments. */
const splitFences = (input: string): Segment[] => {
  const out: Segment[] = [];
  let cursor = 0;

  const pushText = (raw: string) => {
    const value = raw.replace(/^\n+|\n+$/g, "");
    if (value) out.push({ kind: "text", value });
  };

  for (const match of input.matchAll(FENCE)) {
    const start = match.index ?? 0;
    pushText(input.slice(cursor, start));
    out.push({ kind: "code", value: match[1].replace(/\n$/, "") });
    cursor = start + match[0].length;
  }
  pushText(input.slice(cursor));
  return out;
};

interface MessageBodyProps {
  text: string;
  /** Agent bubbles are blue in both themes, so their text is fixed white. */
  fromAgent: boolean;
}

const MessageBody = ({ text, fromAgent }: MessageBodyProps) => (
  <>
    {splitFences(text).map((segment, i) =>
      segment.kind === "code" ? (
        <pre key={i} className={styles.code}>
          <code>{segment.value}</code>
        </pre>
      ) : fromAgent ? (
        <span key={i} className={styles.textBlock}>
          {segment.value}
        </span>
      ) : (
        <ThemedText key={i} className={styles.textBlock}>
          {segment.value}
        </ThemedText>
      )
    )}
  </>
);

export default MessageBody;
