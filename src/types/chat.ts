export type { PresenceStatus } from "@/utils/signals";
import type { PresenceStatus } from "@/utils/signals";

export type SenderRole = "customer" | "agent";
export type ThreadState = "queued" | "open" | "resolved" | "transferred";
export type AgentStatus = "available" | "busy" | "away";

export interface ChatMessage {
  id: string;
  sender: SenderRole;
  text: string;
  /** ISO timestamp */
  sentAt: string;
  /** server sequence number, known once the server has the message */
  seq?: number;
  /** only set while the message is not confirmed by the server */
  status?: "sending" | "failed";
}

/** Everything is optional; filled in by the agent after picking up the chat. */
export interface CustomerDetails {
  name?: string;
  email?: string;
  phone?: string;
}

/** What one open tab of the visitor last told us. */
export interface VisitorTab {
  url: string;
  visible: boolean;
  focused: boolean;
  draft: string;
  /** when the draft last changed (local clock) */
  draftAt: number;
  /** local clock: typing counts until this moment */
  typingUntil: number;
  /** local clock of the last report from this tab */
  seenAt: number;
}

/** Raw live data per thread. The fields below it on ChatThread are derived from it every couple of seconds. */
export interface VisitorLive {
  tabs: Record<string, VisitorTab>;
  /** presence service verdict. null = no answer yet */
  serviceOnline: boolean | null;
  /** local clock: last time the visitor was seen alive (presence service or any signal) */
  lastSeenAt: number;
  /** local clock of an explicit "last tab closed" that no signal has followed. 0 = none */
  goodbyeAt: number;
}

export interface ChatThread {
  /** uuid. This is all we know about the visitor until the agent adds details. */
  id: string;
  /** presence identity of the visitor (channel is reachout_visitor_<visitorId>). Not the same as `id`. */
  visitorId?: string;
  /** website the visitor came from, e.g. "abc.com" */
  site: string;
  /** URL of the page the visitor is on right now (from the visitor's tabs; "" until they report it) */
  pageUrl: string;
  /** avatar colour used in the chat panel header */
  color: string;
  /** true only while presence === "online" */
  online: boolean;
  /** online = looking at the page, away = tab hidden / briefly unreachable, offline = gone */
  presence?: PresenceStatus;
  /** visitor is typing right now */
  typing?: boolean;
  /** what the visitor has typed but not sent yet (live) */
  draft?: string;
  /** how many tabs of the visitor are open */
  tabCount?: number;
  /** raw signal state, maintained by useChatDesk */
  live?: VisitorLive;
  unread: number;
  /** queued = left panel, open = right board, resolved / transferred = gone */
  state: ThreadState;
  /** epoch ms, set when the thread is picked up */
  openedAt?: number;
  transferredTo?: string;
  customer: CustomerDetails;
  messages: ChatMessage[];
}

export interface AgentProfile {
  id: string;
  name: string;
  email: string;
  color: string;
  status: AgentStatus;
  /** websites this agent handles */
  sites: string[];
}

/** A canned reply an agent can send from the peek panel. */
export interface QuickReply {
  id: string;
  text: string;
}