import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { NotificationContext, Option, SnackbarTimer, useSnackbar } from "@ginger-society/ginger-ui";
import { useNow } from "@/hooks/useNow";
import { ChatMessage, ChatThread, CustomerDetails } from "@/types/chat";
import { getAuthHeader } from "@/utils/agentAuth";
import {
  agentApi,
  baseUrl,
  blankThread,
  customerOf,
  langOf,
  presenceApi,
  statusOf,
  toMessage,
  toThread,
  visitorChannel,
  visitorIdOf,
  type AgentCardInput,
} from "@/utils/chatApi";
import { lastCustomerActivityOf } from "@/utils/chatFormat";
import {
  RPC_WATCH_VISITOR,
  STATE_PUSH_MS,
  TYPING_RESEND_MS,
  TYPING_STOP_MS,
  WATCH_REFRESH_MS,
  type VisitorTabSignal,
} from "@/utils/signals";
import { applyLive, emptyLive, withService, withTabClosed, withTabSignal } from "@/utils/visitorLive";
import { connectSse } from "@/utils/sse";

/** An agent can have at most this many chats open at once. */
export const MAX_OPEN_CHATS = 4;
/** After the visitor ends a chat, it stays on the board this long (with a notice) before it is removed. */
export const CLOSED_CHAT_LINGER_MS = 30_000;
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

// CHANGED: id of THIS browser tab / login of the agent. The same agent may be signed in in several places at once;
// the visitor widget merges them by this id (visible if ANY is visible). Without it every login shares one slot
// on the visitor side and their agent_state signals overwrite each other (online <-> away flipping).
// Kept in sessionStorage so a reload of the dashboard reuses the id instead of leaving a stale one behind.
const AGENT_TAB_KEY = "ginger_agent_tab";
let agentTabId: string | null = null;
const getAgentTabId = (): string => {
  if (agentTabId) return agentTabId;
  try {
    const saved = sessionStorage.getItem(AGENT_TAB_KEY);
    if (saved) return (agentTabId = saved);
    const id = newId();
    sessionStorage.setItem(AGENT_TAB_KEY, id);
    return (agentTabId = id);
  } catch {
    return (agentTabId = newId()); // storage blocked: one id for the lifetime of this page
  }
};

// ───────────────────────── state ─────────────────────────

type State = Record<string, ChatThread>;

type Action =
  | { type: "queue_snapshot"; threads: ChatThread[] }
  | { type: "mine_snapshot"; threads: ChatThread[] }
  | { type: "incoming"; threadId: string; site: string; visitorId?: string; lang?: string; message: ChatMessage; source: "queue" | "mine" }
  | { type: "put"; thread: ChatThread }
  | { type: "assigned"; threadId: string; mine: boolean }
  | { type: "remove"; threadId: string }
  | { type: "visitor_closed"; threadId: string; at: number } // the visitor ended the chat (local clock)
  | { type: "transferred_in"; thread: ChatThread; at: number } // another agent handed us this chat (the server is authoritative)
  | { type: "transferred_out"; threadId: string; to?: unknown } // we handed it over (echo from another tab of ours)
  | { type: "send_start"; threadId: string; message: ChatMessage }
  | { type: "send_ok"; threadId: string; message: ChatMessage }
  | { type: "send_failed"; threadId: string; clientId: string }
  | { type: "presence"; online: Record<string, boolean>; now: number } // presence service verdicts, keyed by thread id
  | { type: "live_tab"; threadId: string; tabId: string; signal: VisitorTabSignal; now: number }
  | { type: "live_tab_closed"; threadId: string; tabId: string; now: number }
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
          ? {
            ...ex,
            site: t.site,
            lang: t.lang ?? ex.lang,
            visitorId: t.visitorId ?? ex.visitorId,
            messages: mergeMessages(ex.messages, t.messages),
          }
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
        else if (ex.state === "transferred") {
          // The server lists it as ours again (handed back to us, or we missed the `transferred_in`): revive it.
          // Resolved / closed threads are never in this snapshot, so "resolved" stays hidden.
          next[t.id] = {
            ...ex,
            state: "open",
            transferredTo: undefined,
            openedAt: ex.openedAt ?? t.openedAt ?? Date.now(),
            unread: 0,
            lang: t.lang ?? ex.lang,
            visitorId: t.visitorId ?? ex.visitorId,
            customer: t.customer,
            messages: mergeMessages(ex.messages, t.messages),
          };
        } else if (!isGone(ex)) {
          next[t.id] = {
            ...ex,
            state: "open",
            lang: t.lang ?? ex.lang,
            visitorId: t.visitorId ?? ex.visitorId,
            customer: t.customer, // the server holds the saved contact card
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
          ...blankThread(a.threadId, a.site, a.visitorId, a.lang),
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
          lang: t.lang ?? a.lang,
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
          lang: ex.lang ?? a.thread.lang,
          visitorId: ex.visitorId ?? a.thread.visitorId,
          state: isGone(ex) ? ex.state : a.thread.state, // never resurrect a thread resolved here
          openedAt: ex.openedAt ?? a.thread.openedAt,
          visitorClosedAt: ex.visitorClosedAt ?? a.thread.visitorClosedAt,
          customer: a.thread.customer, // the server holds the saved contact card
          unread: a.thread.state === "open" ? 0 : ex.unread,
          messages: mergeMessages(ex.messages, a.thread.messages),
        },
      };
    }
    case "transferred_in": {
      // The backend says this chat is ours now. Unlike `put`, this DOES bring back a chat we had earlier
      // transferred away (it can be handed back to us), because the server is the authority on ownership.
      const incoming: ChatThread = {
        ...a.thread,
        state: "open",
        openedAt: a.at,
        unread: 0,
        transferredTo: undefined,
      };
      const ex = s[a.thread.id];
      if (!ex) return { ...s, [a.thread.id]: incoming };
      return {
        ...s,
        [a.thread.id]: {
          ...ex,
          ...incoming,
          // keep what we already know locally about the visitor's live state
          live: ex.live,
          pageUrl: ex.pageUrl || incoming.pageUrl,
          lang: incoming.lang ?? ex.lang,
          visitorId: incoming.visitorId ?? ex.visitorId,
          messages: mergeMessages(ex.messages, incoming.messages),
        },
      };
    }
    case "transferred_out": {
      const t = s[a.threadId];
      if (!t || isGone(t)) return s;
      return {
        ...s,
        [a.threadId]: {
          ...t,
          state: "transferred",
          transferredTo: a.to === undefined || a.to === null ? t.transferredTo : String(a.to),
          openedAt: undefined,
          typing: false,
          draft: "",
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
    case "visitor_closed": {
      const t = s[a.threadId];
      if (!t || isGone(t) || t.visitorClosedAt) return s;
      if (t.state === "queued") {
        // nobody had it: it just leaves the queue (a peek on it closes on its own)
        const { [a.threadId]: _left, ...rest } = s;
        return rest;
      }
      return { ...s, [a.threadId]: { ...t, visitorClosedAt: a.at, typing: false, draft: "" } };
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
      // The presence service only says "reachable or not". Online / away is derived later (applyLive).
      // Only touch threads whose verdict changed (or is online, which refreshes "last seen").
      let next: State | null = null;
      for (const [id, online] of Object.entries(a.online)) {
        const t = s[id];
        if (!t) continue;
        const live = t.live ?? emptyLive();
        if (live.serviceOnline === online && !online) continue;
        if (!next) next = { ...s };
        next[id] = { ...t, live: withService(live, online, a.now) };
      }
      return next ?? s;
    }
    case "live_tab": {
      const t = s[a.threadId];
      if (!t) return s;
      return { ...s, [a.threadId]: { ...t, live: withTabSignal(t.live ?? emptyLive(), a.tabId, a.signal, a.now) } };
    }
    case "live_tab_closed": {
      const t = s[a.threadId];
      if (!t) return s;
      return { ...s, [a.threadId]: { ...t, live: withTabClosed(t.live ?? emptyLive(), a.tabId, a.now) } };
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
  /** Name and picture the visitor sees once you take their chat (sent with POST /assign). */
  profile: AgentCardInput;
}

/**
 * State for the support desk, driven by the reachout-postman backend.
 *
 *   queued      -> unassigned thread, from GET /threads (SSE)         -> left panel
 *   open        -> assigned to this agent, GET /my-threads (SSE)      -> right board (max MAX_OPEN_CHATS)
 *   resolved               -> closed on the backend (POST /threads/<id>/resolve), the visitor is asked for a rating
 *   transferred            -> handed to another agent (POST /threads/<id>/transfer), then hidden locally.
 *                             The other direction arrives on the my-threads stream: `transferred_in` (with the full
 *                             thread) adds the chat to the board, `transferred_out` hides it in our other tabs.
 *
 * The visitor ending the chat arrives as a `visitor_closed` event: a queued thread leaves the queue at once; an open one
 * gets `visitorClosedAt`, the panel shows a notice with a countdown, and CLOSED_CHAT_LINGER_MS later it is hidden
 * (state "resolved", local only: the backend already closed it and never sends it in a snapshot again).
 *
 * Visitor reachability comes from the presence service (channel reachout_visitor_<visitorId>), polled every
 * PRESENCE_POLL_MS. Everything live comes over the notification socket (NotificationContext):
 *   - we call RPC `watch_visitor` on each queued / open visitor every WATCH_REFRESH_MS; the visitor then pushes its
 *     page URL, tab in view and (for open chats) typing + draft. Several tabs are merged in utils/visitorLive.ts.
 *   - we publish agent_typing / agent_state / agent_bye to the visitors of the chats we have open. Each carries
 *     this browser tab's `tab` id, so a visitor can merge several logins of the same agent.
 *
 * The visitor's page language (`lang`) is a thread attribute: it arrives with the thread payload (snapshots, GET /threads/<id>)
 * and with the `thread_new` / `message` events, so no live signal is needed for it.
 *
 * The other direction of the chat needs nothing here: picking a chat up sends `profile` with POST /assign, the backend stores it and
 * streams it to the visitor together with this agent's presence channel (support_<sub>, see AGENT_CHANNEL_PREFIX).
 *
 * Errors and notices (failed send, pick-up conflicts, expired session, lost connection) are shown with ginger-ui's snackbar.
 */
export function useChatDesk({ agentId, orgs = [], profile }: Options) {
  const [state, dispatch] = useReducer(reducer, {} as State);
  const [filterSites, setFilterSites] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const wamp = useContext(NotificationContext);
  const now = useNow(2000);

  const { show } = useSnackbar();
  const showRef = useRef(show); // read through a ref so the callbacks below never go stale
  showRef.current = show;
  const notify = useCallback(
    (message: string) => showRef.current(<div>{message}</div>, SnackbarTimer.Long, true),
    []
  );

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
        if (thread.visitorClosedAt) return; // the visitor already left: nothing to show
        if (assignedAgent === null) dispatch({ type: "put", thread });
        else if (assignedAgent === agentId) {
          dispatch({ type: "transferred_in", thread: { ...thread, state: "open" }, at: Date.now() });
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
      notify(status === 401 || status === 403 ? "Your session has expired. Sign in again." : `Live updates stopped (${status}).`);

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
          dispatch({
            type: "incoming",
            threadId: p.thread_id,
            site: p.org_slug,
            visitorId: visitorIdOf(p),
            lang: langOf(p.lang),
            message,
            source: "queue",
          });
          if (message.seq !== 1 && !stateRef.current[p.thread_id]) void hydrate(p.thread_id); // we missed the start of it
        } else if (name === "assigned") {
          dispatch({ type: "assigned", threadId: p.thread_id, mine: p.agent_id === agentId });
          if (p.agent_id === agentId && !stateRef.current[p.thread_id]) void hydrate(p.thread_id);
        } else if (name === "visitor_closed") {
          dispatch({ type: "visitor_closed", threadId: p.thread_id, at: Date.now() }); // queued: leaves the queue
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
            lang: langOf(p.lang),
            message: toMessage(p.message),
            source: "mine",
          });
          if (!stateRef.current[p.thread_id]) void hydrate(p.thread_id);
        } else if (name === "assigned") {
          dispatch({ type: "assigned", threadId: p.thread_id, mine: true }); // e.g. taken from another tab
          if (!stateRef.current[p.thread_id]) void hydrate(p.thread_id);
        } else if (name === "transferred_in") {
          // Another agent handed us this chat. The event carries the full thread, so no fetch is needed.
          const id: string | undefined = p.thread_id ?? p.thread?.thread_id;
          if (!id) return;
          const alreadyOpen = stateRef.current[id]?.state === "open";
          if (p.thread) {
            dispatch({ type: "transferred_in", thread: toThread(p.thread, "open"), at: Date.now() });
          } else {
            void hydrate(id); // defensive: an event without the thread payload
          }
          if (!alreadyOpen) notify("A chat was transferred to you.");
        } else if (name === "transferred_out") {
          // We handed this chat over (from this or another tab of ours): take it off the board.
          dispatch({ type: "transferred_out", threadId: p.thread_id, to: p.to_agent_id });
        } else if (name === "resolved") {
          dispatch({ type: "patch", threadId: p.thread_id, patch: { state: "resolved", openedAt: undefined } }); // e.g. resolved from another tab
        } else if (name === "visitor_closed") {
          dispatch({ type: "visitor_closed", threadId: p.thread_id, at: Date.now() });
        } else if (name === "visitor_updated") {
          // contact card saved from another tab (or echoed from this one: harmless)
          dispatch({ type: "patch", threadId: p.thread_id, patch: { customer: customerOf(p.visitor) } });
        }
      },
    });

    return () => {
      queue.close();
      mine.close();
    };
  }, [agentId, orgsKey, hydrate, notify]);

  // The streams reconnect on their own; just let the agent know.
  useEffect(() => {
    if (connection === "offline") notify("Connection lost. Reconnecting…");
  }, [connection, notify]);

  // ---- selectors ----
  // The raw state holds time-based live data; `now` (2 s tick) re-derives presence, typing and the draft expiry.
  const threads = useMemo(() => Object.values(state).map((t) => applyLive(t, now)), [state, now]);

  // "threadId|visitorId" pairs for every queued / open thread (visitor id falls back to the thread id).
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

  // Same set plus the level of detail: queued chats get the basics (page, tab in view),
  // open chats also get typing and the live draft. A chat the visitor already left is no longer watched.
  const watchKey = useMemo(
    () =>
      threads
        .filter((t) => (t.state === "queued" || t.state === "open") && !t.visitorClosedAt)
        .map((t) => `${t.id}|${t.visitorId ?? t.id}|${t.state === "open" ? "full" : "basic"}`)
        .sort()
        .join(","),
    [threads]
  );

  // ---- a chat the visitor ended is removed after CLOSED_CHAT_LINGER_MS ----
  const closedKey = useMemo(
    () =>
      threads
        .filter((t) => t.state === "open" && t.visitorClosedAt)
        .map((t) => `${t.id}|${t.visitorClosedAt}`)
        .sort()
        .join(","),
    [threads]
  );

  useEffect(() => {
    if (!closedKey) return;
    const timers = closedKey.split(",").map((entry) => {
      const [id, at] = entry.split("|");
      const wait = Math.max(0, Number(at) + CLOSED_CHAT_LINGER_MS - Date.now());
      return window.setTimeout(
        () => dispatch({ type: "patch", threadId: id, patch: { state: "resolved", openedAt: undefined } }),
        wait
      );
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [closedKey]);

  // ---- visitor presence service: poll now, whenever the set of threads changes, and on an interval ----
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
        if (!cancelled) dispatch({ type: "presence", online, now: Date.now() });
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

  // ---- live: ask every visitor to stream its state to us (RPC). The watch lapses on its own, so we renew it. ----
  const { connected, channel, call, publish, subscribe } = wamp;
  useEffect(() => {
    if (!connected || !watchKey) return;
    const targets = watchKey.split(",").map((entry) => {
      const [threadId, visitorId, level] = entry.split("|");
      return { threadId, visitorId, level };
    });
    const run = () => {
      for (const x of targets) {
        call(visitorChannel(x.visitorId), RPC_WATCH_VISITOR, [], { level: x.level, thread: x.threadId }, 5000).catch(
          () => undefined // visitor offline or not listening: the next round tries again
        );
      }
    };
    run();
    const timer = window.setInterval(run, WATCH_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [connected, call, watchKey]);

  // ---- live: what the visitors push to us (URL, tab in view, typing, draft) ----
  useEffect(() => {
    return subscribe("*", (ev) => {
      const k = ev.kwargs;
      if (!k || typeof k.type !== "string" || !k.type.startsWith("visitor_")) return;
      // the broker stamps who really sent it
      if (ev.caller?.kind !== "visitor") return;
      const tabId = typeof k.tab === "string" ? k.tab : null;
      const threadId = typeof k.thread === "string" ? k.thread : null;
      if (!tabId || !threadId) return;
      const thread = stateRef.current[threadId];
      if (!thread) return;
      // a visitor may only speak for its own thread
      if (ev.caller.sub !== (thread.visitorId ?? thread.id)) return;

      if (k.type === "visitor_tab") {
        dispatch({ type: "live_tab", threadId, tabId, signal: k as unknown as VisitorTabSignal, now: Date.now() });
      } else if (k.type === "visitor_tab_closed") {
        dispatch({ type: "live_tab_closed", threadId, tabId, now: Date.now() });
      }
    });
  }, [subscribe]);

  // ---- live: tell the visitors of our open chats whether this tab is in view, and say goodbye on exit ----
  const openVisitorKey = useMemo(
    () =>
      threads
        .filter((t) => t.state === "open" && !t.visitorClosedAt)
        .map((t) => `${t.id}|${t.visitorId ?? t.id}`)
        .sort()
        .join(","),
    [threads]
  );

  const sendToOpenVisitors = useCallback(
    (payload: Record<string, unknown>) => {
      if (!channel) return;
      for (const t of Object.values(stateRef.current)) {
        if (t.state !== "open" || t.visitorClosedAt) continue;
        // CHANGED: `tab` identifies this login, so the visitor can merge several of them
        publish(visitorChannel(t.visitorId ?? t.id), { ...payload, thread: t.id, from: channel, tab: getAgentTabId() }).catch(
          () => undefined
        );
      }
    },
    [channel, publish]
  );

  useEffect(() => {
    if (!connected || !channel || !openVisitorKey) return;
    const pushState = () => sendToOpenVisitors({ type: "agent_state", visible: document.visibilityState === "visible" });
    const bye = () => sendToOpenVisitors({ type: "agent_bye" });
    pushState();
    const timer = window.setInterval(pushState, STATE_PUSH_MS);
    document.addEventListener("visibilitychange", pushState);
    window.addEventListener("pagehide", bye);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pushState);
      window.removeEventListener("pagehide", bye);
    };
  }, [connected, channel, openVisitorKey, sendToOpenVisitors]);

  // ---- live: the agent is typing a reply ----
  const typingRef = useRef(new Map<string, { timer?: number; lastSent: number; on: boolean }>());

  const sendTyping = useCallback(
    (id: string, typing: boolean) => {
      const t = stateRef.current[id];
      if (!t || !channel || t.visitorClosedAt) return;
      // CHANGED: include this login's tab id
      publish(visitorChannel(t.visitorId ?? t.id), {
        type: "agent_typing",
        typing,
        thread: id,
        from: channel,
        tab: getAgentTabId(),
      }).catch(() => undefined);
    },
    [channel, publish]
  );

  /** Call on every change of the reply box. Throttled; goes quiet by itself after TYPING_STOP_MS. */
  const setAgentTyping = useCallback(
    (id: string, active: boolean) => {
      const entry = typingRef.current.get(id) ?? { lastSent: 0, on: false };
      window.clearTimeout(entry.timer);
      if (active) {
        const t = Date.now();
        if (!entry.on || t - entry.lastSent >= TYPING_RESEND_MS) {
          sendTyping(id, true);
          entry.lastSent = t;
          entry.on = true;
        }
        entry.timer = window.setTimeout(() => {
          entry.on = false;
          sendTyping(id, false);
        }, TYPING_STOP_MS);
      } else if (entry.on) {
        entry.on = false;
        sendTyping(id, false);
      }
      typingRef.current.set(id, entry);
    },
    [sendTyping]
  );

  useEffect(() => {
    const map = typingRef.current;
    return () => map.forEach((e) => window.clearTimeout(e.timer));
  }, []);

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

  const siteOptions: Option[] = useMemo(() => {
    const all = new Set([...orgs, ...threads.map((t) => t.site), ...filterSites]);
    return [...all].sort().map((site) => ({ label: site, value: site }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgsKey, threads, filterSites]);

  const siteValue = useMemo(() => siteOptions.filter((o) => filterSites.includes(String(o.value))), [siteOptions, filterSites]);

  const visibleQueue = useMemo(() => {
    if (siteValue.length === 0) return queue;
    const allowed = new Set(siteValue.map((o) => String(o.value)));
    return queue.filter((t) => allowed.has(t.site));
  }, [queue, siteValue]);

  const setSiteFilter = useCallback((options: Option[]) => setFilterSites(options.map((o) => String(o.value))), []);

  // ---- actions ----
  /** Picks up a queued chat: POST /assign/{id}. Ignored when the board is full. */
  const openThread = useCallback(
    async (id: string) => {
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
          notify("Another agent already picked up that chat.");
        } else if (code === 410 || code === 404) {
          dispatch({ type: "remove", threadId: id });
          notify("That chat has expired or the visitor already left.");
        } else {
          notify("Could not pick up the chat. Try again.");
        }
      } finally {
        assigning.current.delete(id);
      }
    },
    [notify]
  );

  /** Agent -> visitor: POST /threads/{id}/messages. Shown at once; retried with the same id, so never duplicated. */
  const sendMessage = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (stateRef.current[id]?.visitorClosedAt) return; // the visitor left: nobody to read it
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
            if (code === 403) notify("That chat is assigned to another agent.");
            else if (code === 410) {
              // expired, resolved, or the visitor closed it while this was in flight
              notify("That chat has ended. The message was not delivered.");
            } else if (code === 429) notify("This chat reached its message limit.");
            else notify("A message could not be sent.");
            return;
          }
        }
      })();
    },
    [notify]
  );

  /** The agent has seen the messages (e.g. via peek) without picking the chat up. */
  const markRead = useCallback((id: string) => {
    const t = stateRef.current[id];
    if (t && t.unread > 0) dispatch({ type: "patch", threadId: id, patch: { unread: 0 } });
  }, []);

  /**
   * Closes the chat on the backend first and only then hides it, so a failed call never leaves a chat that looks
   * resolved here but comes back on reload. An already expired chat (404 / 410) is simply hidden.
   */
  const resolveThread = useCallback(
    async (id: string) => {
      try {
        await agentApi.resolve(id);
      } catch (e) {
        const code = statusOf(e);
        if (code !== 404 && code !== 410) {
          notify(code === 403 ? "That chat is assigned to another agent." : "The chat could not be resolved. Try again.");
          return;
        }
      }
      dispatch({ type: "patch", threadId: id, patch: { state: "resolved", openedAt: undefined } });
    },
    [notify]
  );

  /** "Remove now" on the visitor-left notice: the backend already closed the chat, so this is local only. */
  const dismissClosedThread = useCallback((id: string) => {
    dispatch({ type: "patch", threadId: id, patch: { state: "resolved", openedAt: undefined } });
  }, []);

  /**
   * Hands the chat to another agent (POST /threads/{id}/transfer), then hides it here. Same pattern as resolveThread:
   * a failed backend call keeps the chat open. The new owner's board gets it through their `transferred_in` event.
   */
  const transferThread = useCallback(
    async (id: string, targetAgentId: string) => {
      try {
        await agentApi.transfer(id, targetAgentId);
      } catch (e) {
        const code = statusOf(e);
        if (code !== 404 && code !== 410) {
          notify(
            code === 403
              ? "That chat is assigned to another agent."
              : code === 409
                ? "That agent can't take the chat right now."
                : "The chat could not be transferred. Try again."
          );
          return;
        }
      }
      dispatch({ type: "patch", threadId: id, patch: { state: "transferred", transferredTo: targetAgentId, openedAt: undefined } });
    },
    [notify]
  );

  /**
   * PATCH /threads/{id}/visitor. Resolves with null on success (the card is replaced by what the server stored)
   * or with a message the caller shows in a snackbar. Nothing changes locally on failure.
   */
  const updateCustomer = useCallback(async (id: string, details: CustomerDetails): Promise<string | null> => {
    try {
      const customer = await agentApi.updateVisitor(id, details);
      dispatch({ type: "patch", threadId: id, patch: { customer } });
      return null;
    } catch (e) {
      const code = statusOf(e);
      if (code === 400) return "The server rejected those details. Check the email and phone number.";
      if (code === 403) return "That chat is assigned to another agent.";
      if (code === 404 || code === 410) return "That chat has expired, so the details could not be saved.";
      if (code === 401) return "Your session has expired. Sign in again.";
      return "Could not save the details. Try again.";
    }
  }, []);

  return {
    /** every thread, whatever its state (used to look up the peeked chat) */
    threads,
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
    dismissClosedThread,
    transferThread,
    updateCustomer,
    markRead,
    sendMessage,
    /** tell the visitor the agent is typing in this chat (call on every change of the reply box) */
    setAgentTyping,
    connection,
  };
}