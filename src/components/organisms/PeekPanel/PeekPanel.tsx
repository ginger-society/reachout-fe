import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaCheck, FaExternalLinkAlt, FaTimes } from "react-icons/fa";
import MessageBody from "@/components/organisms/ChatPanel/MessageBody";
import chat from "@/components/organisms/ChatPanel/chatPanel.module.scss";
import { useNow } from "@/hooks/useNow";
import { ChatThread, QuickReply } from "@/types/chat";
import { clockTime, isHttpUrl, prettyUrl } from "@/utils/chatFormat";
import { PeekAnchor, PeekMode } from "@/utils/peek";
import { WAIT_THRESHOLDS_SEC, waitLevel, waitingSeconds } from "@/utils/waitTime";
import styles from "./peekPanel.module.scss";

/** how many recent messages the hover glance shows */
const GLANCE_MESSAGES = 8;

interface PeekPanelProps {
  thread: ChatThread;
  mode: PeekMode;
  anchor: PeekAnchor;
  replies: QuickReply[];
  atCapacity: boolean;
  maxOpen: number;
  /** send a predefined reply; the chat stays in the queue */
  onReply: (id: string, text: string) => void;
  onPickUp: (id: string) => void;
  /** returnFocus is true for Escape / close button, false for an outside click */
  onClose: (returnFocus: boolean) => void;
}

/**
 * A look at a queued chat without taking it.
 *  - glance: read-only, ignores the pointer, gone as soon as the mouse leaves the eye.
 *  - pinned: stays put and shows quick replies. Never uses a chat slot.
 */
const PeekPanel = ({
  thread,
  mode,
  anchor,
  replies,
  atCapacity,
  maxOpen,
  onReply,
  onPickUp,
  onClose,
}: PeekPanelProps) => {
  const pinned = mode === "pinned";
  const now = useNow(1000);
  const panelRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [sentNote, setSentNote] = useState("");
  const [top, setTop] = useState(anchor.top);

  const level = waitLevel(thread, now);
  const seconds = waitingSeconds(thread, now);
  const messages = pinned ? thread.messages : thread.messages.slice(-GLANCE_MESSAGES);

  // Line up with the queue row, but keep the whole card on screen
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const maxTop = window.innerHeight - el.offsetHeight - 12;
    setTop(Math.max(12, Math.min(anchor.top, maxTop)));
  }, [anchor.top, mode, thread.messages.length, replies.length]);

  // Pinning moves focus into the card so replies are keyboard reachable
  useEffect(() => {
    if (pinned) panelRef.current?.focus();
  }, [pinned, thread.id]);

  useEffect(() => {
    setSentNote("");
  }, [thread.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A pinned card closes on a click anywhere else (the eye buttons handle themselves)
  useEffect(() => {
    if (!pinned) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Element;
      if (panelRef.current?.contains(target)) return;
      if (target.closest?.("[data-peek-for]")) return;
      onClose(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [pinned, onClose]);

  // Newest message in view
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.id, thread.messages.length, mode, top]);

  useEffect(() => {
    if (!sentNote) return;
    const id = window.setTimeout(() => setSentNote(""), 2500);
    return () => window.clearTimeout(id);
  }, [sentNote]);

  const sendReply = (reply: QuickReply) => {
    onReply(thread.id, reply.text);
    setSentNote("Reply sent. The chat is still in your queue.");
  };

  const waitLabel =
    seconds === null
      ? "You replied"
      : `Waiting ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}`;

  const placement = {
    "--peek-top": `${top}px`,
    "--peek-left": `${anchor.left}px`,
  } as CSSProperties;

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className={[styles.peek, pinned ? "" : styles.glance].join(" ")}
      style={placement}
      aria-label={`Peek at chat from ${thread.site}`}
      // The glance is a mouse-only convenience; keyboard and screen reader users pin it.
      aria-hidden={pinned ? undefined : true}
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.site}>{thread.site}</span>
          {pinned && isHttpUrl(thread.pageUrl) ? (
            <a
              className={styles.url}
              href={thread.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${prettyUrl(thread.pageUrl)} in a new tab`}
            >
              <span className={styles.urlText}>{prettyUrl(thread.pageUrl)}</span>
              <FaExternalLinkAlt aria-hidden="true" className={styles.urlIcon} />
            </a>
          ) : (
            <span className={styles.urlText}>{prettyUrl(thread.pageUrl)}</span>
          )}
        </div>

        <span
          className={[styles.chip, level > 0 ? styles[`chip${level}`] : ""].join(" ")}
          title={
            level > 0
              ? `Waiting over ${WAIT_THRESHOLDS_SEC[level - 1]} seconds`
              : undefined
          }
        >
          {waitLabel}
        </span>

        {pinned && (
          <button
            type="button"
            className={styles.close}
            onClick={() => onClose(true)}
            aria-label="Close peek"
          >
            <FaTimes />
          </button>
        )}
      </header>

      <div className={styles.log} ref={logRef} role={pinned ? "log" : undefined} aria-live={pinned ? "polite" : undefined}>
        {messages.map((message) => {
          const fromAgent = message.sender === "agent";
          return (
            <div
              key={message.id}
              className={[chat.row, fromAgent ? chat.rowAgent : ""].join(" ")}
            >
              <div
                className={[
                  chat.bubble,
                  fromAgent ? chat.bubbleAgent : chat.bubbleCustomer,
                ].join(" ")}
              >
                <MessageBody text={message.text} fromAgent={fromAgent} />
              </div>
              <span className={chat.stamp}>{clockTime(message.sentAt)}</span>
            </div>
          );
        })}
      </div>

      {pinned ? (
        <>
          <div className={styles.replies}>
            <h3 className={styles.repliesTitle}>Quick replies</h3>
            {replies.length === 0 ? (
              <p className={styles.note}>No quick replies are set up.</p>
            ) : (
              <ul className={styles.replyList}>
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <button
                      type="button"
                      className={styles.reply}
                      onClick={() => sendReply(reply)}
                    >
                      {reply.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className={styles.footer}>
            <span className={styles.status} role="status">
              {sentNote ? (
                <>
                  <FaCheck aria-hidden="true" /> {sentNote}
                </>
              ) : atCapacity ? (
                `All ${maxOpen} chat slots are in use.`
              ) : (
                ""
              )}
            </span>
            <button
              type="button"
              className={styles.pickUp}
              disabled={atCapacity}
              title={atCapacity ? "Resolve or transfer an open chat first" : undefined}
              onClick={() => onPickUp(thread.id)}
            >
              Pick up chat
            </button>
          </footer>
        </>
      ) : (
        <div className={styles.hint}>Click the eye to reply</div>
      )}
    </section>
  );
};

export default PeekPanel;