import Avatar from "@/components/atoms/Avatar/Avatar";
import AgentMenu from "@/components/atoms/AgentMenu/AgentMenu";
import MultiSelectDropdown, {
  DropdownOption,
} from "@/components/atoms/MultiSelectDropdown/MultiSelectDropdown";
import { useNow } from "@/hooks/useNow";
import { AgentProfile, AgentStatus, ChatThread } from "@/types/chat";
import { lastMessageOf, shortAgo } from "@/utils/chatFormat";
import styles from "./conversationQueue.module.scss";

interface ConversationQueueProps {
  agent: AgentProfile;
  status: AgentStatus;
  onStatusChange: (status: AgentStatus) => void;
  onLogout: () => void;
  threads: ChatThread[];
  /** how many are waiting before the website filter is applied */
  waitingCount: number;
  siteOptions: DropdownOption[];
  siteValue: DropdownOption[];
  onSiteChange: (value: DropdownOption[]) => void;
  openCount: number;
  maxOpen: number;
  onOpenThread: (id: string) => void;
}

/**
 * Left panel. Always dark, whatever the page theme.
 * Visitors are anonymous here: we show the website and the message, never a name.
 */
const ConversationQueue = ({
  agent,
  status,
  onStatusChange,
  onLogout,
  threads,
  waitingCount,
  siteOptions,
  siteValue,
  onSiteChange,
  openCount,
  maxOpen,
  onOpenThread,
}: ConversationQueueProps) => {
  const now = useNow();
  const full = openCount >= maxOpen;

  return (
    <aside className={styles.sidebar} aria-label="Waiting conversations">
      <div className={styles.topBar}>
        <AgentMenu
          agent={agent}
          status={status}
          onStatusChange={onStatusChange}
          onLogout={onLogout}
        />
      </div>

      <div className={styles.filter}>
        <MultiSelectDropdown
          ariaLabel="Filter waiting conversations by website"
          placeholder="All websites"
          emptyText="No websites assigned to you"
          options={siteOptions}
          value={siteValue}
          onChange={onSiteChange}
        />
      </div>

      <div
        className={[styles.capacity, full ? styles.capacityFull : ""].join(" ")}
        role="status"
      >
        {full
          ? `${openCount} of ${maxOpen} chats open. Resolve or transfer one to pick up the next.`
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
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  className={styles.item}
                  disabled={full}
                  title={full ? "Resolve or transfer an open chat first" : undefined}
                  onClick={() => onOpenThread(thread.id)}
                  aria-label={`Pick up chat from ${thread.site}${thread.unread ? `, ${thread.unread} unread` : ""
                    }`}
                >
                  <Avatar name={thread.site} />
                  <span className={styles.body}>
                    <span className={styles.site}>{thread.site}</span>
                    <span className={styles.preview}>{last?.text.split("\n")[0]}</span>
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
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};

export default ConversationQueue;