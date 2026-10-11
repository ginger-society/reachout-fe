import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FaEllipsisH,
  FaExternalLinkAlt,
  FaPaperPlane,
} from "react-icons/fa";
import Avatar from "@/components/atoms/Avatar/Avatar";
import ThemedText from "@/components/atoms/ThemedText/ThemedText";
import { useDismissable } from "@/hooks/useDismissable";
import { AgentProfile, ChatThread, CustomerDetails } from "@/types/chat";
import { clockTime, displayName, isHttpUrl, prettyUrl } from "@/utils/chatFormat";
import CustomerDetailsModal from "./CustomerDetailsModal";
import MessageBody from "./MessageBody";
import TransferChatModal from "./TransferChatModal";
import styles from "./chatPanel.module.scss";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

interface ChatPanelProps {
  thread: ChatThread;
  /** agents this chat can be transferred to */
  agents: AgentProfile[];
  onSend: (id: string, text: string) => void;
  onUpdateCustomer: (id: string, details: CustomerDetails) => void;
  onTransfer: (id: string, agentId: string) => void;
  onResolve: (id: string) => void;
}

const ChatPanel = ({
  thread,
  agents,
  onSend,
  onUpdateCustomer,
  onTransfer,
  onResolve,
}: ChatPanelProps) => {
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"details" | "transfer" | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useDismissable<HTMLDivElement>(menuOpen, () => setMenuOpen(false));

  const name = displayName(thread);

  // Jump to the newest message (or the typing indicator)
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length, thread.typing]);

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
    const text = draft.trim();
    if (!text) return;
    onSend(thread.id, text);
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
              className={[styles.presence, thread.online ? styles.presenceOn : ""].join(" ")}
              role="img"
              aria-label={thread.online ? "Online" : "Offline"}
            />
            <ThemedText className={styles.name}>{name}</ThemedText>
          </div>
          {isHttpUrl(thread.pageUrl) ? (
            <a
              className={styles.url}
              href={thread.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this page in a new tab"
              aria-label={`Open ${prettyUrl(thread.pageUrl)} in a new tab`}
            >
              <span className={styles.urlText}>{prettyUrl(thread.pageUrl)}</span>
              <FaExternalLinkAlt className={styles.urlIcon} aria-hidden="true" />
            </a>
          ) : (
            <span className={styles.urlPlain}>{thread.pageUrl}</span>
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
                ].join(" ")}
              >
                <MessageBody text={message.text} fromAgent={fromAgent} />
              </div>
              <span className={styles.stamp}>{clockTime(message.sentAt)}</span>
            </div>
          );
        })}

        {thread.typing && (
          <div className={styles.row}>
            <div className={[styles.bubble, styles.bubbleCustomer, styles.typing].join(" ")}>
              <span className={styles.srOnly}>{name} is typing</span>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          rows={2}
          value={draft}
          placeholder="Type a message..."
          aria-label={`Message ${name}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className={styles.composerFooter}>
          <span className={styles.hint}>{isMac ? "Cmd" : "Ctrl"} + Enter to send</span>
          <button
            type="button"
            className={[styles.iconButton, styles.send].join(" ")}
            aria-label="Send message"
            disabled={!draft.trim()}
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
          agents={agents}
          onTransfer={(agentId) => onTransfer(thread.id, agentId)}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
};

export default ChatPanel;