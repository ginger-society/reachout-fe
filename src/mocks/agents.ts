import { AgentProfile } from "@/types/chat";

/** The signed-in agent. Replace with your IAM user. */
export const currentAgent: AgentProfile = {
  id: "agent-1",
  name: "Arjun Menon",
  email: "arjun.menon@abc.com",
  color: "#3b82f6",
  status: "available",
  sites: ["abc.com", "xyz.com", "pqr.io"],
};

/**
 * MOCK profile picture for the signed-in agent. It is sent to the backend when the agent takes a chat, so the
 * visitor sees it in the widget header. Replace with the agent's real picture once IAM exposes one.
 * Seeded by the token subject, so the same agent always gets the same picture.
 */
export const mockAvatarFor = (sub: string): string =>
  `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(sub)}`;
