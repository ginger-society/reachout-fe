import { ChatMessage, ChatThread } from "@/types/chat";

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** The visitor's name if the agent has added one, otherwise a short uuid label. */
export const displayName = (thread: ChatThread): string =>
  thread.customer.name?.trim() || `Visitor ${thread.id.slice(0, 8)}`;

export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** 2m, 18m, 1h, 3d ... */
export const shortAgo = (iso: string, now: number = Date.now()): string => {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export const lastMessageOf = (thread: ChatThread): ChatMessage | undefined =>
  thread.messages[thread.messages.length - 1];

export const lastActivityOf = (thread: ChatThread): number => {
  const last = lastMessageOf(thread);
  return last ? new Date(last.sentAt).getTime() : 0;
};

/** Only http(s) links are ever rendered as clickable. */
export const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/** https://abc.com/pricing/ -> abc.com/pricing */
export const prettyUrl = (url: string): string =>
  url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);