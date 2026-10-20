import { GingerPresence, ReachoutPostmanService } from "@/services";
import { GINGER_SOCIETY_GINGERREACHOUTPOSTMAN_SERVICE } from "@/shared/references";
import { ChatMessage, ChatThread, ThreadState } from "@/types/chat";

/**
 * Presence prefix of the agent's own socket, so their presence channel is support_<sub>. The backend puts that channel
 * in the `assigned` event and the visitor widget asks the presence service whether it is online.
 * Must match AGENT_PRESENCE_PREFIX in the backend; main.tsx uses it as the NotificationProvider channelPrefix.
 */
export const AGENT_CHANNEL_PREFIX = "support";

/** What the visitor sees once the agent takes their chat. The agent id and channel are derived server-side from the token. */
export interface AgentCardInput {
  name: string;
  avatarUrl?: string;
}

export const baseUrl = () => GINGER_SOCIETY_GINGERREACHOUTPOSTMAN_SERVICE().replace(/\/+$/, "");

/** HTTP status of a failed generated-client call (ResponseError has it on `.response`); undefined = network error. */
export const statusOf = (e: unknown): number | undefined => {
  const s = (e as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof s === "number" ? s : undefined;
};

const COLORS = ["#3b82f6", "#7c5cf0", "#c13fc4", "#0ea5a4", "#f59e0b", "#ef4444", "#10b981", "#6366f1", "#ec4899"];
const colorFor = (id: string) => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toMessage(raw: any): ChatMessage {
  return {
    id: raw.clientMsgId ?? raw.client_msg_id,
    seq: Number(raw.seq) || undefined,
    sender: String(raw.sender) === "agent" ? "agent" : "customer",
    text: raw.text,
    sentAt: new Date(Number(raw.ts) || Date.now()).toISOString(),
  };
}

/** The visitor's presence id, wherever the backend puts it (thread payload or SSE event). */
export const visitorIdOf = (raw: any): string | undefined => {
  const v = raw?.visitorId ?? raw?.visitor_id; // visitor id field
  return typeof v === "string" && v ? v : undefined;
};

/** customer messages after the last agent message = what the agent hasn't answered */
const trailingCustomer = (messages: ChatMessage[]) => {
  let n = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i].sender === "customer"; i--) n++;
  return n;
};

export function blankThread(id: string, site: string, visitorId?: string): ChatThread {
  return {
    id,
    visitorId,
    site,
    pageUrl: "", // not known yet: comes with the tracker data later
    color: colorFor(id),
    online: false, // filled in by the presence poll
    unread: 0,
    state: "queued",
    customer: {},
    messages: [],
  };
}

export function toThread(raw: any, state: ThreadState): ChatThread {
  const id: string = raw.threadId ?? raw.thread_id;
  const messages: ChatMessage[] = (raw.messages ?? []).map(toMessage);
  return {
    ...blankThread(id, raw.orgSlug ?? raw.org_slug, visitorIdOf(raw)),
    state,
    openedAt: state === "open" ? Number(raw.createdAt ?? raw.created_at) || Date.now() : undefined,
    unread: state === "open" ? 0 : trailingCustomer(messages),
    messages,
  };
}

const assignedOf = (raw: any): number | null => {
  const a = raw.assignedAgent ?? raw.assigned_agent;
  return a === null || a === undefined ? null : Number(a);
};

export const agentApi = {
  /**
   * Takes the thread and tells the visitor who you are (name + picture). Throws with status 409 if someone else got it first.
   * The visitor learns your presence channel from the backend (the `assigned` event), not from here.
   */
  assign: async (threadId: string, profile: AgentCardInput): Promise<ChatThread> => {
    const raw = await ReachoutPostmanService.routesAgentAssignThread({
      threadId,
      assignRequest: { name: profile.name, avatarUrl: profile.avatarUrl },
    });
    return { ...toThread(raw, "open"), openedAt: Date.now() };
  },

  get: async (threadId: string): Promise<{ thread: ChatThread; assignedAgent: number | null }> => {
    const raw = await ReachoutPostmanService.routesAgentGetThread({ threadId });
    return { thread: toThread(raw, "queued"), assignedAgent: assignedOf(raw) };
  },

  reply: async (threadId: string, clientMsgId: string, text: string): Promise<ChatMessage> => {
    const r = await ReachoutPostmanService.routesAgentAgentReply({
      threadId,
      sendMessageRequest: { clientMsgId, text },
    });
    return toMessage(r.message);
  },
};

// ───────────────────────── presence ─────────────────────────

/** Presence channel of a visitor: reachout_visitor_<visitorId>. */
export const visitorChannel = (visitorId: string) => `reachout_visitor_${visitorId}`;

/** Channel ids per request, keeps the query string a sane length. */
const PRESENCE_CHUNK = 40;

export interface PresenceTarget {
  threadId: string;
  visitorId: string;
}

export const presenceApi = {
  /**
   * Online status for many visitors at once (GET /channel-status?channels=a,b,c).
   * The service answers in the order of the channels we send.
   * Returns { [threadId]: online } only for the threads it got an answer for,
   * so a failed chunk keeps the last known status.
   */
  onlineMap: async (targets: PresenceTarget[]): Promise<Record<string, boolean>> => {
    const chunks: PresenceTarget[][] = [];
    for (let i = 0; i < targets.length; i += PRESENCE_CHUNK) {
      chunks.push(targets.slice(i, i + PRESENCE_CHUNK));
    }

    const results = await Promise.allSettled(
      chunks.map((chunk) =>
        GingerPresence.routesChannelStatusChannelStatus({
          channels: chunk.map((t) => visitorChannel(t.visitorId)).join(","),
        })
      )
    );

    const out: Record<string, boolean> = {};
    results.forEach((result, i) => {
      if (result.status !== "fulfilled") return;
      const chunk = chunks[i];
      const statuses = result.value.statuses;
      if (!Array.isArray(statuses) || statuses.length !== chunk.length) return; // don't guess on a mismatch
      chunk.forEach((t, j) => {
        out[t.threadId] = statuses[j] === true;
      });
    });
    return out;
  },
};
