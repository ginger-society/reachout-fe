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

/** 12s, 2m, 18m, 1h, 3d ... */
export const shortAgo = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 1) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
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

/** Same limits as the backend (config.rs / validate_visitor_update). */
export const CUSTOMER_LIMITS = { name: 120, email: 254, phone: 32 } as const;

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Digits with an optional leading '+', spaces, '-', '(', ')', '.'; 6-15 digits (same rule as the backend). */
export const isValidPhone = (value: string): boolean => {
  const charsOk = [...value].every(
    (c, i) => /\d/.test(c) || " -().".includes(c) || (c === "+" && i === 0)
  );
  const digits = value.replace(/\D/g, "").length;
  return charsOk && digits >= 6 && digits <= 15;
};

/**
 * Time of the customer's most recent message. The queue sorts on this, so replying
 * (e.g. with a quick reply) doesn't make a chat jump to the top of the list.
 */
export const lastCustomerActivityOf = (thread: ChatThread): number => {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    if (thread.messages[i].sender === "customer") {
      return new Date(thread.messages[i].sentAt).getTime();
    }
  }
  return 0;
};