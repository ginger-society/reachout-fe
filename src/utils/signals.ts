/**
 * Shared protocol + presence rules for visitor <-> agent live signals.
 * Zero dependencies: keep this file identical in the widget and the agent app (or move it to the shared lib).
 */

export type PresenceStatus = 'online' | 'away' | 'offline';
export type WatchLevel = 'basic' | 'full';

/** RPC the agent calls on a visitor's channel to receive its live state. */
export const RPC_WATCH_VISITOR = 'watch_visitor';

/** Show "away" (not "offline") for this long after a peer stops being reachable. */
export const PRESENCE_GRACE_MS = 10 * 60_000;
/** After an explicit goodbye (tab/window closed) wait this long before showing offline (survives reloads). */
export const BYE_GRACE_MS = 20_000;
/** A tab that claims to be visible but has been silent this long is treated as not visible. */
export const TAB_STALE_MS = 15_000;
/** A tab silent this long is forgotten completely. */
export const TAB_FORGET_MS = PRESENCE_GRACE_MS;

export const TYPING_STOP_MS = 3_000; // sender: no input for this long = stopped typing
export const TYPING_TTL_MS = 4_000; // receiver: typing flag expires after this
export const TYPING_RESEND_MS = 2_000; // sender: refresh the typing flag this often
export const WATCH_TTL_MS = 30_000;
export const WATCH_REFRESH_MS = 12_000;
export const STATE_PUSH_MS = 5_000;

// ---- visitor -> agent (published to the watcher's channel, kwargs.type) ----
export interface VisitorTabSignal {
  type: 'visitor_tab';
  /** stable per browser tab (kept in sessionStorage), so page navigations in the same tab do not create new tabs */
  tab: string;
  thread?: string;
  url: string;
  visible: boolean;
  focused: boolean;
  /** only at WatchLevel "full" */
  draft?: string;
  typing?: boolean;
}
export interface VisitorTabClosedSignal {
  type: 'visitor_tab_closed';
  tab: string;
  thread?: string;
}

// ---- agent -> visitor (published to reachout_visitor_<id>) ----
export interface AgentTypingSignal {
  type: 'agent_typing';
  typing: boolean;
  thread: string;
  /** the agent's own channel; the visitor only trusts the channel the backend assigned */
  from: string;
  /** id of the agent's browser tab / login (optional) */
  tab?: string;
}
export interface AgentStateSignal {
  type: 'agent_state';
  visible: boolean;
  from: string;
  thread?: string;
  /**
   * id of the agent's browser tab / login. SEND IT: the visitor merges several agent tabs
   * (visible if ANY tab is visible). Without it all agent tabs share one slot and overwrite each other.
   */
  tab?: string;
}
export interface AgentByeSignal {
  type: 'agent_bye';
  from: string;
  /** which agent tab said goodbye. The agent only counts as gone when no tab is left. */
  tab?: string;
}

export interface PresenceInput {
  /** presence service verdict (heartbeats). null = no answer yet */
  serviceOnline: boolean | null;
  /** from signals: is any tab / window of the peer visible? null = unknown */
  anyVisible: boolean | null;
  /** epoch ms of the last time we saw the peer alive (service said online, or any signal arrived). 0 = never */
  lastSeenAt: number;
  /** epoch ms of an explicit goodbye that has not been followed by a signal. 0 = none */
  goodbyeAt: number;
  now: number;
  graceMs?: number;
}

/**
 * online  = reachable and looking at the page
 * away    = reachable but not looking (tab hidden), or briefly unreachable (up to graceMs)
 * offline = gone: said goodbye, or unreachable for longer than graceMs
 */
export function resolvePresence(i: PresenceInput): PresenceStatus {
  if (i.goodbyeAt) return i.now - i.goodbyeAt >= BYE_GRACE_MS ? 'offline' : 'away';
  const fresh = i.lastSeenAt > 0 && i.now - i.lastSeenAt < (i.graceMs ?? PRESENCE_GRACE_MS);
  if (i.serviceOnline === true || (i.serviceOnline === null && fresh)) {
    return i.anyVisible === false ? 'away' : 'online';
  }
  return fresh ? 'away' : 'offline';
}