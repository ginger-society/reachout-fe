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

export interface ChatThread {
  /** uuid. This is all we know about the visitor until the agent adds details. */
  id: string;
  /** website the visitor came from, e.g. "abc.com" */
  site: string;
  /** full URL of the page the visitor is currently on */
  pageUrl: string;
  /** avatar colour used in the chat panel header */
  color: string;
  online: boolean;
  /** visitor is typing right now */
  typing?: boolean;
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