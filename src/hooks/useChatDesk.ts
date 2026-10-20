import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { DropdownOption } from "@/components/atoms/MultiSelectDropdown/MultiSelectDropdown";
import { AgentStatus, ChatMessage, ChatThread, CustomerDetails } from "@/types/chat";
import { getAuthHeader } from "@/utils/agentAuth";
import {
  agentApi,
  baseUrl,
  blankThread,
  presenceApi,
  statusOf,
  toMessage,
  toThread,
  visitorIdOf,
  type AgentCardInput,
} from "@/utils/chatApi";
import { lastCustomerActivityOf } from "@/utils/chatFormat";
import { connectSse } from "@/utils/sse";

/** An agent can have at most this many chats open at once. */
export const MAX_OPEN_CHATS = 4;
const MAX_SEND_ATTEMPTS = 4;
const NO_SEQ = Number.MAX_SAFE_INTEGER;
/** How often visitor online status is refreshed from the presence service. */
export const PRESENCE_POLL_MS = 10_000;

export type Connection = "connecting" | "live" | "offline";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const clean = (value?: string) => value?.trim() || undefined;

// ───────────────────────── state ─────────────────────────

type State = Record<string, ChatThread>;

type Action =
  | { type: "queue_snapshot"; threads: ChatThread[] }
  | { type: "mine_snapshot"; threads: ChatThread[] }
  | { type: "incoming"; threadId: string; site: string; visitorId?: string; message: ChatMessage; source: "queue" | "mine" }
  | { type: "put"; thread: ChatThread }
  | { type: "assigned"; threadId: string; mine: boolean }
  | { type: "remove"; threadId: string }
  | { type: "send_start"; threadId: string; message: ChatMessage }
  | { type: "send_ok"; threadId: string; message: ChatMessage }
  | { type: "send_failed"; threadId: string; clientId: string }
  | { type: "presence"; online: Record<string, boolean> } // keyed by thread id
  | { type: "patch"; threadId: string; patch: Partial<ChatThread> };

/** Union by message id (server copy wins, clears "sending"), ordered by server seq; unconfirmed ones stay last. */
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m] as const));
  for (const m of incoming) {
    const prev = byId.get(m.id);
    byId.set(m.id, prev ? { ...prev, ...m, status: undefined } : m);
  }
  return [...byId.values()].sort((a, b) => (a.seq ?? NO_SEQ) - (b.seq ?? NO_SEQ));
}

const isGone = (t: ChatThread) => t.state === "resolved" || t.state === "transferred";

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "queue_snapshot": {
      const next: State = {};
      const fresh = new Map(a.threads.map((t) => [t.id, t] as const));
      for (const [id, t] of Object.entries(s)) if (t.state !== "queued" || fresh.has(id)) next[id] = t; // authoritative
      for (const t of a.threads) {
        const ex = next[t.id];
        next[t.id] = ex
          ? { ...ex, site: t.site, visitorId: t.visitorId ?? ex.visitorId, messages: mergeMessages(ex.messages, t.messages) }
          : t;
      }
      return next;
    }
    case "mine_snapshot": {
      const next: State = {};
      const fresh = new Map(a.threads.map((t) => [t.id, t] as const));
      for (const [id, t] of Object.entries(s)) if (t.state !== "open" || fresh.has(id)) next[id] = t;
      for (const t of a.threads) {
        const ex = next[t.id];
        if (!ex) next[t.id] = t;
        else if (!isGone(ex)) {
          next[t.id] = {
            ...ex,
            state: "open",
            visitorId: t.visitorId ?? ex.visitorId,
            messages: mergeMessages(ex.messages, t.messages),
          };
        }
      }
      return next;
    }
    case "incoming": {
      const t = s[a.threadId];
      if (!t) {
        if (a.source === "mine") return s; // the caller fetches the full thread
        const created: ChatThread = {
          ...blankThread(a.threadId, a.site, a.visitorId),
          messages: [a.message],
          unread: a.message.sender === "customer" ? 1 : 0,
        };
        return { ...s, [a.threadId]: created };
      }
      const duplicate = t.messages.some((m) => m.id === a.message.id);
      return {
        ...s,
        [a.threadId]: {
          ...t,
          visitorId: t.visitorId ?? a.visitorId,
          messages: mergeMessages(t.messages, [a.message]),
          unread: !duplicate && a.message.sender === "customer" && t.state !== "open" ? t.unread + 1 : t.unread,
        },
      };
    }
    case "put": {
      const ex = s[a.thread.id];
      if (!ex) return { ...s, [a.thread.id]: a.thread };
      return {
        ...s,
        [a.thread.id]: {
          ...ex,
          site: a.thread.site,
          visitorId: ex.visitorId ?? a.thread.visitorId,
          state: isGone(ex) ? ex.state : a.thread.state, // never resurrect a thread resolved here
          openedAt: ex.openedAt ?? a.thread.openedAt,
          unread: a.thread.state === "open" ? 0 : ex.unread,
          messages: mergeMessages(ex.messages, a.thread.messages),
        },
      };
    }
    case "assigned": {
      const t = s[a.threadId];
      if (!t || t.state !== "queued") return s;
      if (a.mine) return { ...s, [a.threadId]: { ...t, state: "open", openedAt: t.openedAt ?? Date.now(), unread: 0 } };
      const { [a.threadId]: _taken, ...rest } = s; // someone else took it
      return rest;
    }
    case "remove": {
      const { [a.threadId]: _removed, ...rest } = s;
      return rest;
    }
    case "send_start": {
      const t = s[a.threadId];
      return t ? { ...s, [a.threadId]: { ...t, messages: mergeMessages(t.messages, [a.message]) } } : s;
    }
    case "send_ok": {
      const t = s[a.threadId];
      return t ? { ...s, [a.threadId]: { ...t, messages: mergeMessages(t.messages, [a.message]) } } : s;
    }
    case "send_failed": {
      const t = s[a.threadId];
      if (!t) return s;
      const messages = t.messages.map((m) => (m.id === a.clientId && m.status ? { ...m, status: "failed" as const } : m));
      return { ...s, [a.threadId]: { ...t, messages } };
    }
    case "presence": {
      // Only touch threads whose status actually changed; same state object = no re-render.
      let next: State | null = null;
      for (const [id, online] of Object.entries(a.online)) {
        const t = s[id];
        if (!t || t.online === online) continue;
        if (!next) next = { ...s };
        next[id] = { ...t, online };
      }
      return next ?? s;
    }
    case "patch": {
      const t = s[a.threadId];
      return t ? { ...s, [a.threadId]: { ...t, ...a.patch } } : s;
    }
  }
}

const parse = (data: string): any => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

// ───────────────────────── hook ─────────────────────────

interface Options {
  /** numeric agent PK (token claim `user_id`) */
  agentId: number;
  /**
   * Org slugs this agent handles. Sent to GET /threads as ?orgs=… Empty = every org (until the backend
   * restricts it per agent). Slugs only: lowercase letters, digits, - and _.
   */
  orgs?: string[];
  initialStatus?: AgentStatus;
  /** Name and picture the visitor sees once you take their chat (sent with POST /assign). */
  profile: AgentCardInput;
}

/**
 * State for the support desk, driven by the reachout-postman backend.
 *
 *   queued      -> unassigned thread, from GET /threads (SSE)         -> left panel
 *   open        -> assigned to this agent, GET /my-threads (SSE)      -> right board (max MAX_OPEN_CHATS)
 *   resolved               -> closed on the backend (POST /threads/<id>/resolve), the visitor is asked for a rating
 *   transferred            -> hidden locally (NO backend endpoint yet, see TODOs)
 *
 * Visitor online status comes from the presence service (channel reachout_visitor_<visitorId>),
 * polled every PRESENCE_POLL_MS for every queued / open thread that has a visitor id.
 *
 * The other direction needs nothing here: picking a chat up sends `profile` with POST /assign, the backend stores it and
 * streams it to the visitor together with this agent's presence channel (support_<sub>, see AGENT_CHANNEL_PREFIX).
 */
export function useChatDesk({ agentId, orgs = [], initialStatus = "available", profile }: Options) {
  const [state, dispatch] = useReducer(reducer, {} as State);
  const [filterSites, setFilterSites] = useState<string[]>([]);
  const [status, setStatus] = useState<AgentStatus>(initialStatus);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const assigning = useRef(new Set<string>());
  const profileRef = useRef(profile); // read at pick-up time, so openThread keeps a stable identity
  profileRef.current = profile;
  const orgsKey = orgs.join(",");

  // ---- full thread fetch (a message arrived for a thread we have no history for) ----
  const hydrate = useCallback(
    async (id: string) => {
      try {
        const { thread, assignedAgent } = await agentApi.get(id);
        if (assignedAgent === null) dispatch({ type: "put", thread });
        else if (assignedAgent === agentId) {
          dispatch({ type: "put", thread: { ...thread, state: "open", openedAt: thread.openedAt ?? Date.now(), unread: 0 } });
        }
        // assigned to someone else: not ours to show
      } catch {
        /* the next snapshot will catch up */
      }
    },
    [agentId]
  );

  // ---- the two SSE streams ----
  useEffect(() => {
    const live = { queue: false, mine: false };
    const mark = (key: "queue" | "mine", up: boolean) => {
      live[key] = up;
      setConnection(live.queue && live.mine ? "live" : up ? "connecting" : "offline");
    };
    const headers = (): Record<string, string> => {
      const auth = getAuthHeader();
      return auth ? { Authorization: auth } : {};
    };
    const fatal = (status: number) =>
      setError(status === 401 || status === 403 ? "Your session has expired. Sign in again." : `Live updates stopped (${status}).`);

    const queue = connectSse({
      url: `${baseUrl()}/threads${orgsKey ? `?orgs=${encodeURIComponent(orgsKey)}` : ""}`,
      headers,
      onOpen: () => mark("queue", true),
      onDisconnect: () => mark("queue", false),
      onFatal: fatal,
      onEvent: (name, data) => {
        const p = parse(data);
        if (!p) return;
        if (name === "snapshot") {
          dispatch({ type: "queue_snapshot", threads: (p.threads ?? []).map((t: unknown) => toThread(t, "queued")) });
        } else if ((name === "thread_new" || name === "message") && p.message) {
          const message = toMessage(p.message);
          dispatch({ type: "incoming", threadId: p.thread_id, site: p.org_slug, visitorId: visitorIdOf(p), message, source: "queue" });
          if (message.seq !== 1 && !stateRef.current[p.thread_id]) void hydrate(p.thread_id); // we missed the start of it
        } else if (name === "assigned") {
          dispatch({ type: "assigned", threadId: p.thread_id, mine: p.agent_id === agentId });
          if (p.agent_id === agentId && !stateRef.current[p.thread_id]) void hydrate(p.thread_id);
        }
      },
    });

    const mine = connectSse({
      url: `${baseUrl()}/my-threads`,
      headers,
      onOpen: () => mark("mine", true),
      onDisconnect: () => mark("mine", false),
      onFatal: fatal,
      onEvent: (name, data) => {
        const p = parse(data);
        if (!p) return;
        if (name === "snapshot") {
          dispatch({ type: "mine_snapshot", threads: (p.threads ?? []).map((t: unknown) => toThread(t, "open")) });
        } else if ((name === "message" || name === "thread_new") && p.message) {
          dispatch({
            type: "incoming",
            threadId: p.thread_id,
            site: p.org_slug,
            visitorId: visitorIdOf(p),
            message: toMessage(p.message),
            source: "mine",
          });
          if (!stateRef.current[p.thread_id]) void hydrate(p.thread_id);
        } else if (name === "assigned") {
          dispatch({ type: "assigned", threadId: p.thread_id, mine: true }); // e.g. taken from another tab
          if (!stateRef.current[p.thread_id]) void hydrate(p.thread_id);
        } else if (name === "resolved") {
          dispatch({ type: "patch", threadId: p.thread_id, patch: { state: "resolved", openedAt: undefined } }); // e.g. resolved from another tab
        }
      },
    });

    return () => {
      queue.close();
      mine.close();
    };
  }, [agentId, orgsKey, hydrate]);

  // ---- selectors ----
  const threads = useMemo(() => Object.values(state), [state]);

  // "threadId|visitorId" pairs for every queued / open thread that has a visitor id.
  // Sorted so the key is stable and the poll only restarts when the set really changes.
  const trackedKey = useMemo(
    () =>
      threads
        .filter((t) => t.state === "queued" || t.state === "open")
        .map((t) => `${t.id}|${t.visitorId ?? t.id}`)
        .sort()
        .join(","),
    [threads]
  );

  // ---- visitor presence: poll now, whenever the set of threads changes, and on an interval ----
  useEffect(() => {
    if (!trackedKey) return;
    const targets = trackedKey.split(",").map((pair) => {
      const [threadId, visitorId] = pair.split("|");
      return { threadId, visitorId };
    });
    let cancelled = false;
    let busy = false;

    const poll = async () => {
      if (busy) return; // never overlap polls
      busy = true;
      try {
        const online = await presenceApi.onlineMap(targets);
        if (!cancelled) dispatch({ type: "presence", online });
      } catch {
        /* keep the last known status; the next tick tries again */
      } finally {
        busy = false;
      }
    };

    void poll();
    const timer = window.setInterval(poll, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [trackedKey]);

  const queue = useMemo(
    () =>
      threads
        .filter((t) => t.state === "queued")
        .sort((a, b) => lastCustomerActivityOf(b) - lastCustomerActivityOf(a)),
    [threads]
  );

  const open = useMemo(
    () => threads.filter((t) => t.state === "open").sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0)),
    [threads]
  );

  const siteOptions: DropdownOption[] = useMemo(() => {
    const all = new Set([...orgs, ...threads.map((t) => t.site), ...filterSites]);
    return [...all].sort().map((site) => ({ label: site, value: site }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgsKey, threads, filterSites]);

  const siteValue = useMemo(() => siteOptions.filter((o) => filterSites.includes(o.value)), [siteOptions, filterSites]);

  const visibleQueue = useMemo(() => {
    if (siteValue.length === 0) return queue;
    const allowed = new Set(siteValue.map((o) => o.value));
    return queue.filter((t) => allowed.has(t.site));
  }, [queue, siteValue]);

  const setSiteFilter = useCallback((options: DropdownOption[]) => setFilterSites(options.map((o) => o.value)), []);

  // ---- actions ----
  /** Picks up a queued chat: POST /assign/{id}. Ignored when the board is full. */
  const openThread = useCallback(async (id: string) => {
    const t = stateRef.current[id];
    if (!t || t.state !== "queued" || assigning.current.has(id)) return;
    const openNow = Object.values(stateRef.current).filter((x) => x.state === "open").length;
    if (openNow + assigning.current.size >= MAX_OPEN_CHATS) return;

    assigning.current.add(id);
    try {
      dispatch({ type: "put", thread: await agentApi.assign(id, profileRef.current) });
    } catch (e) {
      const code = statusOf(e);
      if (code === 409) {
        dispatch({ type: "remove", threadId: id });
        setError("Another agent already picked up that chat.");
      } else if (code === 410 || code === 404) {
        dispatch({ type: "remove", threadId: id });
        setError("That chat has expired.");
      } else {
        setError("Could not pick up the chat. Try again.");
      }
    } finally {
      assigning.current.delete(id);
    }
  }, []);

  /** Agent -> visitor: POST /threads/{id}/messages. Shown at once; retried with the same id, so never duplicated. */
  const sendMessage = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const clientId = newId();
    dispatch({
      type: "send_start",
      threadId: id,
      message: { id: clientId, sender: "agent", text: trimmed, sentAt: new Date().toISOString(), status: "sending" },
    });

    void (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          dispatch({ type: "send_ok", threadId: id, message: await agentApi.reply(id, clientId, trimmed) });
          return;
        } catch (e) {
          const code = statusOf(e);
          const retryable = code === undefined || code >= 500 || code === 408;
          if (retryable && attempt < MAX_SEND_ATTEMPTS) {
            await sleep(Math.min(1000 * 2 ** attempt, 8000));
            continue;
          }
          dispatch({ type: "send_failed", threadId: id, clientId });
          if (code === 403) setError("That chat is assigned to another agent.");
          else if (code === 410) {
            dispatch({ type: "remove", threadId: id });
            setError("That chat has expired.");
          } else if (code === 429) setError("This chat reached its message limit.");
          else setError("A message could not be sent.");
          return;
        }
      }
    })();
  }, []);

  /** The agent has seen the messages (e.g. via peek) without picking the chat up. */
  const markRead = useCallback((id: string) => {
    const t = stateRef.current[id];
    if (t && t.unread > 0) dispatch({ type: "patch", threadId: id, patch: { unread: 0 } });
  }, []);

  /**
   * Closes the chat on the backend first and only then hides it, so a failed call never leaves a chat that looks
   * resolved here but comes back on reload. An already expired chat (404 / 410) is simply hidden.
   */
  const resolveThread = useCallback(async (id: string) => {
    try {
      await agentApi.resolve(id);
    } catch (e) {
      const code = statusOf(e);
      if (code !== 404 && code !== 410) {
        setError(code === 403 ? "That chat is assigned to another agent." : "The chat could not be resolved. Try again.");
        return;
      }
    }
    dispatch({ type: "patch", threadId: id, patch: { state: "resolved", openedAt: undefined } });
  }, []);

  // TODO(backend): no endpoint yet. Local only.
  const transferThread = useCallback((id: string, targetAgentId: string) => {
    dispatch({ type: "patch", threadId: id, patch: { state: "transferred", transferredTo: targetAgentId, openedAt: undefined } });
  }, []);

  // TODO(backend): customer details are not stored server-side yet. Local only.
  const updateCustomer = useCallback((id: string, details: CustomerDetails) => {
    dispatch({
      type: "patch",
      threadId: id,
      patch: { customer: { name: clean(details.name), email: clean(details.email), phone: clean(details.phone) } },
    });
  }, []);

  return {
    /** every thread, whatever its state (used to look up the peeked chat) */
    threads,
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
    markRead,
    sendMessage,
    connection,
    error,
    dismissError: () => setError(null),
  };
}