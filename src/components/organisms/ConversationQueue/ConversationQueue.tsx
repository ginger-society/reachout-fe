import Avatar from "@/components/atoms/Avatar/Avatar";
import AgentMenu from "@/components/atoms/AgentMenu/AgentMenu";
import PeekButton from "@/components/atoms/PeekButton/PeekButton";
import { MultiSelect, Option } from "@ginger-society/ginger-ui";
import { useNow } from "@/hooks/useNow";
import { AgentProfile, ChatThread } from "@/types/chat";
import { langCode, langName, lastMessageOf, shortAgo } from "@/utils/chatFormat";
import { PeekAnchor } from "@/utils/peek";
import { WAIT_THRESHOLDS_SEC, waitLevel } from "@/utils/waitTime";
import styles from "./conversationQueue.module.scss";

interface ConversationQueueProps {
  agent: AgentProfile;
  onLogout: () => void;
  threads: ChatThread[];
  /** how many are waiting before the website filter is applied */
  waitingCount: number;
  siteOptions: Option[];
  siteValue: Option[];
  onSiteChange: (value: Option[]) => void;
  openCount: number;
  maxOpen: number;
  onOpenThread: (id: string) => void;
  /** chat currently being peeked at (glance or pinned) */
  peekId: string | null;
  /** true when that peek is pinned open rather than a hover glance */
  peekPinned: boolean;
  onPeekGlance: (id: string, anchor: PeekAnchor) => void;
  onPeekGlanceEnd: (id: string) => void;
  onPeekToggle: (id: string, anchor: PeekAnchor) => void;
}

/**
 * Left panel. Always dark, whatever the page theme.
 * Visitors are anonymous here: we show the website, the visitor's language and the message, never a name.
 * Rows turn amber / orange / red the longer a customer has been waiting.
 */
const ConversationQueue = ({
  agent,
  onLogout,
  threads,
  waitingCount,
  siteOptions,
  siteValue,
  onSiteChange,
  openCount,
  maxOpen,
  onOpenThread,
  peekId,
  peekPinned,
  onPeekGlance,
  onPeekGlanceEnd,
  onPeekToggle,
}: ConversationQueueProps) => {
  // 1s tick so the wait timers (and colours) stay live
  const now = useNow(1000);
  const full = openCount >= maxOpen;

  return (
    <aside className={styles.sidebar} aria-label="Waiting conversations">
      <div className={styles.topBar}>
        <AgentMenu agent={agent} onLogout={onLogout} />
      </div>

      <div className={styles.filter}>
        <MultiSelect
          label="Filter by website"
          options={siteOptions}
          value={siteValue}
          onChange={onSiteChange}
          placeholder="All websites"
          theme="dark"
        />
      </div>

      <div
        className={[styles.capacity, full ? styles.capacityFull : ""].join(" ")}
        role="status"
      >
        {full
          ? `${openCount} of ${maxOpen} chats open. You can still peek and send a quick reply.`
          : `${openCount} of ${maxOpen} chats open`}
      </div>

      {threads.length === 0 ? (
        <div className={styles.empty}>
          {waitingCount === 0 ? (
            <>
              <strong>You're all caught up</strong>
              <span>New conversations will appear here.</span>
            </>
          ) : (
            <>
              <strong>No matches</strong>
              <span>Clear the website filter to see everyone waiting.</span>
            </>
          )}
        </div>
      ) : (
        <ul className={styles.list}>
          {threads.map((thread) => {
            const last = lastMessageOf(thread);
            const level = waitLevel(thread, now);
            const peeking = thread.id === peekId;
            const fromAgent = last?.sender === "agent";
            const firstLine = last?.text.split("\n")[0];
            const language = langName(thread.lang);

            return (
              <li
                key={thread.id}
                className={[
                  styles.row,
                  level > 0 ? styles[`wait${level}`] : "",
                  peeking ? styles.peeking : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  className={styles.item}
                  disabled={full}
                  title={full ? "All chat slots are in use. Resolve or transfer a chat first." : undefined}
                  onClick={() => onOpenThread(thread.id)}
                  aria-label={`Pick up chat from ${thread.site}${language ? `, ${language}` : ""}${thread.unread ? `, ${thread.unread} unread` : ""
                    }${level > 0
                      ? `, waiting over ${WAIT_THRESHOLDS_SEC[level - 1]} seconds`
                      : ""
                    }`}
                >
                  <Avatar name={thread.site} />
                  <span className={styles.body}>
                    <span className={styles.site}>
                      {thread.site}
                      {thread.lang && (
                        <span className={styles.lang} title={`Visitor's language: ${language}`}>
                          {langCode(thread.lang)}
                        </span>
                      )}
                    </span>
                    <span className={styles.preview}>
                      {fromAgent ? `You: ${firstLine}` : firstLine}
                    </span>
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.time}>
                      {last ? shortAgo(last.sentAt, now) : ""}
                    </span>
                    {thread.unread > 0 ? (
                      <span className={styles.badge}>
                        {thread.unread > 9 ? "9+" : thread.unread}
                      </span>
                    ) : thread.online ? (
                      <span className={styles.online} title="Online" />
                    ) : null}
                  </span>
                </button>

                {/* Peek is always available, even when every chat slot is taken */}
                <PeekButton
                  className={styles.peekButton}
                  threadId={thread.id}
                  site={thread.site}
                  pinned={peeking && peekPinned}
                  onGlance={(anchor) => onPeekGlance(thread.id, anchor)}
                  onGlanceEnd={() => onPeekGlanceEnd(thread.id)}
                  onToggle={(anchor) => onPeekToggle(thread.id, anchor)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};

export default ConversationQueue;