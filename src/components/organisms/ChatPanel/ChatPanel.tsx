import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FaEllipsisH,
  FaExternalLinkAlt,
  FaPaperPlane,
} from "react-icons/fa";
import Avatar from "@/components/atoms/Avatar/Avatar";
import ThemedText from "@/components/atoms/ThemedText/ThemedText";
import { useDismissable } from "@/hooks/useDismissable";
import { CLOSED_CHAT_LINGER_MS } from "@/hooks/useChatDesk";
import { useNow } from "@/hooks/useNow";
import { ChatThread, CustomerDetails } from "@/types/chat";
import type { TransferTarget } from "@/utils/chatApi";
import { clockTime, displayName, isHttpUrl, langName, prettyUrl } from "@/utils/chatFormat";
import CustomerDetailsModal from "./CustomerDetailsModal";
import MessageBody from "./MessageBody";
import TransferChatModal from "./TransferChatModal";
import styles from "./chatPanel.module.scss";
import live from "./liveInfo.module.scss";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

const AWAY_COLOR = "#f59e0b";

/** How long a new customer message keeps its tint (the fade-out itself is a CSS transition). */
const FRESH_MS = 6000;

interface ChatPanelProps {
  thread: ChatThread;
  /** loads the agents that are online right now (used when the transfer modal opens) */
  loadTransferTargets: () => Promise<TransferTarget[]>;
  onSend: (id: string, text: string) => void;
  /** the agent is typing (true) or stopped / sent (false): the visitor sees a typing indicator */
  onTyping: (id: string, typing: boolean) => void;
  /** saves the contact card. Resolves with null on success, or an error message for the form */
  onUpdateCustomer: (id: string, details: CustomerDetails) => Promise<string | null>;
  onTransfer: (id: string, agentId: string) => void;
  onResolve: (id: string) => void;
  /** "Remove now" on the visitor-left notice */
  onDismissClosed: (id: string) => void;
}

/** "The visitor closed this chat" with a live countdown until the thread is removed. */
const ClosedNotice = ({
  closedAt,
  onDismiss,
}: {
  closedAt: number;
  onDismiss: () => void;
}) => {
  const now = useNow(1000);
  const left = Math.max(0, Math.ceil((closedAt + CLOSED_CHAT_LINGER_MS - now) / 1000));
  return (
    <div className={live.closedNotice} role="status">
      <span>The visitor closed this chat.</span>
      <span aria-hidden="true">Removing in {left}s</span>
      <button type="button" className={live.closedDismiss} onClick={onDismiss}>
        Remove now
      </button>
    </div>
  );
};

const ChatPanel = ({
  thread,
  loadTransferTargets,
  onSend,
  onTyping,
  onUpdateCustomer,
  onTransfer,
  onResolve,
  onDismissClosed,
}: ChatPanelProps) => {
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"details" | "transfer" | null>(null);
  /** ids of customer messages that arrived while this panel was open: tinted, then faded */
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useDismissable<HTMLDivElement>(menuOpen, () => setMenuOpen(false));
  const seenIds = useRef<Set<string> | null>(null);
  const freshTimers = useRef<number[]>([]);

  const closedAt = thread.visitorClosedAt;
  const closed = closedAt !== undefined;
  const name = displayName(thread);
  const presence = closed ? "offline" : thread.presence ?? (thread.online ? "online" : "offline");
  const presenceLabel = closed
    ? "Left the chat"
    : presence === "online"
      ? "Online"
      : presence === "away"
        ? "Away"
        : "Offline";
  const tabs = closed ? 0 : thread.tabCount ?? 0;

  // Tint new customer messages. The history that is already there when the panel mounts is not "new".
  useEffect(() => {
    const ids = thread.messages.map((m) => m.id);
    if (seenIds.current === null) {
      seenIds.current = new Set(ids);
      return;
    }
    const seen = seenIds.current;
    const added = thread.messages.filter((m) => !seen.has(m.id) && m.sender === "customer");
    ids.forEach((id) => seen.add(id));
    if (added.length === 0) return;

    setFresh((prev) => new Set([...prev, ...added.map((m) => m.id)]));
    added.forEach((m) => {
      freshTimers.current.push(
        window.setTimeout(() => {
          setFresh((prev) => {
            const next = new Set(prev);
            next.delete(m.id);
            return next;
          });
        }, FRESH_MS)
      );
    });
  }, [thread.messages]);

  useEffect(() => {
    const timers = freshTimers.current;
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  // Jump to the newest message (or the typing indicator / live draft / closed notice)
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length, thread.typing, thread.draft, closed]);

  // Ready to type as soon as the chat lands on the board
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Grow the textarea with its content (capped)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  const submit = () => {
    if (closed) return;
    const text = draft.trim();
    if (!text) return;
    onSend(thread.id, text);
    onTyping(thread.id, false);
    setDraft("");
  };

  // Enter adds a new line (default). Ctrl+Enter / Cmd+Enter sends.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const pickMenuItem = (target: "details" | "transfer") => {
    setMenuOpen(false);
    setModal(target);
  };

  return (
    <section className={styles.panel} aria-label={`Chat with ${name}`}>
      <header className={styles.header}>
        <Avatar name={thread.customer.name} color={thread.color} />

        <div className={styles.who}>
          <div className={styles.nameRow}>
            <span
              className={[styles.presence, presence === "online" ? styles.presenceOn : ""].join(" ")}
              style={presence === "away" ? { background: AWAY_COLOR } : undefined}
              role="img"
              aria-label={presenceLabel}
            />
            <ThemedText className={styles.name}>{name}</ThemedText>
            <span className={live.statusLabel}>
              {presenceLabel}
              {tabs > 1 ? ` · ${tabs} tabs` : ""}
              {thread.lang ? ` · ${langName(thread.lang)}` : ""}
            </span>
          </div>
          {isHttpUrl(thread.pageUrl) ? (
            <a
              className={styles.url}
              href={thread.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the page the visitor is on, in a new tab"
              aria-label={`Open ${prettyUrl(thread.pageUrl)} in a new tab`}
            >
              <span className={styles.urlText}>{prettyUrl(thread.pageUrl)}</span>
              <FaExternalLinkAlt className={styles.urlIcon} aria-hidden="true" />
            </a>
          ) : (
            <span className={styles.urlPlain}>{thread.pageUrl || "Page not reported yet"}</span>
          )}
        </div>

        <div className={styles.menuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`More actions for ${name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <FaEllipsisH />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => pickMenuItem("details")}
              >
                Edit customer details
              </button>
              {!closed && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => pickMenuItem("transfer")}
                  >
                    Transfer to another agent
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onResolve(thread.id);
                    }}
                  >
                    Resolve conversation
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className={styles.log} ref={logRef} role="log" aria-live="polite">
        {thread.messages.map((message) => {
          const fromAgent = message.sender === "agent";
          return (
            <div
              key={message.id}
              className={[styles.row, fromAgent ? styles.rowAgent : ""].join(" ")}
            >
              <div
                className={[
                  styles.bubble,
                  fromAgent ? styles.bubbleAgent : styles.bubbleCustomer,
                  !fromAgent && fresh.has(message.id) ? styles.bubbleFresh : "",
                ].join(" ")}
              >
                <MessageBody text={message.text} fromAgent={fromAgent} />
              </div>
              <span className={styles.stamp}>
                {message.status === "sending" ? "Sending…" : message.status === "failed" ? "Not sent" : clockTime(message.sentAt)}
              </span>
            </div>
          );
        })}

        {/* What the visitor is typing right now: plain live text, no bubble */}
        {thread.draft ? (
          <div className={live.draftRow}>
            <span className={live.draftLabel}>{name} is typing…</span>
            <ThemedText className={live.draftText}>{thread.draft}</ThemedText>
          </div>
        ) : (
          thread.typing && (
            <div className={styles.row}>
              <div className={[styles.bubble, styles.bubbleCustomer, styles.typing].join(" ")}>
                <span className={styles.srOnly}>{name} is typing</span>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            </div>
          )
        )}

        {closed && (
          <ClosedNotice closedAt={closedAt} onDismiss={() => onDismissClosed(thread.id)} />
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          rows={2}
          value={draft}
          disabled={closed}
          placeholder={closed ? "The visitor has left this chat" : "Type a message..."}
          aria-label={`Message ${name}`}
          onChange={(e) => {
            setDraft(e.target.value);
            onTyping(thread.id, e.target.value.trim().length > 0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className={styles.composerFooter}>
          <span className={styles.hint}>{isMac ? "Cmd" : "Ctrl"} + Enter to send</span>
          <button
            type="button"
            className={[styles.iconButton, styles.send].join(" ")}
            aria-label="Send message"
            disabled={closed || !draft.trim()}
            onClick={submit}
          >
            <FaPaperPlane />
          </button>
        </div>
      </div>

      {modal === "details" && (
        <CustomerDetailsModal
          initial={thread.customer}
          onSave={(details) => onUpdateCustomer(thread.id, details)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "transfer" && (
        <TransferChatModal
          loadTargets={loadTransferTargets}
          onTransfer={(agentId) => onTransfer(thread.id, agentId)}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
};

export default ChatPanel;