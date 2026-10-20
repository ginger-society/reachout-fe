import { ChatThread, VisitorLive, VisitorTab } from "@/types/chat";
import {
  PRESENCE_GRACE_MS,
  TAB_FORGET_MS,
  TAB_STALE_MS,
  TYPING_TTL_MS,
  resolvePresence,
  type VisitorTabSignal,
} from "./signals";

export const emptyLive = (): VisitorLive => ({ tabs: {}, serviceOnline: null, lastSeenAt: 0, goodbyeAt: 0 });

/** Fold one report of a visitor tab in. `now` is the local clock (the visitor's clock is never trusted). */
export function withTabSignal(live: VisitorLive, tabId: string, s: VisitorTabSignal, now: number): VisitorLive {
  const prev = live.tabs[tabId];
  const draft = typeof s.draft === "string" ? s.draft : "";
  const tab: VisitorTab = {
    url: typeof s.url === "string" ? s.url : prev?.url ?? "",
    visible: s.visible === true,
    focused: s.focused === true,
    draft,
    draftAt: draft !== (prev?.draft ?? "") ? now : prev?.draftAt ?? 0,
    typingUntil: s.typing === true ? now + TYPING_TTL_MS : 0,
    seenAt: now,
  };
  return { ...live, tabs: { ...live.tabs, [tabId]: tab }, lastSeenAt: now, goodbyeAt: 0 };
}

export function withTabClosed(live: VisitorLive, tabId: string, now: number): VisitorLive {
  const { [tabId]: _gone, ...tabs } = live.tabs;
  return { ...live, tabs, goodbyeAt: Object.keys(tabs).length === 0 ? now : live.goodbyeAt };
}

export function withService(live: VisitorLive, online: boolean, now: number): VisitorLive {
  return { ...live, serviceOnline: online, lastSeenAt: online ? now : live.lastSeenAt };
}

/**
 * Turns the raw tab reports into what the UI shows. Several tabs are merged:
 *  - page: the tab that is visible and focused, else visible, else the most recently seen
 *  - away: only when NO tab is in view (a tab that claims to be visible but went silent does not count)
 *  - draft / typing: from whichever tab the visitor typed in last
 */
export function applyLive(t: ChatThread, now: number): ChatThread {
  const live = t.live ?? emptyLive();
  const tabs = Object.values(live.tabs).filter((tab) => now - tab.seenAt < TAB_FORGET_MS);
  const inView = (tab: VisitorTab) => tab.visible && now - tab.seenAt < TAB_STALE_MS;

  const primary = [...tabs].sort(
    (a, b) =>
      Number(inView(b)) - Number(inView(a)) ||
      Number(b.focused) - Number(a.focused) ||
      b.seenAt - a.seenAt
  )[0];

  const drafting = tabs
    .filter((tab) => tab.draft.trim() !== "")
    .sort((a, b) => b.draftAt - a.draftAt)[0];

  const presence = resolvePresence({
    serviceOnline: live.serviceOnline,
    anyVisible: tabs.length ? tabs.some(inView) : null,
    lastSeenAt: live.lastSeenAt,
    goodbyeAt: live.goodbyeAt,
    now,
    graceMs: PRESENCE_GRACE_MS,
  });

  return {
    ...t,
    pageUrl: primary?.url || t.pageUrl,
    typing: tabs.some((tab) => tab.typingUntil > now),
    draft: drafting?.draft ?? "",
    tabCount: tabs.length,
    presence,
    online: presence === "online",
  };
}