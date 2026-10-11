import { useCallback, useMemo, useState } from "react";
import { AgentStatus, ChatThread, CustomerDetails } from "@/types/chat";
import { lastActivityOf } from "@/utils/chatFormat";
import type { DropdownOption } from "@/components/atoms/MultiSelectDropdown/MultiSelectDropdown";

/** An agent can have at most this many chats open at once. */
export const MAX_OPEN_CHATS = 4;

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clean = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * State for the support desk.
 *
 *   queued      -> left panel
 *   open        -> right board (removed from the left, max MAX_OPEN_CHATS)
 *   resolved    -> shown nowhere
 *   transferred -> handed to another agent, shown nowhere
 *
 * `sites` are the websites this agent handles; they feed the queue filter.
 * Wire your backend / websocket into the actions below.
 */
export function useChatDesk(
  initial: ChatThread[] | (() => ChatThread[]),
  sites: string[],
  initialStatus: AgentStatus = "available"
) {
  const [threads, setThreads] = useState<ChatThread[]>(initial);
  const [filterSites, setFilterSites] = useState<string[]>([]);
  const [status, setStatus] = useState<AgentStatus>(initialStatus);

  const queue = useMemo(
    () =>
      threads
        .filter((t) => t.state === "queued")
        .sort((a, b) => lastActivityOf(b) - lastActivityOf(a)),
    [threads]
  );

  const open = useMemo(
    () =>
      threads
        .filter((t) => t.state === "open")
        .sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0)),
    [threads]
  );

  const siteOptions: DropdownOption[] = useMemo(
    () => sites.map((site) => ({ label: site, value: site })),
    [sites]
  );

  const siteValue = useMemo(
    () => siteOptions.filter((o) => filterSites.includes(o.value)),
    [siteOptions, filterSites]
  );

  const visibleQueue = useMemo(() => {
    if (siteValue.length === 0) return queue;
    const allowed = new Set(siteValue.map((o) => o.value));
    return queue.filter((t) => allowed.has(t.site));
  }, [queue, siteValue]);

  const setSiteFilter = useCallback((options: DropdownOption[]) => {
    setFilterSites(options.map((o) => o.value));
  }, []);

  /** Moves a queued chat to the board. Ignored when the board is full. */
  const openThread = useCallback((id: string) => {
    setThreads((prev) => {
      if (prev.filter((t) => t.state === "open").length >= MAX_OPEN_CHATS) {
        return prev;
      }
      return prev.map((t) =>
        t.id === id && t.state === "queued"
          ? { ...t, state: "open", openedAt: Date.now(), unread: 0 }
          : t
      );
    });
  }, []);

  const resolveThread = useCallback((id: string) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, state: "resolved", openedAt: undefined } : t
      )
    );
  }, []);

  /** Hands the chat to another agent. Call your API here too. */
  const transferThread = useCallback((id: string, agentId: string) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, state: "transferred", transferredTo: agentId, openedAt: undefined }
          : t
      )
    );
  }, []);

  /** Name / email / phone, all optional. Call your API here too. */
  const updateCustomer = useCallback((id: string, details: CustomerDetails) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
            ...t,
            customer: {
              name: clean(details.name),
              email: clean(details.email),
              phone: clean(details.phone),
            },
          }
          : t
      )
    );
  }, []);

  /** Agent -> customer. Call your API here too. */
  const sendMessage = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
            ...t,
            messages: [
              ...t.messages,
              {
                id: newId(),
                sender: "agent",
                text: trimmed,
                sentAt: new Date().toISOString(),
              },
            ],
          }
          : t
      )
    );
  }, []);

  /** Customer -> agent. Call from your websocket / polling handler. */
  const receiveMessage = useCallback((id: string, text: string) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          typing: false,
          unread: t.state === "open" ? t.unread : t.unread + 1,
          messages: [
            ...t.messages,
            {
              id: newId(),
              sender: "customer",
              text,
              sentAt: new Date().toISOString(),
            },
          ],
        };
      })
    );
  }, []);

  /** Visitor started / stopped typing. Call from your websocket handler. */
  const setTyping = useCallback((id: string, typing: boolean) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, typing } : t)));
  }, []);

  return {
    status,
    setStatus,
    queue: visibleQueue,
    waitingCount: queue.length,
    open,
    openCount: open.length,
    maxOpen: MAX_OPEN_CHATS,
    atCapacity: open.length >= MAX_OPEN_CHATS,
    siteOptions,
    siteValue,
    setSiteFilter,
    openThread,
    resolveThread,
    transferThread,
    updateCustomer,
    sendMessage,
    receiveMessage,
    setTyping,
  };
}