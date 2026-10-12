import { ChatThread } from "@/types/chat";
import { lastMessageOf } from "@/utils/chatFormat";

/** Seconds a customer has been waiting before each urgency level kicks in. */
export const WAIT_THRESHOLDS_SEC = [20, 40, 60] as const;

/** 0 = fine, 1 = 20s+, 2 = 40s+, 3 = 60s+ */
export type WaitLevel = 0 | 1 | 2 | 3;

/**
 * Seconds since the last message, but only while the customer is the one waiting.
 * Returns null once an agent has replied (e.g. via a peek quick reply).
 */
export const waitingSeconds = (thread: ChatThread, now: number): number | null => {
  const last = lastMessageOf(thread);
  if (!last || last.sender !== "customer") return null;
  return Math.max(0, Math.floor((now - new Date(last.sentAt).getTime()) / 1000));
};

export const waitLevel = (thread: ChatThread, now: number): WaitLevel => {
  const seconds = waitingSeconds(thread, now);
  if (seconds === null) return 0;
  let level: WaitLevel = 0;
  WAIT_THRESHOLDS_SEC.forEach((threshold, i) => {
    if (seconds >= threshold) level = (i + 1) as WaitLevel;
  });
  return level;
};